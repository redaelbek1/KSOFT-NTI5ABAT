/**
 * Logos des partis — badge d'affichage + sélecteur.
 *
 * Le catalogue (static/parties/catalog.json) est généré par
 * deploy/fetch_party_logos.py. Le logo est obligatoire à la création d'un parti ;
 * le badge lettre coloré ne sert plus que de repli pour les données anciennes.
 *
 * KasoftLogos.badge(parti)              → HTML du logo (ou badge lettre)
 * KasoftLogos.catalog()                 → Promise<[{id,name,color,logo}]>
 * KasoftLogos.pick({name, logo, color}) → Promise<{name,logo,color}|null>
 * KasoftLogos.autofill(partis)          → Promise<bool> (logos manquants par nom)
 * KasoftLogos.nameKey(nom)              → clé de comparaison des noms de partis
 */
(function () {
    const CATALOG_URL = "/static/parties/catalog.json";
    const UPLOAD_SIZE = 128; // px — les logos téléversés sont stockés dans l'état
    let catalogPromise = null;

    function escapeHtml(text) {
        return String(text ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    function catalog() {
        if (!catalogPromise) {
            catalogPromise = fetch(CATALOG_URL)
                .then((res) => (res.ok ? res.json() : []))
                .catch(() => []);
        }
        return catalogPromise;
    }

    function badge(parti, options = {}) {
        const cls = options.className ? ` ${options.className}` : "";
        const name = escapeHtml(parti?.name || "");
        if (parti?.logo) {
            return `<span class="parti-logo${cls}"><img src="${escapeHtml(parti.logo)}" alt="${name}" loading="lazy"></span>`;
        }
        const letter = escapeHtml((parti?.name || "؟").trim().charAt(0));
        const color = escapeHtml(parti?.color || "#5b7c99");
        return `<span class="parti-logo parti-logo-letter${cls}" style="background:${color}" aria-hidden="true">${letter}</span>`;
    }

    /** Réduit un fichier image en data URL PNG de UPLOAD_SIZE px max. */
    function fileToLogo(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error("لا يمكن قراءة الملف"));
            reader.onload = () => {
                const img = new Image();
                img.onerror = () => reject(new Error("صورة غير صالحة"));
                img.onload = () => {
                    const scale = Math.min(1, UPLOAD_SIZE / Math.max(img.width, img.height));
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(img.width * scale));
                    canvas.height = Math.max(1, Math.round(img.height * scale));
                    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/png"));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function buildModal() {
        const modal = document.createElement("div");
        modal.className = "modal logo-picker hidden";
        modal.innerHTML = `
            <div class="modal-box modal-box-wide">
                <h3>اختر شعار الحزب</h3>
                <input type="search" class="config-input logo-picker-search" placeholder="ابحث عن حزب…">
                <div class="logo-picker-grid"></div>
                <div class="modal-actions logo-picker-actions">
                    <label class="btn-secondary btn-file-label">
                        <span>صورة من الجهاز</span>
                        <input type="file" accept="image/*" class="hidden-file-input logo-picker-file">
                    </label>
                    <button type="button" class="btn-secondary logo-picker-cancel">إلغاء</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    let modal = null;

    async function pick(current = {}) {
        if (!modal) modal = buildModal();
        const grid = modal.querySelector(".logo-picker-grid");
        const search = modal.querySelector(".logo-picker-search");
        const entries = await catalog();

        const renderGrid = (filter = "") => {
            const needle = filter.trim();
            const shown = needle
                ? entries.filter((e) => e.name.includes(needle))
                : entries;
            grid.innerHTML = shown.length
                ? shown
                    .map(
                        (e, i) => `
                    <button type="button" class="logo-choice${e.logo === current.logo ? " logo-choice-active" : ""}" data-index="${entries.indexOf(e)}">
                        ${badge(e, { className: "parti-logo-lg" })}
                        <span class="logo-choice-name">${escapeHtml(e.name)}</span>
                    </button>`
                    )
                    .join("")
                : '<p class="hint">لا نتيجة — استعمل صورة من الجهاز.</p>';
        };
        renderGrid();
        search.value = "";
        modal.classList.remove("hidden");
        search.focus();

        return new Promise((resolve) => {
            const close = (result) => {
                modal.classList.add("hidden");
                search.removeEventListener("input", onSearch);
                grid.removeEventListener("click", onChoice);
                modal.removeEventListener("click", onBackdrop);
                fileInput.removeEventListener("change", onFile);
                cancelBtn.removeEventListener("click", onCancel);
                resolve(result);
            };
            const onSearch = () => renderGrid(search.value);
            const onChoice = (e) => {
                const btn = e.target.closest(".logo-choice");
                if (!btn) return;
                const entry = entries[Number(btn.dataset.index)];
                close({ name: entry.name, logo: entry.logo, color: entry.color });
            };
            const onBackdrop = (e) => {
                if (e.target === modal) close(null);
            };
            const onFile = async () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                try {
                    const logo = await fileToLogo(file);
                    close({ logo });
                } catch (err) {
                    if (window.Ui) Ui.toast(err.message, "error");
                    else alert(err.message);
                } finally {
                    fileInput.value = "";
                }
            };
            const onCancel = () => close(null);

            const fileInput = modal.querySelector(".logo-picker-file");
            const cancelBtn = modal.querySelector(".logo-picker-cancel");
            search.addEventListener("input", onSearch);
            grid.addEventListener("click", onChoice);
            modal.addEventListener("click", onBackdrop);
            fileInput.addEventListener("change", onFile);
            cancelBtn.addEventListener("click", onCancel);
        });
    }

    /** Clé de comparaison des noms de partis (variantes d'alef, espaces, préfixe « حزب »). */
    function nameKey(name) {
        return String(name || "")
            .replace(/[ً-ْـ]/g, "")
            .replace(/[أإآ]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي")
            .replace(/\s+/g, "")
            .replace(/^حزب/, "");
    }

    /**
     * Complète les partis existants qui n'ont pas encore d'image, par
     * correspondance de nom avec le catalogue. Renvoie true si quelque chose
     * a changé.
     */
    async function autofill(partis) {
        const missing = (partis || []).filter((p) => !p.logo);
        if (!missing.length) return false;
        const entries = await catalog();
        const byName = new Map(entries.map((e) => [nameKey(e.name), e]));
        let changed = false;
        missing.forEach((p) => {
            const match = byName.get(nameKey(p.name));
            if (!match) return;
            p.logo = match.logo;
            if (match.color) p.color = match.color;
            changed = true;
        });
        return changed;
    }

    window.KasoftLogos = { badge, catalog, pick, fileToLogo, autofill, nameKey };
})();
