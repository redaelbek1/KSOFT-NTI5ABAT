"""Phase 3 — archive ministérielle des PV signés."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from kasoft.paths import DATA_DIR

ARCHIVE_DIR = DATA_DIR / "archive"
INDEX_PATH = ARCHIVE_DIR / "index.json"


def _safe_name(name: str) -> str:
    return re.sub(r"[^\w\-.]+", "_", name, flags=re.UNICODE)[:80] or "pv"


def _load_index() -> list[dict[str, Any]]:
    if not INDEX_PATH.exists():
        return []
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_index(entries: list[dict[str, Any]]) -> None:
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def list_entries() -> list[dict[str, Any]]:
    return sorted(_load_index(), key=lambda e: e.get("archived_at", ""), reverse=True)


def get_entry(pv_num: str) -> dict[str, Any] | None:
    needle = (pv_num or "").strip()
    for entry in _load_index():
        if entry.get("pv_num") == needle:
            return entry
    return None


def get_meta(pv_num: str) -> dict[str, Any] | None:
    entry = get_entry(pv_num)
    if not entry:
        return None
    folder = ARCHIVE_DIR / Path(str(entry.get("folder", ""))).name
    meta_path = folder / "meta.json"
    if meta_path.is_file():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return dict(entry)


def archive_path_for(pv_num: str) -> Path:
    return ARCHIVE_DIR / _safe_name(pv_num)


def save_pv_archive(
    *,
    state: dict,
    bureau_id: str,
    pdf_bytes: bytes,
    verify_code: str,
    signer: str | None = None,
) -> dict[str, Any]:
    """Enregistre PDF + snapshot JSON et met à jour l'index."""
    from kasoft.core.pdf import _bureau_total, _pv_number
    from kasoft.core.verify import parse_verify_code, votes_fingerprint

    bureau = next((b for b in state.get("bureaux", []) if b["id"] == bureau_id), None)
    if not bureau:
        raise ValueError("bureau introuvable")

    pv = (state.get("pv", {}) or {}).get(bureau_id, {}) or {}
    pv_num = _pv_number(bureau, bureau_id, pv)
    valid = _bureau_total(state, bureau_id)
    parsed = parse_verify_code(verify_code) or {}
    sig = parsed.get("sig")

    folder = archive_path_for(pv_num)
    folder.mkdir(parents=True, exist_ok=True)

    pdf_path = folder / "pv.pdf"
    meta_path = folder / "meta.json"
    snapshot_path = folder / "snapshot.json"

    pdf_path.write_bytes(pdf_bytes)

    meta = {
        "pv_num": pv_num,
        "bureau_id": bureau_id,
        "bureau_name": bureau.get("name", ""),
        "bureau_code": bureau.get("code", ""),
        "ville": bureau.get("ville", ""),
        "region": bureau.get("region", ""),
        "votes": valid,
        "verify_code": verify_code,
        "sig": sig,
        "votes_hash": votes_fingerprint(state, bureau_id),
        "signer": signer or "system",
        "archived_at": datetime.now().isoformat(timespec="seconds"),
        "pdf": "pv.pdf",
        "snapshot": "snapshot.json",
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    snapshot = {
        "bureau": bureau,
        "votes": state.get("votes", {}).get(bureau_id, {}),
        "pv": pv,
        "partis": state.get("partis", []),
        "mourakibs": {
            p["id"]: state.get("mourakibs", {}).get(p["id"], [])
            for p in state.get("partis", [])
        },
        "verify_code": verify_code,
    }
    snapshot_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    folder_key = folder.name
    entries = [e for e in _load_index() if e.get("pv_num") != pv_num]
    entries.append(
        {
            "pv_num": pv_num,
            "bureau_id": bureau_id,
            "bureau_name": meta["bureau_name"],
            "bureau_code": meta["bureau_code"],
            "votes": valid,
            "sig": sig,
            "signer": meta["signer"],
            "archived_at": meta["archived_at"],
            "folder": folder_key,
        }
    )
    _save_index(entries)
    return meta


def read_pdf_bytes(pv_num: str) -> bytes | None:
    entry = get_entry(pv_num)
    if not entry:
        return None
    folder = ARCHIVE_DIR / Path(entry.get("folder", "")).name
    pdf_path = folder / "pv.pdf"
    if pdf_path.is_file():
        return pdf_path.read_bytes()
    return None
