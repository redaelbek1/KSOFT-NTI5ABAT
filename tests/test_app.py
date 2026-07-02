"""Tests automatisés — lancer avec: python -m unittest discover -s tests -v"""
import json
import os
import tempfile
import unittest
from pathlib import Path

# Isoler la DB de test
os.environ.setdefault("KASOFT_PIN", "2026")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

import kasoft_db as db  # noqa: E402
from app import app  # noqa: E402
from kasoft_pdf import generate_pv_pdf, generate_rapport_pdf  # noqa: E402
from kasoft_seed import demo_state  # noqa: E402


class KasoftAppTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        db.DB_PATH = Path(self._tmpdir.name) / "test.db"
        db.JSON_PATH = Path(self._tmpdir.name) / "test_state.json"
        db._db_ready = False
        db.init_db()
        self.client = app.test_client()
        self.addCleanup(self._tmpdir.cleanup)

    def _login(self):
        return self.client.post("/login", data={"pin": "2026"})

    def test_health(self):
        r = self.client.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.get_json().get("ok"))

    def test_login_and_logout(self):
        r = self._login()
        self.assertIn(r.status_code, (302, 200))
        r2 = self.client.get("/dashboard")
        self.assertEqual(r2.status_code, 200)
        self.client.get("/logout")

    def test_kasoft_state_requires_auth(self):
        r = self.client.get("/api/kasoft/state")
        self.assertEqual(r.status_code, 401)

    def test_vote_api(self):
        self._login()
        state = demo_state()
        db.save_state(state)
        bid = state["bureaux"][0]["id"]
        pid = state["partis"][0]["id"]
        mid = state["mourakibs"][pid][0]["id"]
        before = db.load_state()["votes"][bid][pid][mid]
        r = self.client.post(
            "/api/kasoft/votes",
            json={
                "bureau_id": bid,
                "parti_id": pid,
                "mourakib_id": mid,
                "delta": 1,
                "actif": "Test",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = r.get_json()
        self.assertTrue(data.get("changed"))
        after = data["state"]["votes"][bid][pid][mid]
        self.assertEqual(after, before + 1)

    def test_pdf_generation(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        pv = generate_pv_pdf(state, bid)
        rapport = generate_rapport_pdf(state)
        self.assertGreater(len(pv), 1000)
        self.assertGreater(len(rapport), 1000)

    def test_rapport_pdf_api(self):
        self._login()
        state = demo_state()
        r = self.client.post(
            "/api/kasoft/rapport-pdf",
            data=json.dumps(state),
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.mimetype, "application/pdf")

    def test_export_page_public(self):
        r = self.client.get("/export")
        self.assertEqual(r.status_code, 200)

    def test_bulk_export_requires_auth(self):
        r = self.client.post(
            "/api/export-all",
            json={"types": ["legislative"]},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 401)

    def test_merge_on_state_post(self):
        self._login()
        a = demo_state()
        b = demo_state()
        bid = a["bureaux"][0]["id"]
        pid = a["partis"][0]["id"]
        mid = a["mourakibs"][pid][0]["id"]
        a["votes"][bid][pid][mid] = 3
        b["votes"][bid][pid][mid] = 9
        self.client.post("/api/kasoft/state", json=a)
        self.client.post("/api/kasoft/state", json=b)
        merged = self.client.get("/api/kasoft/state").get_json()
        self.assertEqual(merged["votes"][bid][pid][mid], 9)


if __name__ == "__main__":
    unittest.main()
