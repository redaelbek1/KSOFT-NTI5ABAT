function initSyncBadge() {
    const el = document.getElementById("sync-status");
    if (!el) return;
    const kasoftMode = el.dataset.kasoft === "1";

    const check = async () => {
        if (!navigator.onLine) {
            el.className = "sync-badge sync-err";
            el.title = "غير متصل";
            return;
        }
        try {
            const url = kasoftMode ? "/api/kasoft/stats" : "/api/health";
            const r = await fetch(url, { credentials: "same-origin" });
            if (r.ok) {
                el.className = "sync-badge sync-ok";
                el.title = kasoftMode ? "متصل ومتزامن" : "متصل بالخادم";
            } else if (r.status === 401) {
                el.className = "sync-badge sync-warn";
                el.title = "انتهت الجلسة";
            } else {
                el.className = "sync-badge sync-warn";
                el.title = "الخادم غير متاح";
            }
        } catch {
            el.className = "sync-badge sync-err";
            el.title = "غير متصل";
        }
    };
    check();
    setInterval(check, 20000);
    window.addEventListener("online", check);
    window.addEventListener("offline", () => {
        el.className = "sync-badge sync-err";
        el.title = "غير متصل";
    });
}

document.addEventListener("DOMContentLoaded", initSyncBadge);
