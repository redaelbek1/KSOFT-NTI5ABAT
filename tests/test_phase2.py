"""Tests API Phase 2 (FastAPI + auth bureau)."""
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("KASOFT_ADMIN_PIN", "2026")
os.environ.setdefault("KASOFT_MOURAKIB_PIN", "3030")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

import kasoft_db as db  # noqa: E402
from kasoft_seed import demo_state  # noqa: E402


class Phase2ApiTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        db.DB_PATH = Path(self._tmpdir.name) / "test.db"
        db.JSON_PATH = Path(self._tmpdir.name) / "test_state.json"
        db._db_ready = False
        db.init_db()
        db.save_state(demo_state())
        from fastapi.testclient import TestClient
        from asgi import app as asgi_app

        self.client = TestClient(asgi_app)
        self.addCleanup(self._tmpdir.cleanup)

    def _token(self, pin="2026", bureau_id=None):
        body = {"pin": pin}
        if bureau_id:
            body["bureau_id"] = bureau_id
        r = self.client.post("/auth/login", json=body)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["token"]

    def test_health_phase2(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("phase"), 2)

    def test_bureaux_requires_auth(self):
        r = self.client.get("/bureaux")
        self.assertEqual(r.status_code, 401)

    def test_bureaux_list_admin(self):
        token = self._token()
        r = self.client.get("/bureaux", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.json()), 2)

    def test_bureau_pin_login(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        token = self._token("0001", bureau_id=bid)
        r = self.client.get("/bureaux", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)

    def test_votes_post_and_get(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        pid = state["partis"][0]["id"]
        mid = state["mourakibs"][pid][0]["id"]
        token = self._token("0001", bureau_id=bid)
        headers = {"Authorization": f"Bearer {token}"}
        before = self.client.get(f"/votes/{bid}", headers=headers).json()
        before_val = before.get(pid, {}).get(mid, 0)
        r = self.client.post(
            "/votes",
            headers=headers,
            json={
                "bureau_id": bid,
                "parti_id": pid,
                "mourakib_id": mid,
                "delta": 1,
                "actif": "Test API",
            },
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data.get("changed"))
        after = data["state"]["votes"][bid][pid][mid]
        self.assertEqual(after, before_val + 1)

    def test_mourakib_cannot_access_other_bureau(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        other = state["bureaux"][1]["id"]
        token = self._token("0001", bureau_id=bid)
        headers = {"Authorization": f"Bearer {token}"}
        r = self.client.get(f"/votes/{other}", headers=headers)
        self.assertEqual(r.status_code, 403)

    def test_export_pdf(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        token = self._token()
        r = self.client.get(
            f"/export/{bid}",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("content-type"), "application/pdf")
        self.assertGreater(len(r.content), 1000)

    def test_export_txt(self):
        state = demo_state()
        bid = state["bureaux"][0]["id"]
        token = self._token()
        r = self.client.get(
            f"/export/{bid}/txt",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"KASOFT|", r.content)
        self.assertIn("── التحقق والتوقيعات ──".encode("utf-8"), r.content)

    def test_rapport_general(self):
        token = self._token()
        r = self.client.get(
            "/rapport/general",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get("content-type"), "application/pdf")


if __name__ == "__main__":
    unittest.main()
