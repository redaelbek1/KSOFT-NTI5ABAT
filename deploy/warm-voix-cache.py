#!/usr/bin/env python3
"""
Préchauffe data/voix_disk + data/selection_disk pour réponses instantanées.

Usage (racine du projet) :
  python deploy/warm-voix-cache.py
  python deploy/warm-voix-cache.py --election legislative_2021
  python deploy/warm-voix-cache.py --election communal_2021 --communal-only
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kasoft.export_ma.config import ELECTIONS, REGIONS  # noqa: E402
from kasoft.export_ma.csv_export import fetch_selection  # noqa: E402
from kasoft.export_ma.geo_service import (  # noqa: E402
    get_circuits_legislative,
    get_provinces,
)
from kasoft.paths import DATA_DIR  # noqa: E402


def _warm_leg(election_key: str) -> None:
    election = ELECTIONS[election_key]
    c_el = election["c_election"]
    print(f"==> legislatives {election_key}")

    # Circonscriptions locales (province)
    for region in REGIONS:
        rid = region["id"]
        for prov in get_provinces(election_key, rid):
            for circ in get_circuits_legislative(election_key, rid, prov["id"]):
                cid = circ["id"]
                if cid in (0, 998, 999):
                    continue
                rows, _, err = fetch_selection(election_key, rid, prov["id"], 0, cid)
                status = "ok" if rows else f"err:{err}"
                print(f"  local r{rid} p{prov['id']} circ{cid}: {status}")

        # Circonscription régionale
        for circ in get_circuits_legislative(election_key, rid, 0):
            cid = circ["id"]
            if cid in (0, 998, 999):
                continue
            rows, _, err = fetch_selection(election_key, rid, 0, 0, cid)
            status = "ok" if rows else f"err:{err}"
            print(f"  regional r{rid} circ{cid}: {status}")

        # Agrégats région
        for special in (0, 998, 999):
            rows, _, err = fetch_selection(election_key, rid, 0, 0, special)
            n = len(rows) if rows else 0
            print(f"  agg r{rid} circ{special}: {n} {err or ''}")

    # Agrégats nationaux
    for special in (0, 998, 999):
        rows, _, err = fetch_selection(election_key, 0, 0, 0, special)
        n = len(rows) if rows else 0
        print(f"  agg national circ{special}: {n} {err or ''}")

    print(f"    c_election={c_el} done")


def _warm_communal_from_geo(election_key: str) -> None:
    """Chauffe les communes déjà présentes dans geo_disk."""
    geo = DATA_DIR / "geo_disk"
    prefix = f"circ_com_{election_key}_"
    files = sorted(geo.glob(f"{prefix}*.json"))
    print(f"==> communal {election_key} ({len(files)} fichiers geo)")
    for path in files:
        # circ_com_communal_2021_1_38_129.json -> region, province, commune
        rest = path.stem[len(prefix) :]
        parts = rest.split("_")
        if len(parts) != 3:
            continue
        region, province, commune = map(int, parts)
        circuits = json.loads(path.read_text(encoding="utf-8"))
        for circ in circuits:
            cid = int(circ["id"])
            rows, _, err = fetch_selection(
                election_key, region, province, commune, cid
            )
            status = "ok" if rows else f"err:{err}"
            print(f"  com r{region} p{province} c{commune} circ{cid}: {status}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--election", default="legislative_2021")
    parser.add_argument("--communal-only", action="store_true")
    parser.add_argument("--all", action="store_true", help="Toutes les élections")
    args = parser.parse_args()

    keys = list(ELECTIONS) if args.all else [args.election]
    for key in keys:
        if key not in ELECTIONS:
            print(f"inconnu: {key}")
            return 1
        etype = ELECTIONS[key]["type"]
        if args.communal_only and etype != "communal":
            continue
        if etype == "legislative":
            if not args.communal_only:
                _warm_leg(key)
        else:
            _warm_communal_from_geo(key)

    print("OK — cache dans data/voix_disk/ et data/selection_disk/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
