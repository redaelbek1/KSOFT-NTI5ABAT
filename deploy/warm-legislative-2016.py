#!/usr/bin/env python3
"""Préchauffe rapidement les résultats législatifs 2016 depuis geo_disk."""
from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
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

ELECTION = "legislative_2016"


def targets():
    for region in REGIONS:
        rid = region["id"]
        for circ in get_circuits_legislative(ELECTION, rid, 0):
            cid = circ["id"]
            if cid not in (0, 998, 999):
                yield (rid, 0, 0, cid)
        for prov in get_provinces(ELECTION, rid):
            for circ in get_circuits_legislative(ELECTION, rid, prov["id"]):
                cid = circ["id"]
                if cid not in (0, 998, 999):
                    yield (rid, prov["id"], 0, cid)


def main() -> int:
    todo = list(dict.fromkeys(targets()))
    print(f"{len(todo)} circonscriptions à chauffer", flush=True)

    def warm(item):
        region, province, commune, circ = item
        rows, _, err = fetch_selection(ELECTION, region, province, commune, circ)
        if err:
            raise RuntimeError(err)
        return len(rows or [])

    ok = failed = 0
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(warm, item) for item in todo]
        for future in as_completed(futures):
            try:
                future.result()
                ok += 1
            except Exception as exc:
                failed += 1
                if failed <= 15:
                    print(f"ERREUR: {exc}", flush=True)
            done = ok + failed
            if done % 20 == 0 or done == len(todo):
                print(f"{done}/{len(todo)} (erreurs: {failed})", flush=True)

    # Agrégats nationaux / régionaux (sélection 0/998/999)
    for special in (0, 998, 999):
        rows, _, err = fetch_selection(ELECTION, 0, 0, 0, special)
        print(f"national circ{special}: {len(rows or [])} {err or 'ok'}", flush=True)
        for region in REGIONS:
            rows, _, err = fetch_selection(ELECTION, region["id"], 0, 0, special)
            print(
                f"region {region['id']} circ{special}: {len(rows or [])} {err or 'ok'}",
                flush=True,
            )

    print(f"TERMINÉ ok={ok} erreurs={failed}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
