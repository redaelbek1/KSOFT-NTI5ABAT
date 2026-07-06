import hashlib

import io

import os

import secrets

import time

from collections import defaultdict



import qrcode

from flask import session



DEFAULT_ADMIN_PIN = "2026"

DEFAULT_MOURAKIB_PIN = "3030"

ROLE_ADMIN = "admin"

ROLE_MOURAKIB = "mourakib"

MAX_LOGIN_ATTEMPTS = 5

LOGIN_WINDOW_SEC = 300

TOKEN_TTL_SEC = 28800



_login_attempts = defaultdict(list)

_api_tokens: dict[str, dict] = {}





def _pin_hash(pin):

    return hashlib.sha256(str(pin).encode()).hexdigest()





def _admin_pin():

    return os.environ.get("KASOFT_ADMIN_PIN") or os.environ.get("KASOFT_PIN", DEFAULT_ADMIN_PIN)





def _mourakib_pin():

    return os.environ.get("KASOFT_MOURAKIB_PIN", DEFAULT_MOURAKIB_PIN)





def resolve_pin(pin):

    """Retourne admin, mourakib ou None selon le code saisi."""

    value = str(pin).strip()

    if not value:

        return None

    h = _pin_hash(value)

    if h == _pin_hash(_admin_pin()):

        return ROLE_ADMIN

    if h == _pin_hash(_mourakib_pin()):

        return ROLE_MOURAKIB

    return None





def _default_bureau_pin(bureau):

    if bureau.get("pin"):

        return str(bureau["pin"]).strip()

    code = str(bureau.get("code", ""))

    digits = "".join(c for c in code if c.isdigit())
    if digits:
        return digits.zfill(4)[-4:]
    bid = str(bureau.get("id", ""))
    return bid[-4:] if len(bid) >= 4 else "0000"


def find_bureau_by_code(code):

    if not code:

        return None

    from kasoft_db import load_state



    state = load_state() or {}

    needle = str(code).strip().lower()

    for bureau in state.get("bureaux", []):

        if str(bureau.get("code", "")).strip().lower() == needle:

            return bureau

    return None





def bureau_pin_matches(bureau_id, pin):

    from kasoft_db import load_state



    state = load_state() or {}

    bureau = next((b for b in state.get("bureaux", []) if b.get("id") == bureau_id), None)

    if not bureau:

        return False

    expected = _default_bureau_pin(bureau)

    return str(pin).strip() == expected


def find_bureau_by_pin(pin):
    """Trouve un bureau unique si le PIN correspond (ex. 0001 pour RB-001)."""
    from kasoft_db import load_state

    value = str(pin).strip()
    if not value:
        return None
    state = load_state() or {}
    matches = [
        b for b in state.get("bureaux", [])
        if isinstance(b, dict) and b.get("id") and bureau_pin_matches(b["id"], value)
    ]
    if len(matches) == 1:
        return matches[0]
    return None


def resolve_login(pin, bureau_id=None):
    """
    Phase 2 — admin global, mourakib global + bureau, ou PIN bureau seul.
    """
    value = str(pin).strip()
    if not value:
        return None, None

    if ":" in value:
        code_part, pin_part = value.split(":", 1)
        code_bureau = find_bureau_by_code(code_part.strip())
        if code_bureau and bureau_pin_matches(code_bureau["id"], pin_part.strip()):
            return ROLE_MOURAKIB, code_bureau["id"]

    role = resolve_pin(value)
    if role == ROLE_ADMIN:
        return ROLE_ADMIN, None

    if bureau_id and bureau_pin_matches(bureau_id, value):
        return ROLE_MOURAKIB, bureau_id

    if role == ROLE_MOURAKIB:
        return ROLE_MOURAKIB, bureau_id or None

    if not bureau_id:
        bureau = find_bureau_by_pin(value)
        if bureau:
            return ROLE_MOURAKIB, bureau["id"]

    return None, None


def issue_api_token(role, bureau_id=None):

    _purge_expired_tokens()

    token = secrets.token_hex(24)

    _api_tokens[token] = {

        "role": role,

        "bureau_id": bureau_id,

        "exp": time.time() + TOKEN_TTL_SEC,

    }

    return token





def validate_api_token(token):

    if not token:

        return None

    _purge_expired_tokens()

    data = _api_tokens.get(token)

    if not data or data["exp"] < time.time():

        _api_tokens.pop(token, None)

        return None

    return data





def _purge_expired_tokens():

    now = time.time()

    expired = [k for k, v in _api_tokens.items() if v["exp"] < now]

    for k in expired:

        _api_tokens.pop(k, None)





def check_pin(pin):

    return resolve_pin(pin) is not None





def login_blocked(ip):

    now = time.time()

    attempts = [t for t in _login_attempts[ip] if now - t < LOGIN_WINDOW_SEC]

    _login_attempts[ip] = attempts

    return len(attempts) >= MAX_LOGIN_ATTEMPTS





def record_failed_login(ip):

    _login_attempts[ip].append(time.time())





def clear_login_attempts(ip):

    _login_attempts.pop(ip, None)





def login_user(role, bureau_id=None):

    session.permanent = True

    session["kasoft_auth"] = secrets.token_hex(16)

    session["kasoft_role"] = role

    session["kasoft_bureau_id"] = bureau_id

    session["kasoft_api_token"] = issue_api_token(role, bureau_id)





def logout_user():

    token = session.pop("kasoft_api_token", None)

    if token:

        _api_tokens.pop(token, None)

    session.pop("kasoft_auth", None)

    session.pop("kasoft_role", None)

    session.pop("kasoft_bureau_id", None)





def is_authenticated():

    return bool(session.get("kasoft_auth"))





def get_role():

    if not is_authenticated():

        return None

    return session.get("kasoft_role") or ROLE_ADMIN





def get_bureau_id():

    if not is_authenticated():

        return None

    return session.get("kasoft_bureau_id")





def is_admin():

    return is_authenticated() and get_role() == ROLE_ADMIN





def is_mourakib():

    return is_authenticated() and get_role() == ROLE_MOURAKIB





def mourakib_bureau_allowed(bureau_id):

    if is_admin():

        return True

    if not is_mourakib():

        return False

    scoped = get_bureau_id()

    return not scoped or scoped == bureau_id





def restrict_mourakib_payload(incoming, existing):

    """Le mourakib ne peut synchroniser que comptage, journal, PV et statut bureau."""

    if not existing:

        return incoming

    safe = dict(existing)

    for key in ("votes", "journal", "pv", "currentBureau", "mourakibActif"):

        if key in incoming:

            safe[key] = incoming[key]

    existing_by_id = {

        b["id"]: b for b in existing.get("bureaux", []) if isinstance(b, dict) and b.get("id")

    }

    incoming_by_id = {

        b["id"]: b for b in incoming.get("bureaux", []) if isinstance(b, dict) and b.get("id")

    }

    allowed_status = {"ouvert", "ferme", "attente"}

    bureaux = []

    scoped = get_bureau_id()

    for bid, bureau in existing_by_id.items():

        if scoped and bid != scoped:

            bureaux.append(dict(bureau))

            continue

        merged = dict(bureau)

        inc = incoming_by_id.get(bid, {})

        if inc.get("status") in allowed_status:

            merged["status"] = inc["status"]

        bureaux.append(merged)

    safe["bureaux"] = bureaux

    return safe





def make_qr_base64(text):

    img = qrcode.make(text)

    buf = io.BytesIO()

    img.save(buf, format="PNG")

    import base64



    return base64.b64encode(buf.getvalue()).decode("ascii")


