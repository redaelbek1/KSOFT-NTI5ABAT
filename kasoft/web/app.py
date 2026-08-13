from functools import wraps
from pathlib import Path
import os
import re
import threading
import zipfile
from datetime import datetime, timedelta
from io import BytesIO

from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for

from kasoft.export_ma.bulk_export import export_all
from kasoft.core.auth import (
    clear_login_attempts,
    get_bureau_id,
    get_role,
    is_admin,
    is_authenticated,
    login_blocked,
    login_user,
    logout_user,
    mourakib_bureau_allowed,
    record_failed_login,
    resolve_login,
    restrict_mourakib_payload,
)
from kasoft.core.db import init_db, record_vote, load_state as load_server_state, save_state as save_server_state
from kasoft.core.merge import merge_kasoft_states
from kasoft.core.pdf import (
    generate_pv_pdf,
    generate_rapport_pdf,
)
from kasoft.core import archive as kasoft_archive
from kasoft.core.verify import enrich_with_archive, verify_token
from kasoft.export_ma.config import ELECTIONS, REGIONS
from kasoft.export_ma.csv_export import export_selection, fetch_selection
from kasoft.export_ma.geo_service import (
    get_available_regions,
    get_circuits_communal,
    get_circuits_legislative,
    get_communes,
    get_provinces,
)
from kasoft.export_ma.cleanup import cleanup_output
from kasoft.paths import STATIC_DIR, TEMPLATES_DIR

app = Flask(
    __name__,
    template_folder=str(TEMPLATES_DIR),
    static_folder=str(STATIC_DIR),
)
app.secret_key = os.environ.get("SECRET_KEY", "kasoft-electoral-dev-key")
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# Secure cookies break login on plain HTTP (Oracle Always Free without TLS).
# Set SESSION_COOKIE_SECURE=1 or KASOFT_HTTPS=1 only when serving over HTTPS.
_https = os.environ.get("SESSION_COOKIE_SECURE", os.environ.get("KASOFT_HTTPS", "0")).lower() in (
    "1",
    "true",
    "yes",
)
if _https:
    app.config["SESSION_COOKIE_SECURE"] = True
if os.environ.get("FLASK_DEBUG", "0") != "1" or _https:
    from werkzeug.middleware.proxy_fix import ProxyFix

    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

init_db()
cleanup_output()


@app.after_request
def disable_static_cache(response):
    if request.path.startswith("/static/") or request.path == "/sw.js":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


def migrate_state_payload(data):
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


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_authenticated():
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def api_login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_authenticated():
            return jsonify({"error": "غير مصرح."}), 401
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_authenticated():
            return redirect(url_for("login", next=request.path))
        if not is_admin():
            return redirect(url_for("dashboard"))
        return view(*args, **kwargs)

    return wrapped


def api_admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not is_authenticated():
            return jsonify({"error": "غير مصرح."}), 401
        if not is_admin():
            return jsonify({"error": "غير مصرح — مسؤول فقط."}), 403
        return view(*args, **kwargs)

    return wrapped


@app.context_processor
def inject_template_globals():
    return {
        "kasoft_authenticated": is_authenticated(),
        "kasoft_is_admin": is_admin(),
        "kasoft_role": get_role() if is_authenticated() else None,
        "kasoft_bureau_id": get_bureau_id() if is_authenticated() else None,
        "asset_version": os.environ.get("ASSET_VERSION", "42"),
    }

export_state = {
    "running": False,
    "message": "",
    "progress": 0,
    "error": None,
    "file": None,
}


def _set_progress(message, progress):
    export_state["message"] = message
    export_state["progress"] = progress


def _run_bulk(types):
    try:
        zip_path, _ = export_all(types, progress_callback=_set_progress)
        export_state["file"] = str(zip_path) if zip_path else None
        if not zip_path:
            export_state["error"] = "لم يتم العثور على بيانات."
    except Exception as exc:
        export_state["error"] = str(exc)
    finally:
        export_state["running"] = False


def _parse_selection(data):
    election_key = data.get("election")
    if election_key not in ELECTIONS:
        return None, jsonify({"error": "نوع الانتخاب غير صالح."}), 400

    region = int(data.get("region", 0))
    province = int(data.get("province", 0))
    commune = int(data.get("commune", 0))
    circ = int(data.get("circ", 0))

    election = ELECTIONS[election_key]
    if election["type"] == "communal" and region == 0:
        return None, jsonify({"error": "اختر جهة للانتخابات الجماعية."}), 400

    return (election_key, region, province, commune, circ), None, None


@app.route("/")
@login_required
def index():
    return render_template("dashboard.html", active="dashboard")


@app.route("/export")
def export_results():
    return render_template("index.html", regions=REGIONS, active="export")


@app.route("/comptage")
@login_required
def comptage():
    return render_template("comptage.html", active="comptage")


@app.route("/mobile")
@login_required
def comptage_mobile():
    return render_template("comptage_mobile.html")


@app.route("/configuration")
@admin_required
def configuration():
    return render_template("configuration.html", active="config")


@app.route("/login", methods=["GET", "POST"])
def login():
    client_ip = request.remote_addr or "unknown"

    def _login_bureaux():
        state = load_server_state() or {}
        return [
            {"id": b["id"], "name": b.get("name", ""), "code": b.get("code", "")}
            for b in state.get("bureaux", [])
            if isinstance(b, dict) and b.get("id")
        ]

    if request.method == "POST":
        bureaux = _login_bureaux()
        if login_blocked(client_ip):
            return render_template(
                "login.html",
                error="محاولات كثيرة. انتظر 5 دقائق ثم أعد المحاولة.",
                bureaux=bureaux,
            )
        pin = request.form.get("pin", "")
        bureau_id = (request.form.get("bureau_id") or "").strip() or None
        role, scoped_bureau = resolve_login(pin, bureau_id)
        if role:
            clear_login_attempts(client_ip)
            login_user(role, scoped_bureau)
            nxt = request.form.get("next") or request.args.get("next")
            if nxt and nxt.startswith("/") and not nxt.startswith("//"):
                if role != "admin" and nxt.startswith("/configuration"):
                    return redirect(url_for("dashboard"))
                return redirect(nxt)
            if scoped_bureau:
                return redirect(f"/mobile?bureau={scoped_bureau}")
            return redirect(url_for("dashboard"))
        record_failed_login(client_ip)
        return render_template(
            "login.html",
            error="رمز الدخول غير صحيح.",
            bureaux=bureaux,
            selected_bureau_id=bureau_id,
        )
    return render_template("login.html", error=None, bureaux=_login_bureaux())


@app.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("login"))


@app.route("/verify", methods=["GET"])
@login_required
def verify_pv():
    if not is_admin():
        return redirect(url_for("dashboard"))
    code = (request.args.get("c") or "").strip()
    result = None
    parsed = None
    archive_meta = None
    if code:
        result = enrich_with_archive(verify_token(code))
        parsed = result.get("parsed")
        archive_meta = result.get("archive")
    return render_template(
        "verify.html",
        active="verify",
        code=code,
        result=result,
        parsed=parsed,
        archive=archive_meta,
    )


@app.route("/archive")
@login_required
def archive_list():
    if not is_admin():
        return redirect(url_for("dashboard"))
    return render_template(
        "archive.html",
        active="archive",
        entries=kasoft_archive.list_entries(),
    )


@app.route("/archive/<path:pv_num>")
@login_required
def archive_detail(pv_num):
    if not is_admin():
        return redirect(url_for("dashboard"))
    entry = kasoft_archive.get_meta(pv_num)
    if not entry:
        return render_template(
            "archive.html",
            active="archive",
            entries=kasoft_archive.list_entries(),
            error="المحضر غير موجود في الأرشيف.",
        ), 404
    return render_template("archive_detail.html", active="archive", entry=entry)


@app.route("/archive/<path:pv_num>/pdf")
@login_required
def archive_download(pv_num):
    if not is_admin():
        return jsonify({"error": "غير مصرح."}), 403
    pdf = kasoft_archive.read_pdf_bytes(pv_num)
    if not pdf:
        return jsonify({"error": "الملف غير موجود."}), 404
    return send_file(
        BytesIO(pdf),
        as_attachment=True,
        download_name=f"{pv_num}.pdf",
        mimetype="application/pdf",
    )


@app.route("/api/kasoft/archive")
@api_login_required
def api_kasoft_archive():
    if not is_admin():
        return jsonify({"error": "غير مصرح."}), 403
    return jsonify({"entries": kasoft_archive.list_entries()})


def _request_host():
    return request.host_url.rstrip("/") if request else None


def _signer_label():
    role = get_role() or "system"
    return f"{role}"


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", active="dashboard")


@app.route("/api/health")
def api_health():
    from pathlib import Path as P

    geo_cache = P(__file__).parent / "data" / "geo_disk"
    cache_files = len(list(geo_cache.glob("*.json"))) if geo_cache.is_dir() else 0
    state = load_server_state() or {}
    return jsonify({
        "ok": True,
        "bureaux": len(state.get("bureaux", [])),
        "geo_cache_files": cache_files,
    })


@app.route("/api/regions")
def api_regions():
    election = request.args.get("election")
    if not election or election not in ELECTIONS:
        return jsonify([])
    return jsonify(get_available_regions(election))


@app.route("/api/provinces")
def api_provinces():
    election = request.args.get("election")
    region = request.args.get("region", type=int)
    if not election or election not in ELECTIONS or not region:
        return jsonify([])
    try:
        return jsonify(get_provinces(election, region))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/communes")
def api_communes():
    election = request.args.get("election")
    region = request.args.get("region", type=int)
    province = request.args.get("province", type=int)
    if not all([election, region, province]) or election not in ELECTIONS:
        return jsonify([])
    try:
        return jsonify(get_communes(election, region, province))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/circuits")
def api_circuits():
    election = request.args.get("election")
    region = request.args.get("region", type=int, default=0)
    province = request.args.get("province", type=int, default=0)
    commune = request.args.get("commune", type=int, default=0)

    if not election or election not in ELECTIONS:
        return jsonify([])

    if ELECTIONS[election]["type"] == "legislative":
        try:
            return jsonify(get_circuits_legislative(election, region, province))
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
    if not commune:
        return jsonify([])
    try:
        return jsonify(get_circuits_communal(election, region, province, commune))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.route("/api/preview", methods=["POST"])
def preview_results():
    data = request.json or {}
    parsed, err_resp, err_code = _parse_selection(data)
    if err_resp is not None:
        return err_resp, err_code

    election_key, region, province, commune, circ = parsed
    rows, communal, error = fetch_selection(
        election_key, region, province, commune, circ
    )
    if error:
        status = 502 if "تعذّر الاتصال" in error else 404
        return jsonify({"error": error}), status

    return jsonify({"rows": rows, "communal": communal, "count": len(rows)})


@app.route("/api/download", methods=["POST"])
def download_csv():
    data = request.json or {}
    parsed, err_resp, err_code = _parse_selection(data)
    if err_resp is not None:
        return err_resp, err_code

    election_key, region, province, commune, circ = parsed
    labels = {
        "region": data.get("region_name", ""),
        "province": data.get("province_name", ""),
        "commune": data.get("commune_name", ""),
        "circonscription": data.get("circ_name", ""),
    }

    csv_path, row_count = export_selection(
        election_key, region, province, commune, circ, labels
    )
    if csv_path is None:
        err = row_count if isinstance(row_count, str) else "لا توجد بيانات."
        status = 502 if "تعذّر الاتصال" in err else 404
        return jsonify({"error": err}), status

    return send_file(
        csv_path,
        as_attachment=True,
        download_name="توزيع_الأصوات.csv",
        mimetype="text/csv; charset=utf-8",
    )


@app.route("/api/export-all/status")
@api_login_required
def export_all_status():
    return jsonify(export_state)


@app.route("/api/export-all", methods=["POST"])
@api_login_required
def export_all_data():
    if export_state["running"]:
        return jsonify({"error": "تصدير قيد التنفيذ بالفعل."}), 409

    data = request.json or {}
    types = data.get("types", [])
    types = [t for t in types if t in ("legislative", "communal")]
    if not types:
        return jsonify({"error": "اختر نوع انتخاب واحد على الأقل."}), 400

    export_state.update(
        running=True,
        message="بدء التصدير الكامل...",
        progress=0,
        error=None,
        file=None,
    )
    threading.Thread(target=_run_bulk, args=(types,), daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/export-all/download")
@api_login_required
def download_bulk():
    path = export_state.get("file")
    if not path or not Path(path).exists():
        return jsonify({"error": "الملف غير جاهز."}), 404
    return send_file(
        path,
        as_attachment=True,
        download_name=Path(path).name,
        mimetype="application/zip",
    )


def _validate_kasoft_payload(data):
    if not isinstance(data, dict):
        return "بيانات غير صالحة."
    if not isinstance(data.get("bureaux"), list):
        return "قائمة المكاتب غير صالحة."
    if not isinstance(data.get("partis"), list):
        return "قائمة الأحزاب غير صالحة."
    if not isinstance(data.get("mourakibs", {}), dict):
        return "بيانات المراقبين غير صالحة."
    if not isinstance(data.get("votes", {}), dict):
        return "بيانات الأصوات غير صالحة."
    if not isinstance(data.get("pv", {}), dict):
        return "بيانات المحضر غير صالحة."
    if data.get("journal") is not None and not isinstance(data.get("journal"), list):
        return "سجل العمليات غير صالح."
    for b in data["bureaux"]:
        if not isinstance(b, dict) or not str(b.get("name", "")).strip():
            return "اسم المكتب مطلوب."
    return None


@app.route("/api/kasoft/session")
@api_login_required
def kasoft_session_info():
    return jsonify({
        "token": session.get("kasoft_api_token"),
        "role": get_role(),
        "bureau_id": get_bureau_id(),
    })


@app.route("/api/kasoft/stats")
@api_login_required
def kasoft_stats():
    state = load_server_state() or {}
    bureaux = state.get("bureaux", [])
    ouverts = sum(1 for b in bureaux if b.get("status") == "ouvert")
    fermes = sum(1 for b in bureaux if b.get("status") == "ferme")
    return jsonify({
        "bureaux": len(bureaux),
        "ouverts": ouverts,
        "fermes": fermes,
        "partis": len(state.get("partis", [])),
        "journal": len(state.get("journal", [])),
    })


@app.route("/api/kasoft/clear", methods=["POST"])
@api_admin_required
def kasoft_clear():
    empty = {
        "bureaux": [],
        "partis": [],
        "mourakibs": {},
        "votes": {},
        "pv": {},
        "journal": [],
        "currentBureau": "",
        "mourakibActif": "",
    }
    save_server_state(empty)
    return jsonify({"ok": True, "state": empty})


@app.route("/api/kasoft/state", methods=["GET", "POST"])
@api_login_required
def kasoft_state():
    if request.method == "GET":
        data = load_server_state()
        if not data:
            return jsonify({})
        return jsonify(data)

    data = request.json or {}
    err = _validate_kasoft_payload(data)
    if err:
        return jsonify({"error": err}), 400
    incoming = migrate_state_payload(data)
    existing = load_server_state() or {}
    if not is_admin():
        incoming = restrict_mourakib_payload(incoming, existing)
    merged = merge_kasoft_states(existing, incoming)
    save_server_state(merged)
    return jsonify({"ok": True, "state": merged})


@app.route("/api/kasoft/load-demo", methods=["POST"])
@api_admin_required
def kasoft_load_demo():
    from kasoft.core.seed import demo_state

    state = demo_state()
    save_server_state(state)
    return jsonify({"ok": True, "state": state})


@app.route("/api/kasoft/bureaux", methods=["GET", "POST"])
@api_login_required
def kasoft_bureaux():
    if request.method == "GET":
        data = load_server_state() or {}
        return jsonify(data.get("bureaux", []))
    if not is_admin():
        return jsonify({"error": "غير مصرح — مسؤول فقط."}), 403
    payload = request.json or {}
    state = load_server_state() or {
        "bureaux": [],
        "partis": [],
        "mourakibs": {},
        "votes": {},
        "journal": [],
    }
    bureau = payload.get("bureau")
    if not bureau or not bureau.get("name"):
        return jsonify({"error": "بيانات المكتب ناقصة."}), 400

    if bureau.get("id"):
        for i, b in enumerate(state["bureaux"]):
            if b["id"] == bureau["id"]:
                state["bureaux"][i] = bureau
                break
        else:
            state["bureaux"].append(bureau)
    else:
        import secrets

        bureau["id"] = secrets.token_hex(6)
        state["bureaux"].append(bureau)
    save_server_state(state)
    return jsonify({"ok": True, "bureau": bureau})


@app.route("/api/kasoft/votes", methods=["POST"])
@api_login_required
def kasoft_post_votes():
    data = request.json or {}
    required = ("bureau_id", "parti_id", "mourakib_id", "delta", "actif")
    if not all(k in data for k in required):
        return jsonify({"error": "حقول ناقصة."}), 400
    if not mourakib_bureau_allowed(data["bureau_id"]):
        return jsonify({"error": "غير مصرح لهذا المكتب."}), 403
    state = load_server_state() or {}
    state, changed = record_vote(
        state,
        data["bureau_id"],
        data["parti_id"],
        data["mourakib_id"],
        data["delta"],
        data["actif"],
    )
    if not changed:
        return jsonify({"ok": True, "changed": False, "state": state})
    return jsonify({"ok": True, "changed": True, "state": state})


@app.route("/api/kasoft/votes/<bureau_id>", methods=["GET"])
@api_login_required
def kasoft_votes(bureau_id):
    data = load_server_state() or {}
    votes = data.get("votes", {}).get(bureau_id, {})
    return jsonify(votes)


@app.route("/api/kasoft/export-pv-pdf", methods=["POST"])
@api_login_required
def kasoft_export_pv_pdf():
    data = migrate_state_payload(request.json or {})
    bureau_id = (request.json or {}).get("bureau_id")
    if not bureau_id:
        return jsonify({"error": "معرف المكتب مطلوب."}), 400
    meta = generate_pv_pdf(
        data,
        bureau_id,
        signer=_signer_label(),
        request_host=_request_host(),
        return_meta=True,
    )
    if not meta:
        return jsonify({"error": "المكتب غير موجود."}), 404
    try:
        kasoft_archive.save_pv_archive(
            state=data,
            bureau_id=bureau_id,
            pdf_bytes=meta["pdf"],
            verify_code=meta["verify_code"],
            signer=_signer_label(),
        )
    except Exception:
        pass
    return send_file(
        BytesIO(meta["pdf"]),
        as_attachment=True,
        download_name="محضر_المكتب.pdf",
        mimetype="application/pdf",
    )


@app.route("/api/kasoft/rapport-pdf", methods=["POST"])
@api_login_required
def kasoft_rapport_pdf():
    data = migrate_state_payload(request.json or {})
    if not data.get("bureaux"):
        return jsonify({"error": "لا توجد بيانات."}), 400
    pdf = generate_rapport_pdf(
        data,
        signer=_signer_label(),
        request_host=_request_host(),
    )
    return send_file(
        BytesIO(pdf),
        as_attachment=True,
        download_name="التقرير_الإقليمي.pdf",
        mimetype="application/pdf",
    )


def _safe_zip_name(name):
    return re.sub(r"[^\w\-.]+", "_", name, flags=re.UNICODE)


@app.route("/api/kasoft/export-all-pv-zip", methods=["POST"])
@api_login_required
def kasoft_export_all_pv_zip():
    data = migrate_state_payload(request.json or {})
    bureaux = data.get("bureaux", [])
    if not bureaux:
        return jsonify({"error": "لا توجد مكاتب."}), 400

    buf = BytesIO()
    count = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for b in bureaux:
            pdf = generate_pv_pdf(
                data,
                b["id"],
                signer=_signer_label(),
                request_host=_request_host(),
            )
            if not pdf:
                continue
            code = b.get("code") or b["id"]
            fname = _safe_zip_name(f"محضر_{code}.pdf")
            zf.writestr(fname, pdf)
            count += 1

    if not count:
        return jsonify({"error": "لم يتم إنشاء أي محضر."}), 400

    buf.seek(0)
    stamp = datetime.now().strftime("%Y%m%d")
    return send_file(
        buf,
        as_attachment=True,
        download_name=f"محاضر_المكاتب_{stamp}.zip",
        mimetype="application/zip",
    )


@app.route("/sw.js")
def service_worker():
    return send_file(
        STATIC_DIR / "sw.js",
        mimetype="application/javascript",
    )
