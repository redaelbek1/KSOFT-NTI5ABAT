"""Tests automatisés — lancer avec: python -m unittest discover -s tests -v"""
import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("KASOFT_ADMIN_PIN", "2026")
os.environ.setdefault("KASOFT_MOURAKIB_PIN", "3030")
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

    def _login(self, pin="2026"):
        return self.client.post("/login", data={"pin": pin})

    def _login_mourakib(self):
        return self._login("3030")

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

    def test_mourakib_cannot_access_configuration(self):
        self._login_mourakib()
        r = self.client.get("/configuration")
        self.assertEqual(r.status_code, 302)
        self.assertIn("/dashboard", r.location)

    def test_mourakib_cannot_load_demo(self):
        self._login_mourakib()
        r = self.client.post("/api/kasoft/load-demo")
        self.assertEqual(r.status_code, 403)

    def test_mourakib_can_vote(self):
        self._login_mourakib()
        state = demo_state()
        db.save_state(state)
        bid = state["bureaux"][0]["id"]
        pid = state["partis"][0]["id"]
        mid = state["mourakibs"][pid][0]["id"]
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

    def test_bureau_pin_from_code_rb001(self):
        from kasoft_auth import _default_bureau_pin

        bureau = {"id": "demo-b1", "code": "RB-001", "pin": ""}
        self.assertEqual(_default_bureau_pin(bureau), "0001")

    def test_login_bureau_pin_empty_pin_field(self):
        state = demo_state()
        for b in state["bureaux"]:
            b["pin"] = ""
        db.save_state(state)
        bid = state["bureaux"][0]["id"]
        r = self.client.post("/login", data={"pin": "0001", "bureau_id": bid})
        self.assertIn(r.status_code, (302, 200))

    def test_login_bureau_pin(self):
        state = demo_state()
        db.save_state(state)
        bid = state["bureaux"][0]["id"]
        r = self.client.post("/login", data={"pin": "0001", "bureau_id": bid})
        self.assertIn(r.status_code, (302, 200))
        r2 = self.client.get("/api/kasoft/session")
        self.assertEqual(r2.status_code, 200)
        data = r2.get_json()
        self.assertEqual(data.get("role"), "mourakib")
        self.assertEqual(data.get("bureau_id"), bid)

    def test_comptage_locks_bureau_for_scoped_mourakib(self):
        state = demo_state()
        db.save_state(state)
        bid = state["bureaux"][0]["id"]
        self.client.post("/login", data={"pin": "0001", "bureau_id": bid})
        r = self.client.get("/comptage")
        self.assertEqual(r.status_code, 200)
        html = r.get_data(as_text=True)
        self.assertIn("KASOFT_SCOPED_BUREAU_ID", html)
        self.assertIn(f'"{bid}"', html)

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

    def test_journal_records_mourakib_total(self):
        self._login()
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        pid = state["partis"][0]["id"]
        mid = state["mourakibs"][pid][0]["id"]
        before = state["votes"][bid][pid][mid]
        state, changed = db.record_vote(state, bid, pid, mid, 1, "Test")
        self.assertTrue(changed)
        entry = state["journal"][0]
        self.assertEqual(entry["total"], before + 1)
        state, changed = db.record_vote(state, bid, pid, mid, -1, "Test")
        self.assertTrue(changed)
        entry = state["journal"][0]
        self.assertEqual(entry["total"], before)
        self.assertEqual(state["votes"][bid][pid][mid], before)

    def test_merge_votes_subtract_uses_newer_journal(self):
        from kasoft_merge import merge_kasoft_states

        local = {
            "bureaux": [],
            "partis": [],
            "mourakibs": {},
            "votes": {"b1": {"p1": {"m1": 49}}},
            "journal": [{"time": "2026-07-06T10:00:00", "action": "+1"}],
            "pv": {},
        }
        remote = {
            "bureaux": [],
            "partis": [],
            "mourakibs": {},
            "votes": {"b1": {"p1": {"m1": 47}}},
            "journal": [{"time": "2026-07-06T11:00:00", "action": "-1"}],
            "pv": {},
        }
        merged = merge_kasoft_states(local, remote)
        self.assertEqual(merged["votes"]["b1"]["p1"]["m1"], 47)

    def test_journal_capped_at_50(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        pid = state["partis"][0]["id"]
        mid = state["mourakibs"][pid][0]["id"]
        db.save_state(state)
        for i in range(55):
            state, _ = db.record_vote(state, bid, pid, mid, 1, f"Actif{i}")
        self.assertLessEqual(len(state["journal"]), 50)


if __name__ == "__main__":
    unittest.main()
