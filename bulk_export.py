import csv
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

from api_client import fetch_voix
from config import ELECTIONS, REGIONS
from geo_service import (
    get_circuits_communal,
    get_circuits_legislative,
    get_communes,
    get_provinces,
)

OUTPUT_DIR = Path(__file__).parent / "output"
MAX_WORKERS = 16

REGION_MAP = {0: "المستوى الوطني", **{r["id"]: r["name"] for r in REGIONS}}

BULK_COLUMNS_LEG = [
    ("السنة", "annee"),
    ("الجهة", "region"),
    ("العمالة_أو_الإقليم", "province"),
    ("الدائرة_الانتخابية", "circonscription"),
    ("الهيئة السياسية", "parti"),
    ("وكيل اللائحة أو المرشح", "candidat"),
    ("عدد الأصوات المحصل عليها", "voix"),
    ("عدد المقاعد", "sieges"),
]

BULK_COLUMNS_COM = [
    ("السنة", "annee"),
    ("الجهة", "region"),
    ("العمالة_أو_الإقليم", "province"),
    ("الجماعة_أو_مقاطعة", "commune"),
    ("الدائرة_الانتخابية", "circonscription"),
    ("الهيئة السياسية", "parti"),
    ("إسم وكيل اللائحة أو المرشح", "candidat"),
    ("عدد الأصوات المحصل عليها", "voix"),
]

ELECTION_KEYS = {
    "legislative": ["legislative_2021", "legislative_2016"],
    "communal": ["communal_2021", "communal_2015"],
}


def _leg_combos(election_key):
    combos = []
    for circ in get_circuits_legislative(election_key, 0, 0):
        combos.append(
            {
                "region_id": 0,
                "region_name": REGION_MAP[0],
                "province_id": 0,
                "province_name": "",
                "commune_id": 0,
                "commune_name": "",
                "circ_id": circ["id"],
                "circ_name": circ["name"],
            }
        )

    for region in REGIONS:
        rid = region["id"]
        for circ in get_circuits_legislative(election_key, rid, 0):
            if circ["id"] in (0,):
                continue
            combos.append(
                {
                    "region_id": rid,
                    "region_name": region["name"],
                    "province_id": 0,
                    "province_name": "",
                    "commune_id": 0,
                    "commune_name": "",
                    "circ_id": circ["id"],
                    "circ_name": circ["name"],
                }
            )

        for prov in get_provinces(election_key, rid):
            for circ in get_circuits_legislative(election_key, rid, prov["id"]):
                if circ["id"] in (998, 999):
                    continue
                combos.append(
                    {
                        "region_id": rid,
                        "region_name": region["name"],
                        "province_id": prov["id"],
                        "province_name": prov["name"],
                        "commune_id": 0,
                        "commune_name": "",
                        "circ_id": circ["id"],
                        "circ_name": circ["name"],
                    }
                )
    return combos


def _com_combos(election_key):
    combos = []
    for region in REGIONS:
        rid = region["id"]
        for prov in get_provinces(election_key, rid):
            for commune in get_communes(election_key, rid, prov["id"]):
                for circ in get_circuits_communal(
                    election_key, rid, prov["id"], commune["id"]
                ):
                    combos.append(
                        {
                            "region_id": rid,
                            "region_name": region["name"],
                            "province_id": prov["id"],
                            "province_name": prov["name"],
                            "commune_id": commune["id"],
                            "commune_name": commune["name"],
                            "circ_id": circ["id"],
                            "circ_name": circ["name"],
                        }
                    )
    return combos


def _fetch_combo(election_key, combo):
    election = ELECTIONS[election_key]
    return fetch_voix(
        election_key,
        combo["region_id"],
        combo["province_id"],
        combo["commune_id"],
        combo["circ_id"],
        election["c_election"],
    )


def _rows_for_combo(election_key, combo, results):
    election = ELECTIONS[election_key]
    communal = election["type"] == "communal"
    rows = []
    if not results:
        return rows

    for row in results:
        base = {
            "annee": election["year"],
            "region": combo["region_name"],
            "province": combo.get("province_name", ""),
            "commune": combo.get("commune_name", ""),
            "circonscription": combo["circ_name"],
            "parti": row.get("Nom_Partis", row.get("Name", "")),
            "candidat": row.get(
                "PrenomNom_Cand", row.get("NameCand", row.get("PrenomNom", ""))
            ),
            "voix": row.get("N_Voix", row.get("Voix", "")),
        }
        if not communal:
            base["sieges"] = row.get("N_Elus", row.get("Elus", ""))
        rows.append(base)
    return rows


def _write_csv(path, columns, rows):
    headers, keys = zip(*columns)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for row in rows:
            writer.writerow([row.get(k, "") for k in keys])


def export_all(types, progress_callback=None):
    keys = []
    if "legislative" in types:
        keys.extend(ELECTION_KEYS["legislative"])
    if "communal" in types:
        keys.extend(ELECTION_KEYS["communal"])

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = OUTPUT_DIR / f"export_complet_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    all_combos = []
    for election_key in keys:
        if progress_callback:
            progress_callback(f"تحميل المناطق: {ELECTIONS[election_key]['label']}...", 0)
        if ELECTIONS[election_key]["type"] == "legislative":
            combos = _leg_combos(election_key)
        else:
            combos = _com_combos(election_key)
        all_combos.append((election_key, combos))

    total = sum(len(c) for _, c in all_combos)
    done = 0
    failed = 0
    files = []

    for election_key, combos in all_combos:
        election = ELECTIONS[election_key]
        communal = election["type"] == "communal"
        columns = BULK_COLUMNS_COM if communal else BULK_COLUMNS_LEG
        all_rows = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {
                pool.submit(_fetch_combo, election_key, combo): combo
                for combo in combos
            }
            for future in as_completed(futures):
                combo = futures[future]
                done += 1
                if progress_callback:
                    progress_callback(
                        f"{election['label']} — {combo['region_name']} / {combo.get('province_name', '')} / {combo.get('commune_name', '')} / {combo['circ_name']}",
                        int((done / max(total, 1)) * 95),
                    )
                try:
                    results = future.result()
                    all_rows.extend(_rows_for_combo(election_key, combo, results))
                except Exception:
                    failed += 1
                    continue

        if all_rows:
            prefix = "جماعية" if communal else "تشريعية"
            csv_path = run_dir / f"توزيع_الأصوات_{prefix}_{election['year']}_كامل.csv"
            _write_csv(csv_path, columns, all_rows)
            files.append(csv_path)

    if not files:
        return None, "لم يتم العثور على بيانات."

    zip_path = OUTPUT_DIR / f"كل_البيانات_{stamp}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, f.name)

    if progress_callback:
        suffix = f" ({failed} تحذير)" if failed else ""
        progress_callback(f"اكتمل التصدير!{suffix}", 100)

    return zip_path, {"files": [str(f) for f in files], "rows": total}
