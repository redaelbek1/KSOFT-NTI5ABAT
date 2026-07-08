import json
import queue
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

from kasoft.export_ma.config import ELECTIONS, REGIONS

from kasoft.paths import DATA_DIR

OPT_JS = """els => els.map(e => ({value: e.value, text: e.textContent.trim()}))"""
CACHE_DIR = DATA_DIR / "geo_disk"
WAIT_MS = 1500


def _cache_key(*parts):
    return ":".join(str(p) for p in parts)


def _disk_get(key):
    path = CACHE_DIR / f"{key.replace(':', '_')}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _disk_set(key, data):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{key.replace(':', '_')}.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


class _PlaywrightWorker:
    def __init__(self):
        self._queue = queue.Queue()
        self._ready = threading.Event()
        self._failed = False
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        self._error = None
        if not self._ready.wait(timeout=90):
            self._failed = True
            self._error = "timeout démarrage Playwright"
        if self._failed:
            raise RuntimeError(self._playwright_error())

    def _playwright_error(self):
        detail = self._error or "navigateur Chromium manquant"
        return (
            "Playwright غير متاح ("
            + str(detail)
            + "). على الخادم: playwright install chromium"
        )

    def run(self, fn, *args):
        if self._failed:
            raise RuntimeError(self._playwright_error())
        box = queue.Queue(maxsize=1)
        self._queue.put((fn, args, box))
        ok, payload = box.get(timeout=120)
        if not ok:
            raise payload
        return payload

    def _loop(self):
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True)
                page = browser.new_page()
                page.set_default_timeout(60000)
                ctx = {"page": page, "election_key": None}
                self._ready.set()

                while True:
                    job = self._queue.get()
                    if job is None:
                        break
                    fn, args, box = job
                    try:
                        box.put((True, fn(ctx, *args)))
                    except Exception as exc:
                        box.put((False, exc))
        except Exception as exc:
            self._failed = True
            self._error = exc
            self._ready.set()
            while True:
                job = self._queue.get()
                if job is None:
                    break
                _, _, box = job
                box.put((False, RuntimeError(self._playwright_error())))


_worker = None
_worker_lock = threading.Lock()


def _get_worker():
    global _worker
    with _worker_lock:
        if _worker is None:
            _worker = _PlaywrightWorker()
        return _worker


def _ensure_page(ctx, election_key):
    page = ctx["page"]
    if ctx["election_key"] != election_key:
        election = ELECTIONS[election_key]
        page.goto(election["page_url"], timeout=90000)
        page.wait_for_selector("#DDLRegion")
        ctx["election_key"] = election_key


def _wait(page):
    page.wait_for_timeout(WAIT_MS)


def _options(page, selector, skip_zero=True):
    items = page.eval_on_selector_all(selector, OPT_JS)
    if skip_zero:
        return [i for i in items if i["value"] not in ("", "0")]
    return items


def _select_region(page, region_id):
    page.select_option("#DDLRegion", str(region_id))
    _wait(page)


def _select_province(page, province_id):
    values = page.eval_on_selector_all(
        "#DDLProvince option", "els => els.map(e => e.value)"
    )
    if str(province_id) not in values:
        raise ValueError(
            f"العمالة غير موجودة (id={province_id}). أعد اختيار العمالة بعد تغيير نوع الانتخاب."
        )
    page.select_option("#DDLProvince", str(province_id))
    _wait(page)


def _fetch_provinces(ctx, election_key, region_id):
    page = ctx["page"]
    _ensure_page(ctx, election_key)
    _select_region(page, region_id)
    return [
        {"id": int(p["value"]), "name": p["text"]}
        for p in _options(page, "#DDLProvince option")
    ]


def _fetch_communes(ctx, election_key, region_id, province_id):
    page = ctx["page"]
    _ensure_page(ctx, election_key)
    _select_region(page, region_id)
    _select_province(page, province_id)
    communes = [
        {"id": int(c["value"]), "name": c["text"]}
        for c in _options(page, "#DDLCommune option")
    ]
    if not communes:
        raise ValueError("لم يتم العثور على جماعات لهذه العمالة.")
    return communes


def _fetch_circuits_legislative(ctx, election_key, region_id, province_id):
    page = ctx["page"]
    _ensure_page(ctx, election_key)
    if region_id == 0:
        return [
            {"id": int(c["value"]), "name": c["text"]}
            for c in _options(page, "#DDLCirc_Leg option", skip_zero=False)
        ]
    _select_region(page, region_id)
    if province_id:
        _select_province(page, province_id)
    return [
        {"id": int(c["value"]), "name": c["text"]}
        for c in _options(page, "#DDLCirc_Leg option", skip_zero=False)
        if c["value"] != "0"
    ]


def _fetch_circuits_communal(ctx, election_key, region_id, province_id, commune_id):
    page = ctx["page"]
    _ensure_page(ctx, election_key)
    _select_region(page, region_id)
    _select_province(page, province_id)
    values = page.eval_on_selector_all(
        "#DDLCommune option", "els => els.map(e => e.value)"
    )
    if str(commune_id) not in values:
        raise ValueError("الجماعة غير موجودة. أعد اختيار الجماعة.")
    page.select_option("#DDLCommune", str(commune_id))
    _wait(page)
    return [
        {"id": int(c["value"]), "name": c["text"]}
        for c in _options(page, "#DDLCirc option")
    ]


def _cached(key, fetcher, *args):
    hit = _disk_get(key)
    if hit is not None:
        return hit
    try:
        data = _get_worker().run(fetcher, *args)
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"تعذر تحميل البيانات الجغرافية: {exc}") from exc
    _disk_set(key, data)
    return data


def get_regions():
    return [{"id": 0, "name": "المستوى الوطني"}] + [
        {"id": r["id"], "name": r["name"]} for r in REGIONS
    ]


def get_provinces(election_key, region_id):
    if region_id == 0:
        return []
    key = _cache_key("provinces", election_key, region_id)
    return _cached(key, _fetch_provinces, election_key, region_id)


def get_communes(election_key, region_id, province_id):
    key = _cache_key("communes", election_key, region_id, province_id)
    return _cached(key, _fetch_communes, election_key, region_id, province_id)


def get_circuits_legislative(election_key, region_id, province_id=0):
    key = _cache_key("circ_leg", election_key, region_id, province_id)
    return _cached(key, _fetch_circuits_legislative, election_key, region_id, province_id)


def get_circuits_communal(election_key, region_id, province_id, commune_id):
    key = _cache_key("circ_com", election_key, region_id, province_id, commune_id)
    return _cached(
        key, _fetch_circuits_communal, election_key, region_id, province_id, commune_id
    )
