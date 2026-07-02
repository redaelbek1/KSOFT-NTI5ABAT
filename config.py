BASE_URL = "https://www.elections.ma"

REGIONS = [
    {"id": 1, "name": "طنجة- تطوان -الحسيمة"},
    {"id": 2, "name": "الشرق"},
    {"id": 3, "name": "فاس- مكناس"},
    {"id": 4, "name": "الرباط -سلا -القنيطرة"},
    {"id": 5, "name": "بني ملال -خنيفرة"},
    {"id": 6, "name": "الدار البيضاء-سطات"},
    {"id": 7, "name": "مراكش- آسفي"},
    {"id": 8, "name": "درعة -تافيلالت"},
    {"id": 9, "name": "سوس- ماسة"},
    {"id": 10, "name": "كلميم -واد نون"},
    {"id": 11, "name": "العيون- الساقية الحمراء"},
    {"id": 12, "name": "الداخلة- وادي الذهب"},
]

ELECTIONS = {
    "legislative_2021": {
        "label": "الانتخابات التشريعية 2021",
        "type": "legislative",
        "year": 2021,
        "c_election": 17,
        "page_url": f"{BASE_URL}/elections/legislatives/resultats.aspx?Id=T1uzm+f7U/WFF+rn+x03Zg==&IE=1",
    },
    "legislative_2016": {
        "label": "الانتخابات التشريعية 2016",
        "type": "legislative",
        "year": 2016,
        "c_election": 13,
        "page_url": f"{BASE_URL}/elections/legislatives/resultats.aspx?Id=l1Vr5AJaDkA534Qqp+Idqg==&IE=1",
    },
    "communal_2021": {
        "label": "الانتخابات الجماعية 2021",
        "type": "communal",
        "year": 2021,
        "c_election": 15,
        "page_url": f"{BASE_URL}/elections/communales/resultats.aspx?Id=UshdiNun64qlGNgh/73atw==&IE=1",
    },
    "communal_2015": {
        "label": "الانتخابات الجماعية 2015",
        "type": "communal",
        "year": 2015,
        "c_election": 9,
        "page_url": f"{BASE_URL}/elections/communales/resultats.aspx?Id=l9ziT4TKNOxo6MIM81hkUA==&IE=1",
    },
}
