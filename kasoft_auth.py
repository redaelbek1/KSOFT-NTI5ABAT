import hashlib
import io
import os
import secrets
import time
from collections import defaultdict

import qrcode
from flask import session

DEFAULT_PIN = "2026"
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SEC = 300

_login_attempts = defaultdict(list)


def _expected_pin():
    return os.environ.get("KASOFT_PIN", DEFAULT_PIN)


def check_pin(pin):
    expected = _expected_pin()
    h = hashlib.sha256(str(pin).encode()).hexdigest()
    expected_hash = hashlib.sha256(expected.encode()).hexdigest()
    return h == expected_hash


def login_blocked(ip):
    now = time.time()
    attempts = [t for t in _login_attempts[ip] if now - t < LOGIN_WINDOW_SEC]
    _login_attempts[ip] = attempts
    return len(attempts) >= MAX_LOGIN_ATTEMPTS


def record_failed_login(ip):
    _login_attempts[ip].append(time.time())


def clear_login_attempts(ip):
    _login_attempts.pop(ip, None)


def login_user():
    session.permanent = True
    session["kasoft_auth"] = secrets.token_hex(16)


def is_authenticated():
    return bool(session.get("kasoft_auth"))


def make_qr_base64(text):
    img = qrcode.make(text)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    import base64

    return base64.b64encode(buf.getvalue()).decode("ascii")
