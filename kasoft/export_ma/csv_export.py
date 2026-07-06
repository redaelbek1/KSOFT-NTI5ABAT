import csv
import io
from datetime import datetime
from pathlib import Path

from kasoft.export_ma.api_client import ElectionsApiError, fetch_voix
from kasoft.export_ma.config import ELECTIONS

from kasoft.paths import OUTPUT_DIR

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


def fetch_selection(election_key, region, province, commune, circ):
    election = ELECTIONS[election_key]
    communal = election["type"] == "communal"
    try:
        results = fetch_voix(
            election_key, region, province, commune, circ, election["c_election"]
        )
    except ElectionsApiError as exc:
        return None, communal, str(exc)
    rows = _voix_rows(results, communal=communal)
    if not rows:
        return None, communal, "لا توجد بيانات لهذا الاختيار. جرّب اختيار دائرة انتخابية محددة."
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
