"""Tests exports TXT — alignés PDF."""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("SECRET_KEY", "test-secret")

import kasoft.core.db as db  # noqa: E402
from kasoft.core.seed import demo_state  # noqa: E402
from kasoft.core.txt import generate_journal_txt, generate_pv_txt, generate_rapport_txt  # noqa: E402


class KasoftTxtTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        db.DB_PATH = Path(self._tmpdir.name) / "test.db"
        db.JSON_PATH = Path(self._tmpdir.name) / "test_state.json"
        db._db_ready = False
        db.init_db()
        self.state = demo_state()
        db.save_state(self.state)
        self.bid = self.state["bureaux"][0]["id"]
        self.addCleanup(self._tmpdir.cleanup)

    def test_pv_txt_has_verify_and_signatures(self):
        text = generate_pv_txt(self.state, self.bid)
        self.assertIn("رمز التحقق: KASOFT|PV|", text)
        self.assertIn("── التحقق والتوقيعات ──", text)
        self.assertIn("التوقيع الرقمي KASOFT", text)
        self.assertIn("تصريح:", text)
        self.assertIn("رئيس مكتب الاقتراع", text)
        self.assertIn("التاريخ والوقت:", text)

    def test_rapport_txt_has_blancs_fermes(self):
        text = generate_rapport_txt(self.state)
        self.assertIn("المكاتب المغلقة:", text)
        self.assertIn("مجموع الأوراق البيضاء:", text)
        self.assertIn("مجموع الأصوات الملغاة:", text)
        self.assertIn("رمز التحقق: KASOFT|RAPPORT|", text)

    def test_journal_txt_filters_bureau(self):
        self.state["journal"] = [
            {"time": "2026-07-06T10:00:00", "bureauId": self.bid, "actif": "A", "parti": "P", "mourakib": "M", "action": "+1", "total": 1},
            {"time": "2026-07-06T11:00:00", "bureauId": "other", "actif": "B", "parti": "P", "mourakib": "M", "action": "+1", "total": 2},
        ]
        text = generate_journal_txt(self.state, self.bid)
        self.assertIn("| A |", text)
        self.assertNotIn("| B |", text)
        self.assertIn("رقم المحضر:", text)


if __name__ == "__main__":
    unittest.main()
