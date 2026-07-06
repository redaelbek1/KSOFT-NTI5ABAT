import asyncio
import secrets
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from kasoft.api.broadcast import register, set_event_loop, unregister
from kasoft.api.schemas import AuthIn, AuthOut, BureauCreate, StateOut, VoteIn
from kasoft.core.auth import (
    ROLE_ADMIN,
    ROLE_MOURAKIB,
    bureau_pin_matches,
    find_bureau_by_code,
    issue_api_token,
    resolve_login,
    validate_api_token,
)
from kasoft.core.db import load_state, record_vote, save_state, uses_postgresql
from kasoft.core.pdf import generate_pv_pdf, generate_rapport_pdf
from kasoft.core.txt import generate_journal_txt, generate_pv_txt, generate_rapport_txt

router = APIRouter(tags=["kasoft-phase2"])


def _migrate_payload(data: dict) -> dict:
    return {
        "bureaux": data.get("bureaux", []),
        "partis": data.get("partis", []),
        "mourakibs": data.get("mourakibs", {}),
        "votes": data.get("votes", {}),
        "pv": data.get("pv", {}),
        "journal": data.get("journal", []),
        "currentBureau": data.get("currentBureau", ""),
        "mourakibActif": data.get("mourakibActif", ""),
    }


def _auth_from_token(token: str | None) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="غير مصرح.")
    auth = validate_api_token(token)
    if not auth:
        raise HTTPException(status_code=401, detail="انتهت الجلسة.")
    return auth


def require_auth(
    authorization: Annotated[str | None, Header()] = None,
    x_kasoft_token: Annotated[str | None, Header(alias="X-Kasoft-Token")] = None,
    token: str | None = Query(None),
) -> dict:
    bearer = ""
    if authorization and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    return _auth_from_token(bearer or x_kasoft_token or token)


AuthDep = Annotated[dict, Depends(require_auth)]


def _ensure_bureau_access(auth: dict, bureau_id: str):
    if auth["role"] == ROLE_ADMIN:
        return
    scoped = auth.get("bureau_id")
    if scoped and scoped != bureau_id:
        raise HTTPException(status_code=403, detail="غير مصرح لهذا المكتب.")


@router.post("/auth/login", response_model=AuthOut)
def api_login(body: AuthIn):
    role, bureau_id = resolve_login(body.pin, body.bureau_id)
    if not role and ":" in body.pin:
        code, pin = body.pin.split(":", 1)
        code_bureau = find_bureau_by_code(code)
        if code_bureau and bureau_pin_matches(code_bureau["id"], pin):
            role, bureau_id = ROLE_MOURAKIB, code_bureau["id"]
    if not role:
        raise HTTPException(status_code=401, detail="رمز الدخول غير صحيح.")
    token = issue_api_token(role, bureau_id)
    return AuthOut(token=token, role=role, bureau_id=bureau_id)


@router.get("/bureaux")
def list_bureaux(auth: AuthDep):
    state = load_state() or {}
    bureaux = state.get("bureaux", [])
    if auth["role"] != ROLE_ADMIN and auth.get("bureau_id"):
        bureaux = [b for b in bureaux if b.get("id") == auth["bureau_id"]]
    return bureaux


@router.post("/bureaux")
def upsert_bureau(body: BureauCreate, auth: AuthDep):
    if auth["role"] != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="مسؤول فقط.")
    bureau = body.bureau
    if not bureau or not bureau.name.strip():
        raise HTTPException(status_code=400, detail="بيانات المكتب ناقصة.")
    state = load_state() or {
        "bureaux": [],
        "partis": [],
        "mourakibs": {},
        "votes": {},
        "journal": [],
        "pv": {},
    }
    data = bureau.model_dump()
    if data.get("id"):
        for i, b in enumerate(state["bureaux"]):
            if b["id"] == data["id"]:
                state["bureaux"][i] = {**b, **data}
                break
        else:
            state["bureaux"].append(data)
    else:
        data["id"] = secrets.token_hex(6)
        state["bureaux"].append(data)
    save_state(state)
    return {"ok": True, "bureau": data}


@router.get("/votes/{bureau_id}")
def get_votes(bureau_id: str, auth: AuthDep):
    _ensure_bureau_access(auth, bureau_id)
    state = load_state() or {}
    return state.get("votes", {}).get(bureau_id, {})


@router.post("/votes", response_model=StateOut)
def post_vote(body: VoteIn, auth: AuthDep):
    _ensure_bureau_access(auth, body.bureau_id)
    state = load_state() or {}
    state, changed = record_vote(
        state,
        body.bureau_id,
        body.parti_id,
        body.mourakib_id,
        body.delta,
        body.actif,
    )
    return StateOut(ok=True, changed=changed, state=state)


def _pdf_attachment(name: str) -> dict:
    ascii_name = "kasoft_export.pdf"
    encoded = quote(name)
    return {
        "Content-Disposition": f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'
    }


def _txt_attachment(name: str) -> dict:
    ascii_name = "kasoft_export.txt"
    encoded = quote(name)
    return {
        "Content-Disposition": f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'
    }


def _scoped_state(state, auth):
    if auth["role"] != ROLE_ADMIN and auth.get("bureau_id"):
        bid = auth["bureau_id"]
        return {
            **state,
            "bureaux": [b for b in state.get("bureaux", []) if b.get("id") == bid],
            "votes": {bid: state.get("votes", {}).get(bid, {})},
            "pv": {bid: state.get("pv", {}).get(bid, {})},
        }
    return state


@router.get("/export/{bureau_id}")
def export_bureau_pdf(bureau_id: str, auth: AuthDep):
    _ensure_bureau_access(auth, bureau_id)
    state = load_state() or {}
    pdf = generate_pv_pdf(state, bureau_id)
    if not pdf:
        raise HTTPException(status_code=404, detail="المكتب غير موجود.")
    return Response(
        content=bytes(pdf),
        media_type="application/pdf",
        headers=_pdf_attachment("محضر_المكتب.pdf"),
    )


@router.get("/export/{bureau_id}/txt")
def export_bureau_txt(bureau_id: str, auth: AuthDep):
    _ensure_bureau_access(auth, bureau_id)
    state = load_state() or {}
    text = generate_pv_txt(state, bureau_id)
    if not text:
        raise HTTPException(status_code=404, detail="المكتب غير موجود.")
    return Response(
        content=text.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers=_txt_attachment("محضر_المكتب.txt"),
    )


@router.get("/rapport/general")
def rapport_general(auth: AuthDep):
    state = load_state() or {}
    if not state.get("bureaux"):
        raise HTTPException(status_code=400, detail="لا توجد بيانات.")
    state = _scoped_state(state, auth)
    pdf = generate_rapport_pdf(state)
    return Response(
        content=bytes(pdf),
        media_type="application/pdf",
        headers=_pdf_attachment("التقرير_الإقليمي.pdf"),
    )


@router.get("/rapport/general/txt")
def rapport_general_txt(auth: AuthDep):
    state = load_state() or {}
    if not state.get("bureaux"):
        raise HTTPException(status_code=400, detail="لا توجد بيانات.")
    text = generate_rapport_txt(_scoped_state(state, auth))
    if not text:
        raise HTTPException(status_code=400, detail="لا توجد بيانات.")
    return Response(
        content=text.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers=_txt_attachment("التقرير_الإقليمي.txt"),
    )


@router.get("/journal/{bureau_id}/txt")
def export_journal_txt(bureau_id: str, auth: AuthDep):
    _ensure_bureau_access(auth, bureau_id)
    state = load_state() or {}
    text = generate_journal_txt(state, bureau_id)
    return Response(
        content=text.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers=_txt_attachment("سجل_العمليات.txt"),
    )


@router.get("/health")
def api_health():
    return {"ok": True, "phase": 2, "postgresql": uses_postgresql()}


@router.websocket("/ws/sync")
async def ws_sync(websocket: WebSocket, token: str = Query(default=None)):
    auth = validate_api_token(token) if token else None
    if not auth:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    register(websocket)
    state = load_state()
    if state:
        await websocket.send_json({"type": "state", "state": state})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        unregister(websocket)


def create_api_app() -> FastAPI:
    app = FastAPI(
        title="KASOFT API Phase 2",
        description="FastAPI + PostgreSQL + sync temps réel (PDF §7–9)",
        version="2.0.0",
    )
    app.include_router(router)

    @app.on_event("startup")
    async def _startup():
        set_event_loop(asyncio.get_running_loop())

    return app
