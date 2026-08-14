"""Détection appareil — version téléphone vs PC."""
import re

from flask import request, session

_MOBILE_UA = re.compile(
    r"Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile",
    re.I,
)


def _view_override():
    """?view=phone|pc ou préférence session."""
    q = (request.args.get("view") or "").strip().lower()
    if q in ("phone", "pc"):
        session["kasoft_view"] = q
        return q
    return (session.get("kasoft_view") or "").strip().lower()


def is_phone_request():
    """True si la requête doit utiliser l'interface téléphone."""
    override = _view_override()
    if override == "pc":
        return False
    if override == "phone":
        return True
    ua = request.headers.get("User-Agent", "")
    if _MOBILE_UA.search(ua):
        return True
    # Petits écrans sans UA mobile explicite (DevTools)
    if request.args.get("mobile") == "1":
        return True
    return False
