"""Listes de vote — le comptage se fait par حزب × لائحة.

Les identifiants ci-dessous remplacent les anciens identifiants de مراقب dans
``votes[bureau][parti]`` : les totaux restent la somme du dictionnaire, donc
tout le calcul existant (participation, classement, PV) fonctionne inchangé.
"""

VOTE_LISTS = [
    ("liste-regionale", "لائحة جهوية"),
    ("liste-nationale", "لائحة وطنية"),
]
VOTE_LIST_IDS = [lid for lid, _ in VOTE_LISTS]
VOTE_LIST_LABELS = dict(VOTE_LISTS)


def list_label(list_id):
    return VOTE_LIST_LABELS.get(list_id, "")


def migrate_votes(votes):
    """Reverse les anciennes voix par مراقب dans la لائحة جهوية."""
    for bureau in (votes or {}).values():
        for parti_id, bucket in list((bureau or {}).items()):
            legacy = [k for k in (bucket or {}) if k not in VOTE_LIST_IDS]
            if not legacy:
                continue
            already = any(int(bucket.get(lid) or 0) > 0 for lid in VOTE_LIST_IDS)
            carried = sum(int(bucket.get(k) or 0) for k in legacy)
            for k in legacy:
                bucket.pop(k, None)
            # Déjà converti : recompter les anciennes clés doublerait le total.
            if not already and carried:
                bucket[VOTE_LIST_IDS[0]] = carried
            bureau[parti_id] = bucket
    return votes or {}
