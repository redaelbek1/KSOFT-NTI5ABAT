import base64
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

from kasoft.core.auth import make_qr_base64
from kasoft.core.verify import qr_payload, sign_pv, sign_rapport
from kasoft.paths import STATIC_DIR

FONT_DIR = STATIC_DIR / "fonts"
_ARABIC_RE = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]")
_FONT_NAME = "KasoftArabic"
_USE_HB_RTL = False


def _font_path():
    for name in ("Tahoma.ttf", "Arabic.ttf"):
        path = FONT_DIR / name
        if path.is_file():
            return path
    return None


def _ar(text):
    """Texte arabe logique (HarfBuzz RTL) ou reshaping manuel en secours."""
    if text is None:
        return ""
    s = str(text)
    if not _ARABIC_RE.search(s):
        return s
    if _USE_HB_RTL:
        return s
    return get_display(arabic_reshaper.reshape(s))


def _pdf_value(value):
    s = str(value) if value is not None else ""
    if _ARABIC_RE.search(s):
        return _ar(s)
    return s


def _meta_value(value):
    v = value if value is not None and value != "" else "—"
    s = str(v)
    return _pdf_value(s) if _ARABIC_RE.search(s) else s


def _bureau_votes(state, bureau_id):
    votes = state.get("votes", {}).get(bureau_id, {})
    totals = {}
    for parti_id, mourakibs in votes.items():
        totals[parti_id] = sum(mourakibs.values()) if mourakibs else 0
    return totals


def _bureau_total(state, bureau_id):
    return sum(_bureau_votes(state, bureau_id).values())


def _status_label(status):
    return {"ouvert": "مفتوح", "ferme": "مغلق", "attente": "في الانتظار"}.get(
        status, status
    )


class KasoftPDF(FPDF):
    def __init__(self):
        global _USE_HB_RTL
        super().__init__(orientation="P", unit="mm", format="A4")
        path = _font_path()
        if not path:
            raise RuntimeError("Police arabe introuvable dans static/fonts/")
        self.add_font(_FONT_NAME, "", str(path))
        _USE_HB_RTL = False
        try:
            self.set_text_shaping(
                True,
                direction="rtl",
                script="arab",
                language="ara",
            )
            _USE_HB_RTL = True
        except Exception:
            _USE_HB_RTL = False
        self.set_auto_page_break(auto=True, margin=18)
        self.set_margins(15, 15, 15)
        self.alias_nb_pages()

    def footer(self):
        self.set_y(-12)
        self._set_body(8)
        self.set_text_color(156, 163, 175)
        self.cell(0, 8, _ar(f"صفحة {self.page_no()} / {{nb}}"), align="C")

    def _set_body(self, size=10):
        self.set_font(_FONT_NAME, "", size)
        self.set_text_color(31, 41, 55)

    def _header_band(self, title, subtitle="كاسوفت للمعلومية والاستشارات — المغرب"):
        self.set_fill_color(55, 65, 81)
        self.set_text_color(255, 255, 255)
        self.set_font(_FONT_NAME, "", 14)
        self.cell(0, 9, _ar(title), ln=1, align="C", fill=True)
        self.set_font(_FONT_NAME, "", 9)
        self.set_text_color(209, 213, 219)
        self.cell(0, 6, _ar(subtitle), ln=1, align="C", fill=True)
        self.ln(4)

    def _section(self, label):
        self._set_body(10)
        self.set_text_color(55, 65, 81)
        self.cell(0, 7, _ar(label), ln=1, align="R")
        self.set_draw_color(209, 213, 219)
        self.line(15, self.get_y(), 195, self.get_y())
        self.ln(3)

    def _meta_field(self, x, y, w, label, value):
        """Valeur à gauche, libellé à droite — lecture RTL: المكتب: مكتب الاقتراع 1"""
        pad = 2
        label_w = min(40, w * 0.45)
        value_w = w - label_w - pad
        self.set_xy(x, y)
        self.set_text_color(17, 24, 39)
        self.cell(value_w, 6, _meta_value(value), align="R")
        self.set_text_color(107, 114, 128)
        self.set_xy(x + value_w + pad, y)
        self.cell(label_w, 6, _ar(f"{label}:"), align="R")
        self.set_text_color(17, 24, 39)

    def _meta_row(self, pairs):
        self.set_fill_color(249, 250, 251)
        self.set_draw_color(229, 231, 235)
        y0 = self.get_y()
        row_h = 9
        self.rect(15, y0, 180, row_h * ((len(pairs) + 1) // 2), style="DF")
        self._set_body(9)
        col_w = 90
        field_w = col_w - 6
        for i, (label, value) in enumerate(pairs):
            col = 1 - (i % 2)  # colonne droite en premier (RTL)
            row = i // 2
            x = 15 + col * col_w + 3
            y = y0 + 2 + row * row_h
            self._meta_field(x, y, field_w, label, value)
        self.set_y(y0 + row_h * ((len(pairs) + 1) // 2) + 2)

    def _table(self, headers, rows, widths):
        self._set_body(8)
        self.set_fill_color(243, 244, 246)
        self.set_text_color(55, 65, 81)
        self.set_draw_color(209, 213, 219)
        for i, h in enumerate(headers):
            self.cell(widths[i], 7, _ar(h), border=1, align="C", fill=True)
        self.ln()
        fill = False
        for row in rows:
            if fill:
                self.set_fill_color(250, 250, 250)
            else:
                self.set_fill_color(255, 255, 255)
            fill = not fill
            self.set_text_color(31, 41, 55)
            for i, cell in enumerate(row):
                if isinstance(cell, str):
                    txt = _pdf_value(cell)
                else:
                    txt = str(cell)
                align = "R" if i == 0 and len(headers) > 2 else "C"
                self.cell(widths[i], 6, txt, border=1, align=align, fill=True)
            self.ln()
        self.ln(4)

    def _signature_boxes(self):
        self.ln(2)
        y0 = self.get_y()
        boxes = [
            ("رئيس المكتب", 15, 58),
            ("الكاتب", 76, 58),
            ("المراقب / الوكيل", 137, 58),
        ]
        self._set_body(8)
        for label, x, w in boxes:
            self.set_draw_color(209, 213, 219)
            self.rect(x, y0, w, 24)
            self.set_xy(x, y0 + 4)
            self.set_text_color(107, 114, 128)
            self.cell(w, 5, _ar("التوقيع والختم"), align="C")
            self.set_xy(x, y0 + 16)
            self.set_text_color(55, 65, 81)
            self.cell(w, 5, _ar(label), align="C")
        self.set_y(y0 + 28)

    def _digital_signature_block(self, verify_code, signer=None):
        self._section("التوقيع الرقمي KASOFT")
        self._set_body(9)
        self.set_text_color(55, 65, 81)
        self.cell(0, 6, _ar("محضر موقّع رقمياً (HMAC) — قابل للتحقق عبر /verify"), ln=1, align="R")
        if signer:
            self.cell(0, 6, _ar(f"الموقّع: {signer}"), ln=1, align="R")
        self.cell(0, 6, _ar(f"الطابع الزمني: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"), ln=1, align="R")
        sig = ""
        parts = (verify_code or "").split("|")
        if len(parts) >= 7 and parts[1] == "PV":
            sig = parts[-1]
        elif len(parts) >= 5 and parts[1] == "RAPPORT":
            sig = parts[-1]
        if sig:
            self.cell(0, 6, f"SIG: {sig}", ln=1, align="C")
        self.ln(2)

    def _qr_footer(self, verify_code, request_host=None):
        qr_text = qr_payload(verify_code, request_host)
        try:
            raw = base64.b64decode(make_qr_base64(qr_text))
            img = BytesIO(raw)
            x = (210 - 28) / 2
            self.image(img, x=x, y=self.get_y(), w=28)
            self.ln(30)
        except Exception:
            pass
        self._set_body(8)
        self.set_text_color(107, 114, 128)
        self.cell(0, 5, verify_code, ln=1, align="C")
        self.ln(1)
        self.cell(0, 5, _ar("امسح رمز QR أو زر صفحة /verify للتحقق"), ln=1, align="C")
        self.ln(2)
        self.cell(0, 5, _ar("كاسوفت للمعلومية والاستشارات — الدار البيضاء — سري وموثوق"), ln=1, align="C")


def _pdf_bytes(pdf):
    out = pdf.output()
    return out if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")


def _pv_number(bureau, bureau_id, pv):
    if pv.get("numero"):
        return pv["numero"]
    code = (bureau.get("code") or bureau_id[:8]).replace(" ", "-").upper()
    return f"PV-{code}-{datetime.now().strftime('%Y%m%d')}"


def generate_pv_pdf(state, bureau_id, signer=None, request_host=None, return_meta=False):
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
    verify = sign_pv(pv_num, bureau_id, valid)

    pdf = KasoftPDF()
    pdf.add_page()
    pdf._header_band("محضر مكتب الاقتراع — نسخة رسمية موقعة (Phase 3)")
    pdf._meta_row([
        ("رقم المحضر", pv_num),
        ("رمز المكتب", bureau.get("code", "—") or "—"),
        ("المكتب", bureau.get("name", "")),
        ("المدينة", bureau.get("ville", "")),
        ("الجهة", bureau.get("region", "")),
        ("المركز", bureau.get("centre", "—") or "—"),
        ("العنوان", bureau.get("adresse", "—") or "—"),
        ("الحالة", _status_label(bureau.get("status", "attente"))),
        ("المسجلون", inscrits),
        ("المصوتون", votants),
        ("الأصوات الصحيحة", valid),
        ("الأوراق البيضاء", blancs),
        ("الأصوات الملغاة", nuls),
        ("نسبة المشاركة", f"{participation}%"),
        ("التاريخ", datetime.now().strftime("%Y-%m-%d %H:%M")),
    ])

    pdf._section("توزيع الأصوات حسب الحزب")
    from kasoft.core.lists import VOTE_LISTS

    headers = ["الحزب"] + [label for _, label in VOTE_LISTS] + ["المجموع"]
    rows = []
    for p in state.get("partis", []):
        bucket = state.get("votes", {}).get(bureau_id, {}).get(p["id"], {})
        counts = [int(bucket.get(lid) or 0) for lid, _ in VOTE_LISTS]
        total = _bureau_votes(state, bureau_id).get(p["id"], 0)
        rows.append([p["name"]] + counts + [total])
    pdf._table(headers, rows, [70, 35, 35, 40])

    pdf._digital_signature_block(verify, signer=signer)
    pdf._section("التحقق والتوقيعات")
    pdf._set_body(9)
    pdf.cell(0, 7, _ar("تصريح: أؤكد أن هذا المحضر مطابق لنتائج الفرز داخل المكتب المذكور."), ln=1, align="R")
    pdf.ln(1)
    pdf._signature_boxes()
    pdf._qr_footer(verify, request_host=request_host)
    pdf_bytes = _pdf_bytes(pdf)
    if return_meta:
        return {"pdf": pdf_bytes, "verify_code": verify, "pv_num": pv_num, "votes": valid}
    return pdf_bytes


def generate_rapport_pdf(state, signer=None, request_host=None):
    bureaux = state.get("bureaux", [])
    total_inscrits = sum(int(b.get("inscrits", 0)) for b in bureaux)
    total_valid = sum(_bureau_total(state, b["id"]) for b in bureaux)
    pv = state.get("pv", {}) or {}
    total_blancs = sum(int((pv.get(b["id"], {}) or {}).get("blancs", 0) or 0) for b in bureaux)
    total_nuls = sum(int((pv.get(b["id"], {}) or {}).get("nuls", 0) or 0) for b in bureaux)
    total_votants = sum(
        int((pv.get(b["id"], {}) or {}).get("votants", 0) or (_bureau_total(state, b["id"]) + int((pv.get(b["id"], {}) or {}).get("blancs", 0) or 0) + int((pv.get(b["id"], {}) or {}).get("nuls", 0) or 0)))
        for b in bureaux
    )
    participation = (
        min(100, round((total_votants / total_inscrits) * 100)) if total_inscrits else 0
    )
    ouverts = sum(1 for b in bureaux if b.get("status") == "ouvert")
    verify = sign_rapport(total_valid)

    pdf = KasoftPDF()
    pdf.add_page()
    pdf._header_band("التقرير الإقليمي الموحد — موقّع (Phase 3)")
    pdf._meta_row([
        ("التاريخ", datetime.now().strftime("%Y-%m-%d")),
        ("عدد المكاتب", len(bureaux)),
        ("المفتوحة", ouverts),
        ("المسجلون", total_inscrits),
        ("المصوتون", total_votants),
        ("الأصوات الصحيحة", total_valid),
        ("الأوراق البيضاء", total_blancs),
        ("الأصوات الملغاة", total_nuls),
        ("المشاركة", f"{participation}%"),
    ])

    pdf._section("تفصيل المكاتب")
    bureau_rows = []
    for b in bureaux:
        bid = b["id"]
        valid = _bureau_total(state, bid)
        ins = int(b.get("inscrits", 0))
        b_pv = (pv.get(bid, {}) or {})
        blancs = int(b_pv.get("blancs", 0) or 0)
        nuls = int(b_pv.get("nuls", 0) or 0)
        votants = int(b_pv.get("votants", 0) or (valid + blancs + nuls))
        pct = min(100, round((votants / ins) * 100)) if ins else 0
        bureau_rows.append([
            b.get("name", ""),
            b.get("ville", ""),
            _status_label(b.get("status", "attente")),
            ins,
            votants,
            valid,
            blancs,
            nuls,
            f"{pct}%",
        ])
    pdf._table(
        ["المكتب", "المدينة", "الحالة", "مسجلون", "مصوتون", "صحيحة", "بيضاء", "ملغاة", "%"],
        bureau_rows,
        [44, 26, 20, 18, 18, 16, 14, 14, 10],
    )

    pdf._section("المجموع حسب الحزب")
    parti_rows = []
    for p in state.get("partis", []):
        total = sum(_bureau_votes(state, b["id"]).get(p["id"], 0) for b in bureaux)
        parti_rows.append([p["name"], total])
    pdf._table(["الحزب", "مجموع الأصوات"], parti_rows, [130, 50])

    pdf._digital_signature_block(verify, signer=signer)
    pdf._section("التحقق والتوقيعات")
    pdf._set_body(9)
    pdf.cell(0, 7, _ar("تصريح: أؤكد صحة هذا التقرير الإقليمي الموحد."), ln=1, align="R")
    pdf.ln(1)
    pdf._signature_boxes()
    pdf._qr_footer(verify, request_host=request_host)
    return _pdf_bytes(pdf)
