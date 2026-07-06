"""Fusion d'états KASOFT pour sync multi-appareils (last-write + max votes)."""


def _max_int(a, b, default=0):
    try:
        va = int(a)
    except (TypeError, ValueError):
        va = default
    try:
        vb = int(b)
    except (TypeError, ValueError):
        vb = default
    return max(va, vb)


def _merge_bureau(local, remote):
    local = local or {}
    remote = remote or {}
    merged = {**remote, **local, "id": local.get("id") or remote.get("id")}
    for key in ("name", "ville", "region", "code", "centre", "adresse"):
        merged[key] = (local.get(key) or remote.get(key) or "").strip() or merged.get(key, "")
    merged["inscrits"] = _max_int(local.get("inscrits"), remote.get("inscrits"))
    merged["capacite"] = _max_int(
        local.get("capacite"),
        remote.get("capacite"),
        merged["inscrits"],
    )
    status = local.get("status"), remote.get("status")
    if "ferme" in status:
        merged["status"] = "ferme"
    elif "ouvert" in status:
        merged["status"] = "ouvert"
    else:
        merged["status"] = local.get("status") or remote.get("status") or "attente"
    return merged


def _journal_latest_ms(journal):
    latest = 0.0
    for entry in journal or []:
        if not isinstance(entry, dict) or not entry.get("time"):
            continue
        try:
            from datetime import datetime

            t = datetime.fromisoformat(entry["time"]).timestamp()
            latest = max(latest, t)
        except (TypeError, ValueError):
            continue
    return latest


def _merge_votes(local_votes, remote_votes, local_journal=None, remote_journal=None):
    local_t = _journal_latest_ms(local_journal)
    remote_t = _journal_latest_ms(remote_journal)
    if remote_t > local_t:
        import copy

        return copy.deepcopy(remote_votes or {})
    if local_t > remote_t:
        import copy

        return copy.deepcopy(local_votes or {})

    merged = {}
    bureau_ids = set(local_votes or {}) | set(remote_votes or {})
    for bid in bureau_ids:
        local_b = (local_votes or {}).get(bid, {})
        remote_b = (remote_votes or {}).get(bid, {})
        merged[bid] = {}
        parti_ids = set(local_b) | set(remote_b)
        for pid in parti_ids:
            local_p = local_b.get(pid, {})
            remote_p = remote_b.get(pid, {})
            merged[bid][pid] = {}
            mourakib_ids = set(local_p) | set(remote_p)
            for mid in mourakib_ids:
                rv = remote_p.get(mid)
                lv = local_p.get(mid)
                if remote_t >= local_t and rv is not None:
                    merged[bid][pid][mid] = _max_int(rv, 0)
                elif lv is not None:
                    merged[bid][pid][mid] = _max_int(lv, 0)
                else:
                    merged[bid][pid][mid] = _max_int(lv, rv)
    return merged


def _merge_journal(local_journal, remote_journal):
    seen = {}
    for entry in (remote_journal or []) + (local_journal or []):
        if not isinstance(entry, dict):
            continue
        key = (
            entry.get("time"),
            entry.get("bureauId"),
            entry.get("parti"),
            entry.get("mourakib"),
            entry.get("action"),
        )
        seen[key] = entry
    items = sorted(seen.values(), key=lambda e: e.get("time") or "", reverse=True)
    return items[:50]


def _merge_pv(local_pv, remote_pv):
    merged = {}
    bureau_ids = set(local_pv or {}) | set(remote_pv or {})
    for bid in bureau_ids:
        local_p = (local_pv or {}).get(bid, {}) or {}
        remote_p = (remote_pv or {}).get(bid, {}) or {}
        entry = {**remote_p, **local_p}
        for field in ("blancs", "nuls", "votants"):
            entry[field] = _max_int(local_p.get(field), remote_p.get(field))
        if not entry.get("numero"):
            entry["numero"] = local_p.get("numero") or remote_p.get("numero") or ""
        merged[bid] = entry
    return merged


def _merge_partis(local_partis, remote_partis):
    by_id = {p["id"]: p for p in (remote_partis or []) if isinstance(p, dict) and p.get("id")}
    for parti in local_partis or []:
        if not isinstance(parti, dict) or not parti.get("id"):
            continue
        pid = parti["id"]
        if pid in by_id:
            existing = by_id[pid]
            by_id[pid] = {
                **existing,
                **parti,
                "name": (parti.get("name") or existing.get("name") or "").strip(),
                "color": parti.get("color") or existing.get("color"),
            }
        else:
            by_id[pid] = parti
    return list(by_id.values())


def _merge_mourakibs(local_m, remote_m):
    merged = dict(remote_m or {})
    for pid, mourakibs in (local_m or {}).items():
        remote_list = {m["id"]: m for m in merged.get(pid, []) if isinstance(m, dict) and m.get("id")}
        for mourakib in mourakibs or []:
            if not isinstance(mourakib, dict) or not mourakib.get("id"):
                continue
            mid = mourakib["id"]
            if mid in remote_list:
                remote_list[mid] = {**remote_list[mid], **mourakib}
            else:
                remote_list[mid] = mourakib
        merged[pid] = list(remote_list.values())
    return merged


def merge_kasoft_states(local, remote):
    if not remote:
        return local
    if not local:
        return remote

    local_b = {b["id"]: b for b in local.get("bureaux", []) if b.get("id")}
    remote_b = {b["id"]: b for b in remote.get("bureaux", []) if b.get("id")}
    bureau_ids = set(local_b) | set(remote_b)
    bureaux = [
        _merge_bureau(local_b.get(bid, {}), remote_b.get(bid, {}))
        for bid in bureau_ids
        if local_b.get(bid) or remote_b.get(bid)
    ]

    return {
        "bureaux": bureaux,
        "partis": _merge_partis(local.get("partis"), remote.get("partis")),
        "mourakibs": _merge_mourakibs(local.get("mourakibs"), remote.get("mourakibs")),
        "votes": _merge_votes(
            local.get("votes"),
            remote.get("votes"),
            local.get("journal"),
            remote.get("journal"),
        ),
        "pv": _merge_pv(local.get("pv"), remote.get("pv")),
        "journal": _merge_journal(local.get("journal"), remote.get("journal")),
        "currentBureau": local.get("currentBureau") or remote.get("currentBureau") or "",
        "mourakibActif": local.get("mourakibActif") or remote.get("mourakibActif") or "",
    }
