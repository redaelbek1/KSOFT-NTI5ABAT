"""Génération TXT — alignée sur les PDF KASOFT (Phase 2)."""
from datetime import datetime

from kasoft_pdf import (
    _bureau_total,
    _bureau_votes,
    _pv_number,
    _status_label,
)

_FOOTER = "كاسوفت للمعلومية والاستشارات — الدار البيضاء — سري وموثوق"


def _now_date():
    return datetime.now().strftime("%Y-%m-%d")


def _now_datetime():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def _verify_pv(bureau_id, pv_num, valid):
    return f"KASOFT|{pv_num}|{bureau_id}|{valid}|{datetime.now().strftime('%Y%m%d')}"


def _verify_rapport(total_valid):
    return f"KASOFT|RAPPORT|{total_valid}|{datetime.now().strftime('%Y%m%d')}"


def _signature_block(declaration):
    return [
        "",
        "── التحقق والتوقيعات ──",
        declaration,
        "",
        "التوقيع — رئيس مكتب الاقتراع: _______________________",
        "التوقيع — ممثل السلطة الإشرافية: _______________________",
        "التوقيع — ممثل الأحزاب / المراقبون: _______________________",
    ]


def generate_pv_txt(state, bureau_id):
    bureau = next((b for b in state.get("bureaux", []) if b["id"] == bureau_id), None)
    if not bureau:
        return None

    inscrits = int(bureau.get("inscrits", 0))
    valid = _bureau_total(state, bureau_id)
    pv = (state.get("pv", {}) or {}).get(bureau_id, {}) or {}
    blancs = int(pv.get("blancs", 0) or 0)
    nuls = int(pv.get("nuls", 0) or 0)
    votants = int(pv.get("votants", 0) or (valid + blancs + nuls))
    participation = min(100, round((votants / inscrits) * 100)) if inscrits else 0
    pv_num = _pv_number(bureau, bureau_id, pv)
    verify = _verify_pv(bureau_id, pv_num, valid)

    lines = [
        "═══════════════════════════════════════",
        "   محضر مكتب الاقتراع — نسخة رسمية (v1)",
        "═══════════════════════════════════════",
        f"رقم المحضر: {pv_num}",
        f"رمز المكتب: {bureau.get('code') or '—'}",
        f"المكتب: {bureau.get('name', '')}",
        f"المدينة: {bureau.get('ville', '')}",
        f"الجهة: {bureau.get('region', '')}",
        f"المركز: {bureau.get('centre') or '—'}",
        f"العنوان: {bureau.get('adresse') or '—'}",
        f"الحالة: {_status_label(bureau.get('status', 'attente'))}",
        f"عدد المسجلين: {inscrits}",
        f"السعة: {bureau.get('capacite', inscrits)}",
        f"عدد المصوتين: {votants}",
        f"الأصوات الصحيحة: {valid}",
        f"الأوراق البيضاء: {blancs}",
        f"الأصوات الملغاة: {nuls}",
        f"نسبة المشاركة: {participation}%",
        f"التاريخ والوقت: {_now_datetime()}",
        "",
        "── توزيع الأصوات حسب الحزب ──",
        "",
    ]

    for p in state.get("partis", []):
        total = _bureau_votes(state, bureau_id).get(p["id"], 0)
        lines.append(f"{p['name']}: {total} صوت")
        details = []
        for m in state.get("mourakibs", {}).get(p["id"], []):
            c = state.get("votes", {}).get(bureau_id, {}).get(p["id"], {}).get(m["id"], 0)
            if c:
                details.append(f"{m['name']}: {c}")
        if details:
            lines.append(f"  تفصيل المراقبين: {'، '.join(details)}")
        lines.append("")

    lines.append(f"المجموع العام: {valid} صوت صحيح")
    lines.append("")
    lines.append("── آخر العمليات (10) ──")
    journal = [
        j
        for j in state.get("journal", [])
        if j.get("bureauId") == bureau_id
    ][:10]
    if journal:
        for j in journal:
            lines.append(
                f"{j.get('time', '')} | {j.get('actif', '')} | {j.get('parti', '')} | "
                f"{j.get('action', '')} → {j.get('total', '')}"
            )
    else:
        lines.append("— لا توجد عمليات —")

    lines.extend(
        _signature_block(
            "تصريح: أؤكد أن هذا المحضر مطابق لنتائج الفرز داخل المكتب المذكور."
        )
    )
    lines.append(f"رمز التحقق: {verify}")
    lines.append("")
    lines.append(_FOOTER)
    return "\n".join(lines)


def generate_rapport_txt(state):
    bureaux = state.get("bureaux", [])
    if not bureaux:
        return None

    pv = state.get("pv", {}) or {}
    total_inscrits = sum(int(b.get("inscrits", 0)) for b in bureaux)
    total_valid = sum(_bureau_total(state, b["id"]) for b in bureaux)
    total_blancs = sum(int((pv.get(b["id"], {}) or {}).get("blancs", 0) or 0) for b in bureaux)
    total_nuls = sum(int((pv.get(b["id"], {}) or {}).get("nuls", 0) or 0) for b in bureaux)
    total_votants = sum(
        int(
            (pv.get(b["id"], {}) or {}).get("votants", 0)
            or (
                _bureau_total(state, b["id"])
                + int((pv.get(b["id"], {}) or {}).get("blancs", 0) or 0)
                + int((pv.get(b["id"], {}) or {}).get("nuls", 0) or 0)
            )
        )
        for b in bureaux
    )
    participation = (
        min(100, round((total_votants / total_inscrits) * 100)) if total_inscrits else 0
    )
    ouverts = sum(1 for b in bureaux if b.get("status") == "ouvert")
    fermes = sum(1 for b in bureaux if b.get("status") == "ferme")
    verify = _verify_rapport(total_valid)

    lines = [
        "═══════════════════════════════════════",
        "     التقرير الإقليمي الموحد — كاسوفت",
        "═══════════════════════════════════════",
        f"التاريخ: {_now_date()}",
        f"عدد المكاتب: {len(bureaux)}",
        f"المكاتب المفتوحة: {ouverts}",
        f"المكاتب المغلقة: {fermes}",
        f"مجموع المسجلين: {total_inscrits}",
        f"مجموع المصوتين: {total_votants}",
        f"مجموع الأصوات الصحيحة: {total_valid}",
        f"مجموع الأوراق البيضاء: {total_blancs}",
        f"مجموع الأصوات الملغاة: {total_nuls}",
        f"نسبة المشاركة العامة: {participation}%",
        "",
        "── تفصيل حسب المكتب ──",
        "",
        "المكتب | المدينة | الحالة | مسجلون | مصوتون | صحيحة | بيضاء | ملغاة | %",
        "─" * 72,
    ]

    for b in bureaux:
        bid = b["id"]
        valid = _bureau_total(state, bid)
        ins = int(b.get("inscrits", 0))
        b_pv = pv.get(bid, {}) or {}
        blancs = int(b_pv.get("blancs", 0) or 0)
        nuls = int(b_pv.get("nuls", 0) or 0)
        votants = int(b_pv.get("votants", 0) or (valid + blancs + nuls))
        pct = min(100, round((votants / ins) * 100)) if ins else 0
        lines.append(
            f"{b.get('name', '')} | {b.get('ville', '')} | "
            f"{_status_label(b.get('status', 'attente'))} | {ins} | {votants} | "
            f"{valid} | {blancs} | {nuls} | {pct}%"
        )

    lines.extend(["", "── المجموع حسب الحزب (كل المكاتب) ──", ""])
    for p in state.get("partis", []):
        total = sum(_bureau_votes(state, b["id"]).get(p["id"], 0) for b in bureaux)
        lines.append(f"{p['name']}: {total} صوت")

    lines.extend(
        _signature_block("تصريح: أؤكد صحة هذا التقرير الإقليمي الموحد.")
    )
    lines.append(f"رمز التحقق: {verify}")
    lines.append("")
    lines.append(_FOOTER)
    return "\n".join(lines)


def generate_journal_txt(state, bureau_id=None):
    bureau = None
    if bureau_id:
        bureau = next((b for b in state.get("bureaux", []) if b["id"] == bureau_id), None)
    entries = state.get("journal", [])
    if bureau_id:
        entries = [j for j in entries if j.get("bureauId") == bureau_id]

    lines = [
        "═══════════════════════════════════════",
        "           سجل العمليات — كاسوفت",
        "═══════════════════════════════════════",
    ]
    if bureau:
        pv = (state.get("pv", {}) or {}).get(bureau_id, {}) or {}
        pv_num = _pv_number(bureau, bureau_id, pv)
        lines.extend(
            [
                f"المكتب: {bureau.get('name', '')}",
                f"رمز المكتب: {bureau.get('code') or '—'}",
                f"رقم المحضر: {pv_num}",
                f"المدينة: {bureau.get('ville', '')} — {bureau.get('region', '')}",
            ]
        )
    lines.extend(
        [
            f"التاريخ: {_now_datetime()}",
            f"عدد الإجراءات: {len(entries)}",
            "",
            "الوقت | المراقب النشط | الحزب | المراقب | الإجراء | المجموع",
            "─" * 72,
        ]
    )
    for j in entries[:50]:
        t = j.get("time", "")
        if "T" in t:
            t = t.split("T")[1].split(".")[0]
        lines.append(
            f"{t} | {j.get('actif', '')} | {j.get('parti', '')} | "
            f"{j.get('mourakib', '')} | {j.get('action', '')} | {j.get('total', '')}"
        )
    lines.extend(["", _FOOTER])
    return "\n".join(lines)
