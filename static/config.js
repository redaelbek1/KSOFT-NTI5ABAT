let state = KasoftStore.loadState();

const els = {
    bureauName: document.getElementById("bureau-name"),
    bureauVille: document.getElementById("bureau-ville"),
    bureauRegion: document.getElementById("bureau-region"),
    bureauCode: document.getElementById("bureau-code"),
    bureauCentre: document.getElementById("bureau-centre"),
    bureauAdresse: document.getElementById("bureau-adresse"),
    bureauInscrits: document.getElementById("bureau-inscrits"),
    bureauCapacite: document.getElementById("bureau-capacite"),
    bureauStatus: document.getElementById("bureau-status"),
    btnAddBureau: document.getElementById("btn-add-bureau"),
    bureauList: document.getElementById("bureau-list"),
    partiName: document.getElementById("parti-name"),
    btnAddParti: document.getElementById("btn-add-parti"),
    partiList: document.getElementById("parti-list"),
    mourakibParti: document.getElementById("mourakib-parti"),
    mourakibName: document.getElementById("mourakib-name"),
    btnAddMourakib: document.getElementById("btn-add-mourakib"),
    mourakibGroups: document.getElementById("mourakib-groups"),
    btnSave: document.getElementById("btn-save-config"),
    btnSync: document.getElementById("btn-sync-server"),
    btnDemo: document.getElementById("btn-load-demo"),
    btnBackup: document.getElementById("btn-export-backup"),
    inputRestore: document.getElementById("btn-import-backup"),
    btnClearAll: document.getElementById("btn-clear-all"),
    status: document.getElementById("config-status"),
    modalRename: document.getElementById("modal-rename-parti"),
    renameId: document.getElementById("rename-parti-id"),
    renameName: document.getElementById("rename-parti-name"),
    renameColor: document.getElementById("rename-parti-color"),
    modalEditBureau: document.getElementById("modal-edit-bureau"),
    editBureauId: document.getElementById("edit-bureau-id"),
    editBureauName: document.getElementById("edit-bureau-name"),
    editBureauVille: document.getElementById("edit-bureau-ville"),
    editBureauRegion: document.getElementById("edit-bureau-region"),
    editBureauCode: document.getElementById("edit-bureau-code"),
    editBureauCentre: document.getElementById("edit-bureau-centre"),
    editBureauAdresse: document.getElementById("edit-bureau-adresse"),
    editBureauInscrits: document.getElementById("edit-bureau-inscrits"),
    editBureauCapacite: document.getElementById("edit-bureau-capacite"),
    editBureauStatus: document.getElementById("edit-bureau-status"),
};

function persist(msg) {
    KasoftStore.saveState(state);
    if (!msg) return;
    if (window.Ui) {
        Ui.toast(msg, "success");
    } else if (els.status) {
        els.status.textContent = msg;
        setTimeout(() => { els.status.textContent = ""; }, 2500);
    }
}

function statusOptionsHtml() {
    const t = window.KasoftI18n?.statusLabel || ((k) => KasoftStore.BUREAU_STATUSES[k]?.label || k);
    return Object.keys(KasoftStore.BUREAU_STATUSES)
        .map((k) => `<option value="${k}">${t(k)}</option>`)
        .join("");
}

function initSelects() {
    els.bureauRegion.innerHTML = KasoftStore.MOROCCO_REGIONS.map(
        (r) => `<option value="${r}">${r}</option>`
    ).join("");
    els.bureauStatus.innerHTML = statusOptionsHtml();
    if (els.editBureauStatus) els.editBureauStatus.innerHTML = statusOptionsHtml();
}

function renderBureaux() {
    els.bureauList.innerHTML = state.bureaux
        .map((b) => {
            const stLabel = window.KasoftI18n?.statusLabel
                ? KasoftI18n.statusLabel(b.status)
                : KasoftStore.BUREAU_STATUSES[b.status]?.label || b.status;
            return `
        <li class="config-item">
            <span>
                <strong>${b.name}</strong> — ${b.ville} — ${b.region}
                <br><span class="hint">${stLabel} | كود: <span class="num" lang="en-US" dir="ltr">${b.code || "—"}</span> | <span class="num" lang="en-US">${b.inscrits}</span> مسجل | سعة <span class="num" lang="en-US">${b.capacite}</span></span>
            </span>
            <span class="config-item-actions">
                <button type="button" class="btn-icon-edit" data-edit-bureau="${b.id}" title="تعديل">✎</button>
                <button type="button" class="btn-icon-edit" data-dup-bureau="${b.id}" title="نسخ">⧉</button>
                <button type="button" class="btn-icon-del" data-del-bureau="${b.id}" title="حذف">✕</button>
            </span>
        </li>`;
        })
        .join("");
}

function renderPartis() {
    els.partiList.innerHTML = state.partis
        .map(
            (p) => `
        <li class="config-item">
            <span class="parti-dot" style="background:${p.color}"></span>
            <span>${p.name}</span>
            <button type="button" class="btn-icon-edit" data-rename-parti="${p.id}" title="إعادة تسمية">✎</button>
            <button type="button" class="btn-icon-del" data-del-parti="${p.id}" title="حذف">✕</button>
        </li>`
        )
        .join("");

    els.mourakibParti.innerHTML = state.partis
        .map((p) => `<option value="${p.id}">${p.name}</option>`)
        .join("");
}

function renderMourakibs() {
    els.mourakibGroups.innerHTML = state.partis
        .map((p) => {
            const list = state.mourakibs[p.id] || [];
            const items = list
                .map(
                    (m) => `
                <li class="config-item config-item-sm">
                    <span>${m.name}</span>
                    <button type="button" class="btn-icon-del" data-del-mourakib="${p.id}:${m.id}">✕</button>
                </li>`
                )
                .join("");
            return `
            <div class="mourakib-group">
                <h4><span class="parti-dot" style="background:${p.color}"></span> ${p.name}</h4>
                <ul class="config-list">${items || '<li class="hint">لا يوجد مراقبون</li>'}</ul>
            </div>`;
        })
        .join("");
}

function duplicateBureau(id) {
    if (!KasoftStore.duplicateBureau(state, id)) return;
    render();
    persist("تم نسخ المكتب");
}

function openEditBureauModal(id) {
    const b = state.bureaux.find((x) => x.id === id);
    if (!b) return;
    els.editBureauId.value = b.id;
    els.editBureauName.value = b.name;
    els.editBureauVille.value = b.ville;
    els.editBureauRegion.value = b.region;
    els.editBureauCode.value = b.code || "";
    els.editBureauCentre.value = b.centre || "";
    els.editBureauAdresse.value = b.adresse || "";
    els.editBureauInscrits.value = b.inscrits;
    els.editBureauCapacite.value = b.capacite;
    els.editBureauStatus.value = b.status;
    els.modalEditBureau.classList.remove("hidden");
}

function render() {
    renderBureaux();
    renderPartis();
    renderMourakibs();
}

els.btnAddBureau.addEventListener("click", () => {
    const name = els.bureauName.value.trim();
    if (!name) return alert("أدخل اسم المكتب");
    state.bureaux.push(
        KasoftStore.normalizeBureau({
            id: KasoftStore.uid(),
            name,
            ville: els.bureauVille.value.trim(),
            region: els.bureauRegion.value,
            code: (els.bureauCode?.value || "").trim(),
            centre: (els.bureauCentre?.value || "").trim(),
            adresse: (els.bureauAdresse?.value || "").trim(),
            inscrits: els.bureauInscrits.value,
            capacite: els.bureauCapacite.value || els.bureauInscrits.value,
            status: els.bureauStatus.value,
        })
    );
    els.bureauName.value = "";
    els.bureauVille.value = "";
    if (els.bureauCode) els.bureauCode.value = "";
    if (els.bureauCentre) els.bureauCentre.value = "";
    if (els.bureauAdresse) els.bureauAdresse.value = "";
    els.bureauInscrits.value = "";
    els.bureauCapacite.value = "";
    render();
    persist("تمت الإضافة");
});

els.btnAddParti.addEventListener("click", () => {
    const name = els.partiName.value.trim();
    if (!name) return alert("أدخل اسم الحزب");
    const id = KasoftStore.uid();
    const color = KasoftStore.PARTY_COLORS[state.partis.length % KasoftStore.PARTY_COLORS.length];
    state.partis.push({ id, name, color });
    state.mourakibs[id] = [];
    els.partiName.value = "";
    render();
    persist("تمت الإضافة");
});

els.btnAddMourakib.addEventListener("click", () => {
    const partiId = els.mourakibParti.value;
    const name = els.mourakibName.value.trim();
    if (!name) return alert("أدخل اسم المراقب");
    if (!state.mourakibs[partiId]) state.mourakibs[partiId] = [];
    state.mourakibs[partiId].push({ id: KasoftStore.uid(), name });
    els.mourakibName.value = "";
    render();
    persist("تمت الإضافة");
});

els.bureauList.addEventListener("click", (e) => {
    const editId = e.target.dataset.editBureau;
    const dupId = e.target.dataset.dupBureau;
    const id = e.target.dataset.delBureau;
    if (editId) openEditBureauModal(editId);
    if (dupId) duplicateBureau(dupId);
    if (!id) return;
    if (!confirm("حذف هذا المكتب؟")) return;
    state.bureaux = state.bureaux.filter((b) => b.id !== id);
    delete state.votes[id];
    if (state.pv) delete state.pv[id];
    render();
    persist("تم الحذف");
});

els.partiList.addEventListener("click", (e) => {
    const renameId = e.target.dataset.renameParti;
    const delId = e.target.dataset.delParti;
    if (renameId) {
        const p = state.partis.find((x) => x.id === renameId);
        els.renameId.value = renameId;
        els.renameName.value = p?.name || "";
        if (els.renameColor) els.renameColor.value = p?.color || "#1565c0";
        els.modalRename.classList.remove("hidden");
    }
    if (delId) {
        if (!confirm("حذف هذا الحزب وجميع مراقبيه؟")) return;
        state.partis = state.partis.filter((p) => p.id !== delId);
        delete state.mourakibs[delId];
        Object.keys(state.votes).forEach((bid) => delete state.votes[bid][delId]);
        render();
        persist("تم الحذف");
    }
});

els.mourakibGroups.addEventListener("click", (e) => {
    const key = e.target.dataset.delMourakib;
    if (!key) return;
    const [partiId, mourakibId] = key.split(":");
    state.mourakibs[partiId] = (state.mourakibs[partiId] || []).filter((m) => m.id !== mourakibId);
    Object.keys(state.votes).forEach((bid) => {
        if (state.votes[bid][partiId]) delete state.votes[bid][partiId][mourakibId];
    });
    render();
    persist("تم الحذف");
});

document.getElementById("btn-save-rename").addEventListener("click", () => {
    const id = els.renameId.value;
    const name = els.renameName.value.trim();
    if (!name) return alert("أدخل الاسم");
    const p = state.partis.find((x) => x.id === id);
    if (p) {
        p.name = name;
        if (els.renameColor) p.color = els.renameColor.value;
    }
    els.modalRename.classList.add("hidden");
    render();
    persist("تم تحديث الحزب");
});

document.getElementById("btn-cancel-rename").addEventListener("click", () => {
    els.modalRename.classList.add("hidden");
});

els.modalRename.addEventListener("click", (e) => {
    if (e.target === els.modalRename) els.modalRename.classList.add("hidden");
});

document.getElementById("btn-save-bureau-edit").addEventListener("click", () => {
    const id = els.editBureauId.value;
    const b = state.bureaux.find((x) => x.id === id);
    if (!b) return;
    const name = els.editBureauName.value.trim();
    if (!name) return alert("أدخل اسم المكتب");
    Object.assign(
        b,
        KasoftStore.normalizeBureau({
            ...b,
            name,
            ville: els.editBureauVille.value.trim(),
            region: els.editBureauRegion.value,
            code: (els.editBureauCode.value || "").trim(),
            centre: (els.editBureauCentre.value || "").trim(),
            adresse: (els.editBureauAdresse.value || "").trim(),
            inscrits: els.editBureauInscrits.value,
            capacite: els.editBureauCapacite.value,
            status: els.editBureauStatus.value,
        })
    );
    els.modalEditBureau.classList.add("hidden");
    render();
    persist("تم تحديث المكتب");
});

document.getElementById("btn-cancel-bureau-edit").addEventListener("click", () => {
    els.modalEditBureau.classList.add("hidden");
});

els.modalEditBureau.addEventListener("click", (e) => {
    if (e.target === els.modalEditBureau) els.modalEditBureau.classList.add("hidden");
});

els.btnSave.addEventListener("click", () => persist("تم حفظ الإعدادات بنجاح"));

els.btnSync.addEventListener("click", async () => {
    KasoftStore.saveState(state);
    if (window.Ui) Ui.setLoading(els.btnSync, true, "جاري المزامنة...");
    else if (els.status) els.status.textContent = "جاري المزامنة...";
    try {
        const s = await KasoftStore.loadStateAsync();
        state = s;
        render();
        if (window.Ui) Ui.toast("تمت المزامنة مع الخادم", "success");
        else if (els.status) els.status.textContent = "تمت المزامنة مع الخادم";
    } catch {
        if (window.Ui) Ui.toast("فشلت المزامنة", "error");
        else if (els.status) els.status.textContent = "فشلت المزامنة";
    } finally {
        if (window.Ui) Ui.setLoading(els.btnSync, false);
        else setTimeout(() => { if (els.status) els.status.textContent = ""; }, 2500);
    }
});

if (els.btnDemo) {
    els.btnDemo.addEventListener("click", async () => {
        if (!confirm("تحميل بيانات تجريبية؟ سيتم استبدال الإعدادات الحالية.")) return;
        if (window.Ui) Ui.setLoading(els.btnDemo, true, "جاري التحميل...");
        try {
            const res = await fetch("/api/kasoft/load-demo", {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "فشل التحميل");
            state = KasoftStore.migrateState(data.state);
            KasoftStore.saveState(state);
            render();
            if (window.Ui) Ui.toast("تم تحميل البيانات التجريبية", "success");
            else persist("تم تحميل البيانات التجريبية");
        } catch (e) {
            if (window.Ui) Ui.toast(e.message, "error");
            else alert(e.message);
        } finally {
            if (window.Ui) Ui.setLoading(els.btnDemo, false);
        }
    });
}

if (els.btnBackup) {
    els.btnBackup.addEventListener("click", () => {
        KasoftStore.exportBackup(state);
        if (window.Ui) Ui.toast("تم تنزيل النسخة الاحتياطية", "success");
    });
}

if (els.inputRestore) {
    els.inputRestore.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!confirm("استعادة النسخة الاحتياطية؟ سيتم استبدال البيانات الحالية.")) return;
        try {
            state = await KasoftStore.restoreBackup(file);
            render();
            if (window.Ui) Ui.toast("تمت الاستعادة بنجاح", "success");
            else persist("تمت الاستعادة بنجاح");
        } catch (err) {
            if (window.Ui) Ui.toast(err.message, "error");
            else alert(err.message);
        }
    });
}

if (els.btnClearAll) {
    els.btnClearAll.addEventListener("click", async () => {
        if (!confirm("مسح كل البيانات (مكاتب، أحزاب، أصوات)؟ لا يمكن التراجع.")) return;
        try {
            const res = await fetch("/api/kasoft/clear", {
                method: "POST",
                credentials: "same-origin",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "فشل المسح");
            state = KasoftStore.migrateState(data.state || KasoftStore.defaultConfig());
            KasoftStore.saveState(state);
            render();
            if (window.Ui) Ui.toast("تم مسح كل البيانات", "success");
        } catch (err) {
            if (window.Ui) Ui.toast(err.message, "error");
            else alert(err.message);
        }
    });
}

initSelects();
if (els.editBureauRegion) {
    els.editBureauRegion.innerHTML = KasoftStore.MOROCCO_REGIONS.map(
        (r) => `<option value="${r}">${r}</option>`
    ).join("");
}
document.addEventListener("kasoft:lang", () => {
    initSelects();
    if (window.KasoftI18n) KasoftI18n.applyI18n();
    render();
});
KasoftStore.loadStateAsync().then((s) => {
    state = s;
    render();
});
