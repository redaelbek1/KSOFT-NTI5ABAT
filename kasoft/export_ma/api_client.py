import requests

BASE_URL = "https://www.elections.ma"
SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) elections-scraper/1.0",
        "Content-Type": "application/json; charset=utf-8",
    }
)


class ElectionsApiError(Exception):
    """Erreur lors de l'appel à l'API elections.ma."""


def _post(service, method, payload):
    url = f"{BASE_URL}/{service}.asmx/{method}"
    try:
        response = SESSION.post(url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get("d", [])
    except requests.RequestException as exc:
        raise ElectionsApiError(
            f"تعذّر الاتصال بموقع الانتخابات ({service}/{method})."
        ) from exc
    except ValueError as exc:
        raise ElectionsApiError("استجابة غير صالحة من خادم الانتخابات.") from exc


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
        return _post("ElectionLegislatives", "getListResultVoix", payload)
    payload = {
        "Region": int(region),
        "province": int(province),
        "Commune": int(commune),
        "Circ": int(circ),
        "C_Election": int(c_election),
    }
    return _post("Electionweb", "getResultatsPV_Com", payload)
