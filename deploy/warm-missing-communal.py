#!/usr/bin/env python3
"""Complète rapidement les résultats communaux absents du cache local."""
from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kasoft.export_ma.api_client import fetch_voix  # noqa: E402
from kasoft.export_ma.config import ELECTIONS  # noqa: E402
from kasoft.paths import DATA_DIR  # noqa: E402


def targets(election_key: str):
    prefix = f"circ_com_{election_key}_"
    for path in sorted((DATA_DIR / "geo_disk").glob(f"{prefix}*.json")):
        parts = path.stem[len(prefix) :].split("_")
        if len(parts) != 3:
            continue
        region, province, commune = map(int, parts)
        for circuit in json.loads(path.read_text(encoding="utf-8")):
            yield region, province, commune, int(circuit["id"])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--election", default="communal_2021")
    parser.add_argument("--workers", type=int, default=16)
    args = parser.parse_args()
    election = ELECTIONS[args.election]
    todo = list(dict.fromkeys(targets(args.election)))
    print(f"{len(todo)} circonscriptions à vérifier", flush=True)

    def warm(target):
        region, province, commune, circ = target
        rows = fetch_voix(
            args.election,
            region,
            province,
            commune,
            circ,
            election["c_election"],
        )
        return target, len(rows)

    ok = failed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(warm, target) for target in todo]
        for future in as_completed(futures):
            try:
                future.result()
                ok += 1
            except Exception as exc:
                failed += 1
                if failed <= 10:
                    print(f"ERREUR: {exc}", flush=True)
            if (ok + failed) % 100 == 0:
                print(f"{ok + failed}/{len(todo)} (erreurs: {failed})", flush=True)

    print(f"TERMINÉ ok={ok} erreurs={failed}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
