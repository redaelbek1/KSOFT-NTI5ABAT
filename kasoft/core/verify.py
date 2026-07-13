"""Phase 3 — codes de vérification HMAC + URL QR."""
from __future__ import annotations

import hashlib
import hmac
import os
from datetime import datetime
from typing import Any
from urllib.parse import quote


def _secret() -> bytes:
    return os.environ.get("SECRET_KEY", "kasoft-electoral-dev-key").encode("utf-8")


def _stamp(dt: datetime | None = None) -> str:
    return (dt or datetime.now()).strftime("%Y%m%d")


def _hmac_short(message: str) -> str:
    digest = hmac.new(_secret(), message.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest[:16]


def votes_fingerprint(state: dict, bureau_id: str) -> str:
    """Empreinte stable des voix d'un bureau."""
    from kasoft.core.pdf import _bureau_votes

    votes = _bureau_votes(state, bureau_id)
    parts = [f"{pid}:{votes[pid]}" for pid in sorted(votes)]
    raw = "|".join(parts) or "empty"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def build_pv_message(pv_num: str, bureau_id: str, valid: int, date_stamp: str) -> str:
    return f"PV|{pv_num}|{bureau_id}|{valid}|{date_stamp}"


def build_rapport_message(total_valid: int, date_stamp: str) -> str:
    return f"RAPPORT|{total_valid}|{date_stamp}"


def sign_pv(pv_num: str, bureau_id: str, valid: int, date_stamp: str | None = None) -> str:
    stamp = date_stamp or _stamp()
    msg = build_pv_message(pv_num, bureau_id, int(valid), stamp)
    sig = _hmac_short(msg)
    return f"KASOFT|PV|{pv_num}|{bureau_id}|{valid}|{stamp}|{sig}"


def sign_rapport(total_valid: int, date_stamp: str | None = None) -> str:
    stamp = date_stamp or _stamp()
    msg = build_rapport_message(int(total_valid), stamp)
    sig = _hmac_short(msg)
    return f"KASOFT|RAPPORT|{total_valid}|{stamp}|{sig}"


def public_base_url(request_host: str | None = None) -> str:
    env = (os.environ.get("KASOFT_PUBLIC_URL") or "").rstrip("/")
    if env:
        return env
    if request_host:
        host = request_host.rstrip("/")
        if host.startswith("http://") or host.startswith("https://"):
            return host
        scheme = "https" if os.environ.get("KASOFT_HTTPS", "0") in ("1", "true", "yes") else "http"
        return f"{scheme}://{host}"
    return ""


def qr_payload(verify_code: str, request_host: str | None = None) -> str:
    """Contenu du QR : URL /verify si base connue, sinon le code brut."""
    base = public_base_url(request_host)
    if base:
        return f"{base}/verify?c={quote(verify_code, safe='')}"
    return verify_code


def parse_verify_code(code: str) -> dict[str, Any] | None:
    raw = (code or "").strip()
    if not raw:
        return None
    # Strip URL wrapper if pasted
    if "/verify?c=" in raw:
        raw = raw.split("/verify?c=", 1)[1].split("&", 1)[0]
        from urllib.parse import unquote

        raw = unquote(raw)

    parts = raw.split("|")
    if not parts or parts[0] != "KASOFT":
        return None

    # Phase 3 signed PV: KASOFT|PV|pv_num|bureau_id|votes|date|sig
    if len(parts) >= 7 and parts[1] == "PV":
        return {
            "kind": "pv",
            "signed": True,
            "pv_num": parts[2],
            "bureau_id": parts[3],
            "votes": int(parts[4]) if str(parts[4]).isdigit() else parts[4],
            "date": parts[5],
            "sig": parts[6],
            "code": raw,
            "message": build_pv_message(parts[2], parts[3], int(parts[4]), parts[5])
            if str(parts[4]).isdigit()
            else None,
        }

    # Phase 3 signed rapport: KASOFT|RAPPORT|votes|date|sig
    if len(parts) >= 5 and parts[1] == "RAPPORT":
        return {
            "kind": "rapport",
            "signed": True,
            "votes": int(parts[2]) if str(parts[2]).isdigit() else parts[2],
            "date": parts[3],
            "sig": parts[4],
            "code": raw,
            "message": build_rapport_message(int(parts[2]), parts[3])
            if str(parts[2]).isdigit()
            else None,
        }

    # Legacy Phase 2 PV: KASOFT|pv_num|bureau_id|votes|date
    if len(parts) >= 5 and parts[1] != "RAPPORT":
        return {
            "kind": "pv",
            "signed": False,
            "pv_num": parts[1],
            "bureau_id": parts[2],
            "votes": int(parts[3]) if str(parts[3]).isdigit() else parts[3],
            "date": parts[4],
            "sig": None,
            "code": raw,
            "message": None,
        }

    # Legacy rapport: KASOFT|RAPPORT|votes|date
    if len(parts) >= 4 and parts[1] == "RAPPORT":
        return {
            "kind": "rapport",
            "signed": False,
            "votes": int(parts[2]) if str(parts[2]).isdigit() else parts[2],
            "date": parts[3],
            "sig": None,
            "code": raw,
            "message": None,
        }

    return None


def verify_token(code: str) -> dict[str, Any]:
    """
    Vérifie un code. Retourne dict avec:
      ok, status (valid|invalid|unsigned|malformed), parsed, detail
    """
    parsed = parse_verify_code(code)
    if not parsed:
        return {
            "ok": False,
            "status": "malformed",
            "parsed": None,
            "detail": "رمز غير صالح أو تالف.",
        }

    if not parsed.get("signed"):
        return {
            "ok": False,
            "status": "unsigned",
            "parsed": parsed,
            "detail": "رمز قديم بدون توقيع رقمي (Phase 2). أعد تصدير المحضر من الخادم.",
        }

    if str(parsed.get("sig") or "").upper() == "CLIENT":
        return {
            "ok": False,
            "status": "unsigned",
            "parsed": parsed,
            "detail": "رمز صادر من المتصفح بدون HMAC. صدّر محضر PDF من الخادم للتوقيع الرقمي.",
        }

    message = parsed.get("message")
    if not message or not parsed.get("sig"):
        return {
            "ok": False,
            "status": "malformed",
            "parsed": parsed,
            "detail": "رمز غير مكتمل.",
        }

    expected = _hmac_short(message)
    if not hmac.compare_digest(expected, str(parsed["sig"])):
        return {
            "ok": False,
            "status": "invalid",
            "parsed": parsed,
            "detail": "التوقيع الرقمي غير مطابق — ربما تم تعديل المحضر.",
        }

    return {
        "ok": True,
        "status": "valid",
        "parsed": parsed,
        "detail": "التوقيع الرقمي صالح.",
    }


def enrich_with_archive(result: dict[str, Any]) -> dict[str, Any]:
    """Ajoute métadonnées d'archive si présentes."""
    from kasoft.core import archive as arch

    parsed = result.get("parsed") or {}
    pv_num = parsed.get("pv_num")
    if pv_num:
        entry = arch.get_entry(pv_num)
        if entry:
            result["archive"] = entry
    return result
