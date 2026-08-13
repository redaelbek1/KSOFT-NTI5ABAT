import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from kasoft.export_ma.api_client import ElectionsApiError, fetch_voix
from kasoft.export_ma.config import ELECTIONS, REGIONS
from kasoft.export_ma.geo_service import (
    get_circuits_communal,
    get_circuits_legislative,
    get_provinces,
)

from kasoft.paths import DATA_DIR, OUTPUT_DIR

SELECTION_CACHE_DIR = DATA_DIR / "selection_disk"

# تشريعية — 4 colonnes comme elections.ma
COLUMNS_LEGISLATIVE = [
    ("الهيئة السياسية", "parti"),
    ("وكيل اللائحة أو المرشح", "candidat"),
    ("عدد الأصوات المحصل عليها", "voix"),
    ("عدد المقاعد", "sieges"),
]

# جماعية — 3 colonnes comme elections.ma
COLUMNS_COMMUNAL = [
    ("الهيئة السياسية", "parti"),
    ("إسم وكيل اللائحة أو المرشح", "candidat"),
    ("عدد الأصوات المحصل عليها", "voix"),
]

# Options « agrégées » du site officiel (l'API renvoie [] pour ces ids)
_SPECIAL_CIRC = frozenset({0, 998, 999})
_EXPAND_WORKERS = 12


def _voix_rows(results, communal=False):
    rows = []
    for row in results:
        item = {
            "parti": row.get("Nom_Partis", row.get("Name", "")),
            "candidat": row.get(
                "PrenomNom_Cand", row.get("NameCand", row.get("PrenomNom", ""))
            ),
            "voix": row.get("N_Voix", row.get("Voix", "")),
        }
        if not communal:
            item["sieges"] = row.get("N_Elus", row.get("Elus", ""))
        rows.append(item)
    return rows


def _as_int(value):
    try:
        return int(str(value).replace(",", "").strip() or 0)
    except (TypeError, ValueError):
        return 0


def _aggregate_by_parti(rows, communal=False):
    """Regroupe les listes multi-circonscriptions par parti (somme voix / sièges)."""
    buckets = {}
    order = []
    for row in rows:
        parti = row.get("parti") or ""
        if parti not in buckets:
            buckets[parti] = {
                "parti": parti,
                "candidat": "—",
                "voix": 0,
            }
            if not communal:
                buckets[parti]["sieges"] = 0
            order.append(parti)
        buckets[parti]["voix"] += _as_int(row.get("voix"))
        if not communal:
            buckets[parti]["sieges"] += _as_int(row.get("sieges"))
    return [buckets[p] for p in order]


def _is_real_circuit(circ_id):
    return circ_id not in _SPECIAL_CIRC


def _local_leg_targets(election_key, region_id=None):
    """Toutes les circonscriptions locales (niveau province)."""
    targets = []
    regions = REGIONS if region_id is None else [r for r in REGIONS if r["id"] == region_id]
    for region in regions:
        rid = region["id"]
        for prov in get_provinces(election_key, rid):
            for circ in get_circuits_legislative(election_key, rid, prov["id"]):
                if _is_real_circuit(circ["id"]):
                    targets.append((rid, prov["id"], 0, circ["id"]))
    return targets


def _regional_leg_targets(election_key, region_id=None):
    """Circonscriptions régionales (listes جهوية)."""
    targets = []
    regions = REGIONS if region_id is None else [r for r in REGIONS if r["id"] == region_id]
    for region in regions:
        rid = region["id"]
        for circ in get_circuits_legislative(election_key, rid, 0):
            if _is_real_circuit(circ["id"]):
                targets.append((rid, 0, 0, circ["id"]))
    return targets


def _expand_targets(election_key, region, province, commune, circ):
    """
    Résout une sélection (y compris جميع الدوائر / محلية / جهوية)
    en une liste de (region, province, commune, circ) réels.
    """
    election = ELECTIONS[election_key]
    communal = election["type"] == "communal"

    if communal:
        if _is_real_circuit(circ):
            return [(region, province, commune, circ)]
        circuits = get_circuits_communal(election_key, region, province, commune)
        return [
            (region, province, commune, c["id"])
            for c in circuits
            if _is_real_circuit(c["id"])
        ]

    if _is_real_circuit(circ):
        return [(region, province, 0, circ)]

    # 999 = الدوائر الجهوية
    if circ == 999:
        return _regional_leg_targets(
            election_key, None if region == 0 else region
        )

    # 0 / 998 = جميع الدوائر / الدوائر المحلية
    if province:
        return [
            (region, province, 0, c["id"])
            for c in get_circuits_legislative(election_key, region, province)
            if _is_real_circuit(c["id"])
        ]
    if region:
        return _local_leg_targets(election_key, region)
    return _local_leg_targets(election_key, None)


def _selection_cache_key(election_key, region, province, commune, circ):
    return f"{election_key}_r{region}_p{province}_c{commune}_circ{circ}"


def _selection_cache_get(key):
    path = SELECTION_CACHE_DIR / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _selection_cache_set(key, rows):
    SELECTION_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = SELECTION_CACHE_DIR / f"{key}.json"
    path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")


def _fetch_many(election_key, targets, c_election):
    if not targets:
        return []
    if len(targets) == 1:
        r, p, c, circ = targets[0]
        return fetch_voix(election_key, r, p, c, circ, c_election)

    results = []
    errors = []

    def _one(target):
        r, p, c, circ = target
        return fetch_voix(election_key, r, p, c, circ, c_election)

    workers = min(_EXPAND_WORKERS, len(targets))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_one, t): t for t in targets}
        for fut in as_completed(futures):
            try:
                chunk = fut.result()
                if chunk:
                    results.extend(chunk)
            except ElectionsApiError as exc:
                errors.append(exc)

    if not results and errors:
        raise errors[0]
    return results


def fetch_selection(election_key, region, province, commune, circ):
    election = ELECTIONS[election_key]
    communal = election["type"] == "communal"
    cache_key = _selection_cache_key(election_key, region, province, commune, circ)
    cached = _selection_cache_get(cache_key)
    if cached is not None:
        return cached, communal, None

    try:
        targets = _expand_targets(election_key, region, province, commune, circ)
        results = _fetch_many(election_key, targets, election["c_election"])
    except ElectionsApiError as exc:
        return None, communal, str(exc)
    except RuntimeError as exc:
        return None, communal, str(exc)

    rows = _voix_rows(results, communal=communal)
    if len(targets) > 1:
        rows = _aggregate_by_parti(rows, communal=communal)
    if not rows:
        return None, communal, "لا توجد بيانات لهذا الاختيار. جرّب اختيار دائرة انتخابية محددة."
    _selection_cache_set(cache_key, rows)
    return rows, communal, None


def export_selection(election_key, region, province, commune, circ, labels):
    rows, communal, error = fetch_selection(
        election_key, region, province, commune, circ
    )
    if error:
        return None, error

    columns = COLUMNS_COMMUNAL if communal else COLUMNS_LEGISLATIVE

    headers, keys = zip(*columns)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row[k] for k in keys])

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    prefix = "جماعية" if communal else "تشريعية"
    csv_path = OUTPUT_DIR / f"توزيع_الأصوات_{prefix}_{stamp}.csv"
    csv_path.write_text("\ufeff" + buf.getvalue(), encoding="utf-8")

    return csv_path, len(rows)
