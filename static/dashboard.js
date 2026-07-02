let state = KasoftStore.loadState();

function tr(key) {
    return window.KasoftI18n?.t(key) || key;
}

function statusOptionsHtml() {
    const labelFn = window.KasoftI18n?.statusLabel
        ? (k) => KasoftI18n.statusLabel(k)
        : (k) => KasoftStore.BUREAU_STATUSES[k]?.label || k;
    return Object.keys(KasoftStore.BUREAU_STATUSES)
        .map((k) => `<option value="${k}">${labelFn(k)}</option>`)
        .join("");
}

const els = {
    search: document.getElementById("dash-search"),
    filterStatus: document.getElementById("dash-filter-status"),
    filterRegion: document.getElementById("dash-filter-region"),
    body: document.getElementById("dash-bureau-body"),
    empty: document.getElementById("dash-empty"),
    kpiBureaux: document.getElementById("kpi-bureaux"),
    kpiOuverts: document.getElementById("kpi-ouverts"),
    kpiFermes: document.getElementById("kpi-fermes"),
    kpiInscrits: document.getElementById("kpi-inscrits"),
    kpiParticipation: document.getElementById("kpi-participation"),
    kpiVotants: document.getElementById("kpi-votants"),
    modal: document.getElementById("modal-edit-bureau"),
    editId: document.getElementById("edit-bureau-id"),
    editName: document.getElementById("edit-bureau-name"),
    editVille: document.getElementById("edit-bureau-ville"),
    editRegion: document.getElementById("edit-bureau-region"),
    editCode: document.getElementById("edit-bureau-code"),
    editCentre: document.getElementById("edit-bureau-centre"),
    editAdresse: document.getElementById("edit-bureau-adresse"),
    editInscrits: document.getElementById("edit-bureau-inscrits"),
    editCapacite: document.getElementById("edit-bureau-capacite"),
    editStatus: document.getElementById("edit-bureau-status"),
    btnRapportPdf: document.getElementById("btn-dash-rapport-pdf"),
    btnRapportCsv: document.getElementById("btn-dash-rapport-csv"),
    btnAllPvZip: document.getElementById("btn-dash-all-pv-zip"),
};

function fillRegionSelect(select) {
    const allLabel = tr("dash_all_regions");
    select.innerHTML =
        `<option value="">${allLabel}</option>` +
        KasoftStore.MOROCCO_REGIONS.map((r) => `<option value="${r}">${r}</option>`).join("");
}

function fillStatusSelect(select, includeAll) {
    const opts = statusOptionsHtml();
    select.innerHTML = includeAll
        ? `<option value="">${tr("dash_all_status")}</option>${opts}`
        : opts;
}

function filteredBureaux() {
    const q = els.search.value.trim().toLowerCase();
    const st = els.filterStatus.value;
    const rg = els.filterRegion.value;

    return state.bureaux.filter((b) => {
        if (st && b.status !== st) return false;
        if (rg && b.region !== rg) return false;
        if (!q) return true;
        const hay = `${b.name} ${b.ville} ${b.region}`.toLowerCase();
        return hay.includes(q);
    });
}

function renderKpis() {
    const s = KasoftStore.getDashboardStats(state);
    els.kpiBureaux.textContent = s.totalBureaux;
    els.kpiOuverts.textContent = s.ouverts;
    if (els.kpiFermes) els.kpiFermes.textContent = s.fermes;
    els.kpiInscrits.textContent = s.totalInscrits;
    if (els.kpiVotants) els.kpiVotants.textContent = s.totalVotants;
    els.kpiParticipation.textContent = `${s.participation}%`;
}

function renderTable() {
    const list = filteredBureaux();
    els.empty.classList.toggle("hidden", list.length > 0);

    els.body.innerHTML = list
        .map((b) => {
            const part = KasoftStore.getParticipation(state, b.id);
            const stLabel = window.KasoftI18n?.statusLabel
                ? KasoftI18n.statusLabel(b.status)
                : KasoftStore.BUREAU_STATUSES[b.status]?.label || b.status;
            const statusOpts = Object.keys(KasoftStore.BUREAU_STATUSES)
                .map((k) => {
                    const lbl = window.KasoftI18n?.statusLabel
                        ? KasoftI18n.statusLabel(k)
                        : KasoftStore.BUREAU_STATUSES[k].label;
                    return `<option value="${k}"${b.status === k ? " selected" : ""}>${lbl}</option>`;
                })
                .join("");
            return `
            <tr>
                <td>${b.name}${b.code ? ` <span class="hint num" lang="en-US" dir="ltr">[${b.code}]</span>` : ""}</td>
                <td>${b.ville}</td>
                <td>${b.region}</td>
                <td>
                    <select class="dash-status-select config-input config-input-sm" data-status="${b.id}" aria-label="${tr("dash_th_status")}">
                        ${statusOpts}
                    </select>
                </td>
                <td class="num" lang="en-US">${b.inscrits}</td>
                <td class="num" lang="en-US">${part.valid}</td>
                <td class="num" lang="en-US">${part.votants}</td>
                <td>
                    <div class="part-bar-cell">
                        <div class="part-bar"><div class="part-bar-fill" style="width:${part.pct}%"></div></div>
                        <span class="num" lang="en-US">${part.pct}%</span>
                    </div>
                </td>
                <td class="dash-actions">
                    <button type="button" class="btn-link" data-edit="${b.id}">${tr("dash_edit")}</button>
                    <button type="button" class="btn-link" data-dup="${b.id}">${tr("dash_dup")}</button>
                    <button type="button" class="btn-link" data-pdf="${b.id}">PDF</button>
                    <a href="/comptage?bureau=${b.id}" class="btn-link">${tr("dash_count")}</a>
                    <button type="button" class="btn-link btn-link-danger" data-del="${b.id}">${tr("dash_del")}</button>
                </td>
            </tr>`;
        })
        .join("");
}

function openEditModal(id) {
    const b = state.bureaux.find((x) => x.id === id);
    if (!b) return;
    els.editId.value = b.id;
    els.editName.value = b.name;
    els.editVille.value = b.ville;
    els.editRegion.value = b.region;
    if (els.editCode) els.editCode.value = b.code || "";
    if (els.editCentre) els.editCentre.value = b.centre || "";
    if (els.editAdresse) els.editAdresse.value = b.adresse || "";
    els.editInscrits.value = b.inscrits;
    els.editCapacite.value = b.capacite;
    els.editStatus.value = b.status;
    els.modal.classList.remove("hidden");
}

function renderMap() {
    const mapEl = document.getElementById("morocco-map");
    if (!mapEl) return;
    mapEl.innerHTML = KasoftStore.MOROCCO_REGIONS.map((region) => {
        const stats = KasoftStore.getRegionStats(state, region);
        const active = els.filterRegion.value === region ? " map-region-active" : "";
        const heat =
            stats.pct >= 50 ? " map-region-high" : stats.pct >= 25 ? " map-region-mid" : stats.count ? " map-region-low" : "";
        return `
        <button type="button" class="map-region${active}${heat}" data-region="${region}">
            <strong>${region}</strong>
            <span class="num" lang="en-US">${stats.count}</span> ${tr("dash_map_bureau")}
            <span class="num" lang="en-US">${stats.votants}</span> ${tr("dash_map_voter")}
            <span class="map-pct num" lang="en-US">${stats.pct}%</span>
        </button>`;
    }).join("");
}

function renderPartiRank() {
    const el = document.getElementById("dash-parti-rank");
    if (!el) return;
    const totals = KasoftStore.getPartiRanking(state);
    const max = totals[0]?.total || 1;
    el.innerHTML =
        totals
            .map(
                (p, i) => `
        <div class="rank-row">
            <span class="rank-pos num" lang="en-US">${i + 1}</span>
            <span class="parti-dot" style="background:${p.color}"></span>
            <span class="rank-name">${p.name}</span>
            <div class="rank-bar"><div class="rank-bar-fill" style="width:${max ? Math.round((p.total / max) * 100) : 0}%;background:${p.color}"></div></div>
            <span class="num rank-total" lang="en-US">${p.total}</span>
        </div>`
            )
            .join("") || `<p class="hint">${tr("dash_no_partis")}</p>`;
}

function render() {
    renderKpis();
    renderMap();
    renderPartiRank();
    renderTable();
}

async function exportBureauPdf(bureauId) {
    const bureau = state.bureaux.find((b) => b.id === bureauId);
    if (!bureau) return;
    try {
        await KasoftStore.downloadPdf("/api/kasoft/export-pv-pdf", state, {
            bureau_id: bureauId,
            filename: `محضر_${(bureau.code || bureau.name).replace(/\s+/g, "_")}.pdf`,
        });
        if (window.Ui) Ui.toast("تم تحميل PDF", "success");
    } catch (e) {
        if (window.Ui) Ui.toast(e.message, "error");
    }
}

document.getElementById("morocco-map")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-region]");
    if (!btn) return;
    const region = btn.dataset.region;
    els.filterRegion.value = els.filterRegion.value === region ? "" : region;
    render();
});

els.search.addEventListener("input", renderTable);
els.filterStatus.addEventListener("change", renderTable);
els.filterRegion.addEventListener("change", renderTable);

els.body.addEventListener("change", (e) => {
    const sel = e.target.closest("[data-status]");
    if (!sel) return;
    const b = state.bureaux.find((x) => x.id === sel.dataset.status);
    if (!b) return;
    if (sel.value === "ferme" && b.status !== "ferme" && !confirm("إغلاق هذا المكتب؟")) {
        sel.value = b.status;
        return;
    }
    b.status = sel.value;
    KasoftStore.saveState(state);
    renderKpis();
    renderMap();
});

els.body.addEventListener("click", (e) => {
    const editId = e.target.dataset.edit;
    const dupId = e.target.dataset.dup;
    const pdfId = e.target.dataset.pdf;
    const delId = e.target.dataset.del;
    if (editId) openEditModal(editId);
    if (dupId) {
        KasoftStore.duplicateBureau(state, dupId);
        KasoftStore.saveState(state);
        render();
        if (window.Ui) Ui.toast("تم نسخ المكتب", "success");
    }
    if (pdfId) exportBureauPdf(pdfId);
    if (delId && confirm("حذف هذا المكتب؟")) {
        state.bureaux = state.bureaux.filter((b) => b.id !== delId);
        delete state.votes[delId];
        if (state.pv) delete state.pv[delId];
        KasoftStore.saveState(state);
        render();
    }
});

document.getElementById("btn-save-bureau-edit").addEventListener("click", () => {
    const id = els.editId.value;
    const b = state.bureaux.find((x) => x.id === id);
    if (!b) return;
    Object.assign(b, KasoftStore.normalizeBureau({
        ...b,
        name: els.editName.value.trim(),
        ville: els.editVille.value.trim(),
        region: els.editRegion.value,
        code: (els.editCode?.value || "").trim(),
        centre: (els.editCentre?.value || "").trim(),
        adresse: (els.editAdresse?.value || "").trim(),
        inscrits: els.editInscrits.value,
        capacite: els.editCapacite.value,
        status: els.editStatus.value,
    }));
    KasoftStore.saveState(state);
    els.modal.classList.add("hidden");
    render();
    if (window.Ui) Ui.toast("تم تحديث المكتب", "success");
});

document.getElementById("btn-cancel-bureau-edit").addEventListener("click", () => {
    els.modal.classList.add("hidden");
});

els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) els.modal.classList.add("hidden");
});

if (els.btnRapportPdf) {
    els.btnRapportPdf.addEventListener("click", async () => {
        if (window.Ui) Ui.setLoading(els.btnRapportPdf, true);
        try {
            await KasoftStore.downloadPdf("/api/kasoft/rapport-pdf", state, {
                filename: "التقرير_الإقليمي.pdf",
            });
            if (window.Ui) Ui.toast("تم تحميل PDF", "success");
        } catch (e) {
            if (window.Ui) Ui.toast(e.message, "error");
        } finally {
            if (window.Ui) Ui.setLoading(els.btnRapportPdf, false);
        }
    });
}

if (els.btnRapportCsv) {
    els.btnRapportCsv.addEventListener("click", () => {
        KasoftStore.downloadCsv(
            "التقرير_الإقليمي.csv",
            KasoftStore.buildRegionalReportCsv(state)
        );
        if (window.Ui) Ui.toast("تم تحميل CSV", "success");
    });
}

if (els.btnAllPvZip) {
    els.btnAllPvZip.addEventListener("click", async () => {
        if (window.Ui) Ui.setLoading(els.btnAllPvZip, true);
        try {
            await KasoftStore.downloadZip("/api/kasoft/export-all-pv-zip", state, {
                filename: "محاضر_المكاتب.zip",
            });
            if (window.Ui) Ui.toast("تم تحميل الأرشيف", "success");
        } catch (e) {
            if (window.Ui) Ui.toast(e.message, "error");
        } finally {
            if (window.Ui) Ui.setLoading(els.btnAllPvZip, false);
        }
    });
}

fillRegionSelect(els.filterRegion);
fillRegionSelect(els.editRegion);
fillStatusSelect(els.filterStatus, true);
fillStatusSelect(els.editStatus, false);

document.addEventListener("kasoft:lang", () => {
    if (window.KasoftI18n) KasoftI18n.applyI18n();
    fillRegionSelect(els.filterRegion);
    fillRegionSelect(els.editRegion);
    fillStatusSelect(els.filterStatus, true);
    fillStatusSelect(els.editStatus, false);
    render();
});

KasoftStore.loadStateAsync().then((s) => {
    state = s;
    render();
});

setInterval(async () => {
    if (document.hidden) return;
    try {
        const remote = await KasoftStore.fetchRemoteState();
        if (!remote) return;
        const merged = KasoftStore.mergeStates(state, remote);
        if (KasoftStore.stateSignature(merged) !== KasoftStore.stateSignature(state)) {
            state = merged;
            KasoftStore.saveState(state, { skipSync: true });
            render();
        }
    } catch {
        /* hors-ligne */
    }
}, 30000);
