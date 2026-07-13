import json
from pathlib import Path

import requests

from kasoft.paths import DATA_DIR

BASE_URL = "https://www.elections.ma"
VOIX_CACHE_DIR = DATA_DIR / "voix_disk"

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": BASE_URL,
        "X-Requested-With": "XMLHttpRequest",
    }
)


class ElectionsApiError(Exception):
    """Erreur lors de l'appel à l'API elections.ma."""


def _cache_key(service, method, payload):
    parts = [service, method] + [f"{k}={payload[k]}" for k in sorted(payload)]
    return "_".join(str(p).replace(":", "_") for p in parts)


def _disk_get(key):
    path = VOIX_CACHE_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _disk_set(key, data):
    VOIX_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = VOIX_CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _referer(election_key):
    from kasoft.export_ma.config import ELECTIONS

    return ELECTIONS[election_key]["page_url"]


def _post_cloudscraper(service, method, payload, referer):
    """Contourne Cloudflare (nécessaire pour elections.ma)."""
    try:
        import cloudscraper
    except ImportError as exc:
        raise ElectionsApiError("cloudscraper-missing") from exc

    scraper = cloudscraper.create_scraper()
    url = f"{BASE_URL}/{service}.asmx/{method}"
    response = scraper.post(
        url,
        json=payload,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Origin": BASE_URL,
            "Referer": referer,
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=60,
    )
    if response.status_code == 403 or "Just a moment" in response.text[:200]:
        raise ElectionsApiError("cloudflare")
    response.raise_for_status()
    data = response.json()
    return data.get("d", [])


def _post_requests(service, method, payload, referer):
    url = f"{BASE_URL}/{service}.asmx/{method}"
    response = SESSION.post(url, json=payload, headers={"Referer": referer}, timeout=45)
    if response.status_code == 403 or "Just a moment" in response.text[:200]:
        raise ElectionsApiError("cloudflare")
    response.raise_for_status()
    data = response.json()
    return data.get("d", [])


def _post(service, method, payload, election_key):
    key = _cache_key(service, method, payload)
    hit = _disk_get(key)
    if hit is not None:
        return hit

    referer = _referer(election_key)
    last_err = None

    for poster in (_post_cloudscraper, _post_requests):
        try:
            data = poster(service, method, payload, referer)
            _disk_set(key, data)
            return data
        except ElectionsApiError as exc:
            last_err = exc
            if str(exc) == "cloudscraper-missing":
                continue
        except requests.RequestException as exc:
            last_err = ElectionsApiError(
                f"تعذّر الاتصال بموقع الانتخابات ({service}/{method})."
            )
            last_err.__cause__ = exc
        except ValueError as exc:
            raise ElectionsApiError("استجابة غير صالحة من خادم الانتخابات.") from exc

    if last_err and str(last_err) in ("cloudflare", "cloudscraper-missing"):
        raise ElectionsApiError(
            "موقع elections.ma محمي بـ Cloudflare. "
            f"تعذّر الاتصال ({service}/{method}). "
            "ثبّت الحزمة: pip install cloudscraper"
        ) from last_err
    if last_err:
        raise last_err
    raise ElectionsApiError(f"تعذّر الاتصال بموقع الانتخابات ({service}/{method}).")


def fetch_voix(election_key, region, province, commune, circ, c_election):
    from kasoft.export_ma.config import ELECTIONS

    election = ELECTIONS[election_key]
    if election["type"] == "legislative":
        payload = {
            "Region": int(region),
            "province": int(province),
            "Circ_Leg": int(circ),
            "C_Election": int(c_election),
        }
        return _post("ElectionLegislatives", "getListResultVoix", payload, election_key)
    payload = {
        "Region": int(region),
        "province": int(province),
        "Commune": int(commune),
        "Circ": int(circ),
        "C_Election": int(c_election),
    }
    return _post("Electionweb", "getResultatsPV_Com", payload, election_key)
