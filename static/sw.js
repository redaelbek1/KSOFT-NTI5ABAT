/* Mise à jour immédiate — network-first, purge des anciens caches */
const CACHE_ID = "kasoft-v12";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_ID).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);
    if (!url.pathname.startsWith("/static/") && url.pathname !== "/sw.js") return;

    event.respondWith(
        fetch(event.request)
            .then((res) => {
                if (res && res.status === 200) {
                    const copy = res.clone();
                    caches.open(CACHE_ID).then((c) => c.put(event.request, copy));
                }
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});
