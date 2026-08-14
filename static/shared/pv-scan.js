/**
 * مقارنة محضر — OCR (Tesseract.js) + données KasoftStore
 * Phone: caméra (capture) | PC: choix fichier
 */
(function () {
    const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

    function tr(key, fallback) {
        return window.KasoftI18n?.t(key) || fallback || key;
    }

    function isPhoneUi() {
        return document.body.classList.contains("phone-body");
    }

    function normalizeArabicDigits(text) {
        return String(text || "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
    }

    function normalizeText(text) {
        return normalizeArabicDigits(text).replace(/\s+/g, " ").trim();
    }

    function loadTesseract() {
        if (window.Tesseract) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = TESSERACT_URL;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Tesseract load failed"));
            document.head.appendChild(s);
        });
    }

    function buildAppSnapshot(state, bureauId) {
        const part = KasoftStore.getParticipation(state, bureauId);
        const rows = (state.partis || []).map((p) => ({
            key: `parti:${p.id}`,
            label: p.name,
            app: KasoftStore.getPartiTotal(state, bureauId, p.id),
        }));
        return {
            rows: [
                ...rows,
                { key: "valid", label: tr("pv_scan_valid", "مجموع الأصوات الصحيحة"), app: part.valid },
                { key: "blancs", label: tr("pv_scan_blancs", "أوراق بيضاء"), app: part.blancs },
                { key: "nuls", label: tr("pv_scan_nuls", "أصوات ملغاة"), app: part.nuls },
                { key: "votants", label: tr("pv_scan_votants", "عدد المصوتين"), app: part.votants },
                { key: "inscrits", label: tr("pv_scan_inscrits", "عدد المسجلين"), app: part.inscrits },
            ],
        };
    }

    function findNumberNear(text, keyword, windowSize = 100) {
        const t = normalizeText(text);
        const k = normalizeText(keyword);
        if (!k) return null;
        let idx = t.indexOf(k);
        if (idx < 0 && k.length > 8) idx = t.indexOf(k.slice(0, 8));
        if (idx < 0) return null;
        const slice = t.slice(Math.max(0, idx - 20), idx + windowSize);
        const nums = slice.match(/\d+/g);
        if (!nums || !nums.length) return null;
        return parseInt(nums[nums.length - 1], 10);
    }

    function findByKeywords(text, keywords) {
        for (const kw of keywords) {
            const n = findNumberNear(text, kw, 60);
            if (n != null && !Number.isNaN(n)) return n;
        }
        return null;
    }

    function parseOcrText(text, snapshot) {
        const parsed = {};
        snapshot.rows.forEach((row) => {
            if (row.key.startsWith("parti:")) {
                parsed[row.key] = findNumberNear(text, row.label, 90);
                return;
            }
            if (row.key === "blancs") {
                parsed[row.key] = findByKeywords(text, ["بيض", "blanc"]);
                return;
            }
            if (row.key === "nuls") {
                parsed[row.key] = findByKeywords(text, ["ملغ", "nul"]);
                return;
            }
            if (row.key === "votants") {
                parsed[row.key] = findByKeywords(text, ["مصوت", "votant"]);
                return;
            }
            if (row.key === "inscrits") {
                parsed[row.key] = findByKeywords(text, ["مسجل", "inscrit"]);
                return;
            }
            if (row.key === "valid") {
                parsed[row.key] = findByKeywords(text, ["صحيح", "valid"]);
            }
        });
        return parsed;
    }

    function compareRows(snapshot, parsed) {
        return snapshot.rows.map((row) => {
            const photo = parsed[row.key];
            let match = null;
            if (photo != null && !Number.isNaN(photo)) match = photo === row.app;
            return { ...row, photo, match };
        });
    }

    function renderResults(container, compared, rawText) {
        const matched = compared.filter((r) => r.match === true).length;
        const checked = compared.filter((r) => r.photo != null && !Number.isNaN(r.photo)).length;
        const mism = compared.filter((r) => r.match === false).length;

        let summaryClass = "ok";
        let summaryText = tr("pv_scan_ok", "✓ المحضر مطابق للتطبيق");
        if (mism > 0) {
            summaryClass = "fail";
            summaryText = tr("pv_scan_mismatch", "✗ اختلافات — راجع الأرقام");
        } else if (checked === 0) {
            summaryClass = "warn";
            summaryText = tr("pv_scan_no_numbers", "⚠ لم يُستخرج أي رقم — حاول صورة أوضح");
        } else if (checked < compared.length) {
            summaryClass = "warn";
            summaryText = tr("pv_scan_partial", "⚠ مقارنة جزئية");
        }

        container.innerHTML = `
            <table class="pv-scan-table">
                <thead><tr>
                    <th>${tr("pv_scan_col_field", "البند")}</th>
                    <th>${tr("pv_scan_col_app", "التطبيق")}</th>
                    <th>${tr("pv_scan_col_photo", "المحضر")}</th>
                    <th>${tr("pv_scan_col_match", "مطابق")}</th>
                </tr></thead>
                <tbody>${compared.map((r) => {
                    let status = "—";
                    if (r.match === true) status = '<span class="pv-scan-ok">✓</span>';
                    else if (r.match === false) status = '<span class="pv-scan-ko">✗</span>';
                    const photo = r.photo != null && !Number.isNaN(r.photo) ? r.photo : "—";
                    return `<tr><td>${r.label}</td><td class="num" dir="ltr">${r.app}</td><td class="num" dir="ltr">${photo}</td><td>${status}</td></tr>`;
                }).join("")}</tbody>
            </table>
            <div class="pv-scan-summary ${summaryClass}">${summaryText} (${matched}/${checked || 0})</div>
            <details class="pv-scan-raw"><summary>${tr("pv_scan_raw", "النص المستخرج")}</summary>${rawText.slice(0, 1200)}</details>`;
        container.classList.remove("hidden");
    }

    function init(options) {
        const { getState, getBureauId, isReady } = options;
        const section = document.getElementById("pv-scan-section");
        const inputPc = document.getElementById("pv-scan-input");
        const inputCamera = document.getElementById("pv-scan-input-camera");
        const preview = document.getElementById("pv-scan-preview");
        const previewWrap = document.getElementById("pv-scan-preview-wrap");
        const runBtn = document.getElementById("pv-scan-run");
        const statusEl = document.getElementById("pv-scan-status");
        const resultsEl = document.getElementById("pv-scan-results");
        if (!section || !runBtn) return null;
        if (!inputPc && !inputCamera) return null;

        let imageDataUrl = null;

        function setStatus(msg, show = true) {
            if (!statusEl) return;
            statusEl.textContent = msg;
            statusEl.classList.toggle("hidden", !show || !msg);
        }

        function refreshVisibility() {
            const ready = typeof isReady === "function" ? isReady() : true;
            section.style.display = ready ? "" : "none";
        }

        function openPhotoPicker() {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
            if (isPhoneUi() && inputCamera) {
                inputCamera.value = "";
                inputCamera.click();
            } else if (inputPc) {
                inputPc.value = "";
                inputPc.click();
            }
        }

        async function runCompare() {
            if (!imageDataUrl) return;
            const bureauId = getBureauId();
            if (!bureauId) return;

            runBtn.disabled = true;
            setStatus(tr("pv_scan_loading", "جاري قراءة الصورة…"));
            resultsEl?.classList.add("hidden");

            try {
                await loadTesseract();
                const worker = await Tesseract.createWorker("ara+eng", 1, {
                    logger: (m) => {
                        if (m.status === "recognizing text") {
                            setStatus(`${tr("pv_scan_loading", "جاري القراءة…")} ${Math.round((m.progress || 0) * 100)}%`);
                        }
                    },
                });
                const { data } = await worker.recognize(imageDataUrl);
                await worker.terminate();

                const raw = normalizeText(data.text || "");
                const snapshot = buildAppSnapshot(getState(), bureauId);
                renderResults(resultsEl, compareRows(snapshot, parseOcrText(raw, snapshot)), raw);
                setStatus(tr("pv_scan_done", "انتهت المقارنة"));
            } catch (e) {
                setStatus(tr("pv_scan_error", "تعذر قراءة الصورة"));
                console.error(e);
            } finally {
                runBtn.disabled = !imageDataUrl;
            }
        }

        function onFileSelected(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                imageDataUrl = reader.result;
                if (preview) preview.src = imageDataUrl;
                previewWrap?.classList.remove("hidden");
                runBtn.disabled = false;
                resultsEl?.classList.add("hidden");
                setStatus(tr("pv_scan_photo_ok", "تمت الصورة — جاري المقارنة…"));
                if (isPhoneUi()) {
                    runCompare();
                } else {
                    setStatus(tr("pv_scan_photo_pc", "تم اختيار الصورة — اضغط «مقارنة»"));
                }
            };
            reader.readAsDataURL(file);
        }

        function bindInput(el) {
            if (!el) return;
            el.addEventListener("change", () => {
                const file = el.files?.[0];
                onFileSelected(file);
            });
        }

        bindInput(inputPc);
        bindInput(inputCamera);

        document.getElementById("btn-open-pv-scan")?.addEventListener("click", openPhotoPicker);

        runBtn.addEventListener("click", runCompare);

        refreshVisibility();
        return { refreshVisibility, openPhotoPicker };
    }

    window.KasoftPvScan = { init, buildAppSnapshot, isPhoneUi };
})();
