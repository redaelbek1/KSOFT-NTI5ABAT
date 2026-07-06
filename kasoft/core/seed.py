"""Données de démonstration pour tests locaux."""

PARTY_COLORS = ["#5b7c99", "#c62828", "#2e7d32"]


def demo_state():
    return {
        "bureaux": [
            {
                "id": "demo-b1",
                "name": "مكتب الاقتراع 1 — الرباط",
                "ville": "الرباط",
                "region": "الرباط -سلا -القنيطرة",
                "code": "RB-001",
                "centre": "ثانوية الحسن الثاني",
                "adresse": "حي أكدال — شارع محمد الخامس",
                "inscrits": 450,
                "capacite": 500,
                "status": "ouvert",
                "pin": "0001",
            },
            {
                "id": "demo-b2",
                "name": "مكتب الاقتراع 2 — الدار البيضاء",
                "ville": "الدار البيضاء",
                "region": "الدار البيضاء-سطات",
                "code": "CA-014",
                "centre": "إعدادية ابن رشد",
                "adresse": "المعاريف — زنقة 12",
                "inscrits": 380,
                "capacite": 400,
                "status": "attente",
                "pin": "0014",
            },
        ],
        "partis": [
            {"id": "demo-p1", "name": "حزب الأصالة والمعاصرة", "color": PARTY_COLORS[0]},
            {"id": "demo-p2", "name": "حزب الاستقلال", "color": PARTY_COLORS[1]},
            {"id": "demo-p3", "name": "حزب التجمع الوطني للأحرار", "color": PARTY_COLORS[2]},
        ],
        "mourakibs": {
            "demo-p1": [
                {"id": "demo-m1", "name": "محمد العلوي"},
                {"id": "demo-m2", "name": "سارة بنعلي"},
            ],
            "demo-p2": [{"id": "demo-m3", "name": "فاطمة الزهراء"}],
            "demo-p3": [{"id": "demo-m4", "name": "أحمد الإدريسي"}],
        },
        "votes": {
            "demo-b1": {
                "demo-p1": {"demo-m1": 45, "demo-m2": 12},
                "demo-p2": {"demo-m3": 28},
                "demo-p3": {"demo-m4": 15},
            },
            "demo-b2": {
                "demo-p1": {"demo-m1": 20},
                "demo-p2": {"demo-m3": 35},
            },
        },
        "pv": {
            "demo-b1": {"blancs": 3, "nuls": 2, "votants": 105, "numero": "PV-RB-001-20260702"},
            "demo-b2": {"blancs": 1, "nuls": 0, "votants": 56, "numero": "PV-CA-014-20260702"},
        },
        "journal": [],
        "currentBureau": "demo-b1",
        "mourakibActif": "محمد العلوي",
    }
