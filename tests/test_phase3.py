"""Tests Phase 3 — HMAC, /verify, archive ministérielle."""
import os
import tempfile
import unittest
from pathlib import Path

os.environ["KASOFT_ADMIN_PIN"] = "2026"
os.environ["KASOFT_MOURAKIB_PIN"] = "3030"
os.environ["SECRET_KEY"] = "phase3-test-secret"

import kasoft.core.archive as archive  # noqa: E402
import kasoft.core.db as db  # noqa: E402
from kasoft.core.pdf import generate_pv_pdf  # noqa: E402
from kasoft.core.seed import demo_state  # noqa: E402
from kasoft.core.verify import sign_pv, verify_token  # noqa: E402


class Phase3VerifyTests(unittest.TestCase):
    def test_hmac_stable_and_rejects_tamper(self):
        code = sign_pv("PV-TEST-1", "bureau-a", 42, "20260713")
        self.assertTrue(code.startswith("KASOFT|PV|"))
        ok = verify_token(code)
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["status"], "valid")

        parts = code.split("|")
        parts[4] = "99"
        tampered = "|".join(parts)
        bad = verify_token(tampered)
        self.assertFalse(bad["ok"])
        self.assertEqual(bad["status"], "invalid")

    def test_client_code_is_unsigned(self):
        code = "KASOFT|PV|PV-X|b1|10|20260713|CLIENT"
        r = verify_token(code)
        self.assertFalse(r["ok"])
        self.assertEqual(r["status"], "unsigned")


class Phase3AppTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        root = Path(self._tmpdir.name)
        db.DB_PATH = root / "test.db"
        db.JSON_PATH = root / "test_state.json"
        db._db_ready = False
        db.init_db()
        self.state = demo_state()
        db.save_state(self.state)
        self.bid = self.state["bureaux"][0]["id"]

        archive.ARCHIVE_DIR = root / "archive"
        archive.INDEX_PATH = archive.ARCHIVE_DIR / "index.json"

        from asgi import app as asgi_app
        from fastapi.testclient import TestClient

        self.client = TestClient(asgi_app)
        self.addCleanup(self._tmpdir.cleanup)

    def _login_admin(self):
        r = self.client.post(
            "/login",
            data={"pin": "2026", "bureau_id": ""},
            follow_redirects=False,
        )
        self.assertIn(r.status_code, (302, 303))

    def test_verify_page_valid_and_invalid(self):
        code = sign_pv("PV-DEMO", self.bid, 7, "20260713")
        r = self.client.get(f"/verify?c={code}")
        self.assertEqual(r.status_code, 200)
        self.assertIn("صالح", r.text)

        r2 = self.client.get("/verify?c=KASOFT|PV|X|Y|1|20260713|deadbeefdeadbeef")
        self.assertEqual(r2.status_code, 200)
        self.assertIn("غير مطابق", r2.text)

    def test_archive_after_pdf_export(self):
        self._login_admin()
        r = self.client.post(
            "/api/kasoft/export-pv-pdf",
            json={**self.state, "bureau_id": self.bid},
        )
        self.assertEqual(r.status_code, 200, r.text[:200])
        self.assertEqual(r.headers.get("content-type", ""), "application/pdf")

        entries = archive.list_entries()
        self.assertGreaterEqual(len(entries), 1)
        pv_num = entries[0]["pv_num"]
        self.assertTrue(archive.read_pdf_bytes(pv_num))

        r_list = self.client.get("/archive")
        self.assertEqual(r_list.status_code, 200)
        self.assertIn(pv_num, r_list.text)

        r_api = self.client.get("/api/kasoft/archive")
        self.assertEqual(r_api.status_code, 200)
        self.assertGreaterEqual(len(r_api.json()["entries"]), 1)

    def test_archive_requires_admin(self):
        r = self.client.get("/archive", follow_redirects=False)
        self.assertIn(r.status_code, (302, 303))
        r2 = self.client.get("/api/kasoft/archive")
        self.assertIn(r2.status_code, (401, 403))

    def test_generate_pv_pdf_signed_meta(self):
        meta = generate_pv_pdf(self.state, self.bid, signer="admin", return_meta=True)
        self.assertIsNotNone(meta)
        self.assertTrue(meta["verify_code"].startswith("KASOFT|PV|"))
        self.assertTrue(verify_token(meta["verify_code"])["ok"])
        self.assertTrue(meta["pdf"][:4] == b"%PDF")


if __name__ == "__main__":
    unittest.main()
