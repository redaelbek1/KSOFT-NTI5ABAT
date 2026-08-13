#!/usr/bin/env python3
"""
Préchauffe data/geo_disk/ depuis un PC où elections.ma est accessible
(chez toi / ngrok — pas depuis une IP cloud Oracle souvent bloquée).

Usage (à la racine du projet) :
  python deploy/warm-geo-cache.py
  python deploy/warm-geo-cache.py --election legislative_2021
  KASOFT_CACHE_ONLY=0 python deploy/warm-geo-cache.py --election communal_2015
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kasoft.export_ma.config import ELECTIONS, REGIONS  # noqa: E402
from kasoft.export_ma.geo_service import (  # noqa: E402
    get_circuits_communal,
    get_circuits_legislative,
    get_communes,
    get_provinces,
)


def warm_legislative(election_key: str) -> None:
    print(f"==> {election_key} : cercles nationaux")
    national = get_circuits_legislative(election_key, 0, 0)
    print(f"    {len(national)} entrées")

    for region in REGIONS:
        rid = region["id"]
        print(f"==> région {rid} {region['name']}")
        provinces = get_provinces(election_key, rid)
        print(f"    {len(provinces)} provinces")
        for prov in provinces:
            pid = prov["id"]
            circs = get_circuits_legislative(election_key, rid, pid)
            print(f"    province {pid} {prov['name']}: {len(circs)} cercles")


def warm_communal(election_key: str, region_id: int | None = None) -> None:
    regions = REGIONS
    if region_id is not None:
        regions = [region for region in REGIONS if region["id"] == region_id]

    for region in regions:
        rid = region["id"]
        print(f"==> région {rid} {region['name']}", flush=True)
        provinces = get_provinces(election_key, rid)
        print(f"    {len(provinces)} provinces", flush=True)
        for prov in provinces:
            pid = prov["id"]
            communes = get_communes(election_key, rid, pid)
            print(
                f"    province {pid} {prov['name']}: {len(communes)} communes",
                flush=True,
            )
            for index, commune in enumerate(communes, 1):
                cid = commune["id"]
                circuits = get_circuits_communal(election_key, rid, pid, cid)
                if index % 25 == 0 or index == len(communes):
                    print(
                        f"      {index}/{len(communes)} communes "
                        f"(dernière: {cid}, {len(circuits)} cercles)",
                        flush=True,
                    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--election",
        default="legislative_2021",
        choices=sorted(ELECTIONS.keys()),
    )
    parser.add_argument("--region", type=int, choices=range(1, 13))
    args = parser.parse_args()
    election = ELECTIONS[args.election]
    if election["type"] == "legislative":
        warm_legislative(args.election)
    else:
        warm_communal(args.election, args.region)
    print("OK — fichiers dans data/geo_disk/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
