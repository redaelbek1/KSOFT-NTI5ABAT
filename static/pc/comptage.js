let state = KasoftStore.loadState();

function tr(key) {
    return window.KasoftI18n?.t(key) || key;
}

const els = {
    empty: document.getElementById("comptage-empty"),
    app: document.getElementById("comptage-app"),
    bureau: document.getElementById("comptage-bureau"),
    status: document.getElementById("comptage-status"),
    mourakibActif: document.getElementById("mourakib-actif"),
    totalVotes: document.getElementById("total-votes"),
    participationPct: document.getElementById("participation-pct"),
    participationDetail: document.getElementById("participation-detail"),
    pvDetail: document.getElementById("pv-detail"),
    pvBlancs: document.getElementById("pv-blancs"),
    pvNuls: document.getElementById("pv-nuls"),
    pvVotants: document.getElementById("pv-votants"),
    pvNumero: document.getElementById("pv-numero"),
    breakdown: document.getElementById("totals-breakdown"),
    grid: document.getElementById("parti-grid"),
    journal: document.getElementById("journal-body"),
    journalFilterWrap: document.getElementById("journal-filter-wrap"),
    journalFilter: document.getElementById("journal-filter-bureau"),
    journalBureauTh: document.getElementById("th-journal-bureau"),
    btnExport: document.getElementById("btn-export-pv"),
    btnExportPdf: document.getElementById("btn-export-pv-pdf"),
    btnRegional: document.getElementById("btn-export-regional"),
    btnRegionalPdf: document.getElementById("btn-export-regional-pdf"),
    btnRegionalCsv: document.getElementById("btn-export-regional-csv"),
    btnJournal: document.getElementById("btn-export-journal"),
    btnAllPvZip: document.getElementById("btn-export-all-pv-zip"),
    btnResetVotes: document.getElementById("btn-reset-bureau-votes"),
    btnCloture: document.getElementById("btn-cloture-bureau"),
    btnEmailPv: document.getElementById("btn-email-pv"),
    btnSendSummary: document.getElementById("btn-send-summary"),
    keyboardHint: document.getElementById("keyboard-hint"),
    lockedBanner: document.getElementById("comptage-locked-banner"),
    closeSuggestion: document.getElementById("close-suggestion"),
    pvWarning: document.getElementById("pv-warning"),
};

let lastVoteTarget = null;

const isAdmin = () => (window.KASOFT_ROLE || "admin") === "admin";

function scopedBureauId() {
    return window.KASOFT_SCOPED_BUREAU_ID || null;
}

function enforceScopedBureau() {
    const sid = scopedBureauId();
    if (sid) state.currentBureau = sid;
}

function bureauxForSelect() {
    const sid = scopedBureauId();
    if (!sid) return state.bureaux;
    const list = state.bureaux.filter((b) => b.id === sid);
    return list.length ? list : [{ id: sid, name: sid, status: "attente" }];
}

function isReady() {
    return state.bureaux.length > 0 && state.partis.length > 0;
}

function currentBureauId() {
    return els.bureau.value || state.currentBureau;
}

function currentBureau() {
    return state.bureaux.find((b) => b.id === currentBureauId());
}

function persist() {
    state.currentBureau = currentBureauId();
    state.mourakibActif = els.mourakibActif.value.trim();
    const b = currentBureau();
    if (b) b.status = els.status.value;
    const bid = currentBureauId();
    state.pv = state.pv || {};
    KasoftStore.ensurePvNumber(state, bid);
    state.pv[bid] = {
        ...state.pv[bid],
        blancs: els.pvBlancs?.value || 0,
        nuls: els.pvNuls?.value || 0,
        votants: els.pvVotants?.value || "",
    };
    KasoftStore.saveState(state);
}

function requireActif() {
    const name = els.mourakibActif.value.trim();
    if (!name) {
        alert("المرجو إدخال اسم المراقب النشط قبل التسجيل");
        els.mourakibActif.focus();
        return null;
    }
    return name;
}

function isLocked() {
    return KasoftStore.isBureauLocked(state, currentBureauId());
}

function showPvValidation() {
    if (!els.pvWarning) return;
    const check = KasoftStore.validateBureauPV(state, currentBureauId());
    const msgs = [...check.errors, ...check.warnings];
    if (!msgs.length) {
        els.pvWarning.classList.add("hidden");
        els.pvWarning.textContent = "";
        return;
    }
    els.pvWarning.classList.remove("hidden");
    els.pvWarning.textContent = msgs.join(" — ");
    els.pvWarning.classList.toggle("pv-warning-error", check.errors.length > 0);
}

function resetBureauVotes() {
    if (isLocked()) {
        if (window.Ui) Ui.toast("المكتب مغلق", "error");
        return;
    }
    const bureau = currentBureau();
    if (!bureau) return;
    if (!confirm(`إعادة تعيين كل أصوات «${bureau.name}»؟ لا يمكن التراجع.`)) return;
    const bid = currentBureauId();
    delete state.votes[bid];
    if (state.pv?.[bid]) {
        state.pv[bid].blancs = 0;
        state.pv[bid].nuls = 0;
        state.pv[bid].votants = "";
    }
    persist();
    render();
    if (window.Ui) Ui.toast("تم إعادة التعيين", "success");
}

function applyVoteLocally(partiId, mourakibId, delta, actif) {
    const bureauId = currentBureauId();
    const bucket = KasoftStore.ensureVotes(state, bureauId);
    if (!bucket[partiId]) bucket[partiId] = {};
    const current = bucket[partiId][mourakibId] || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return false;

    bucket[partiId][mourakibId] = next;
    const parti = state.partis.find((p) => p.id === partiId);
    KasoftStore.addJournalEntry(state, {
        time: new Date().toISOString(),
        bureauId,
        actif,
        partiId,
        mourakibId,
        parti: parti?.name || "",
        mourakib: KasoftStore.voteListLabel(mourakibId),
        action: delta > 0 ? "+1" : "-1",
        total: next,
        partiTotal: KasoftStore.getPartiTotal(state, bureauId, partiId),
    });
    return true;
}

async function changeVote(partiId, mourakibId, delta, actifOverride) {
    if (isLocked()) {
        if (window.Ui) Ui.toast("المكتب مغلق — لا يمكن تعديل الأصوات", "error");
        else alert("المكتب مغلق — لا يمكن تعديل الأصوات");
        return false;
    }
    const actif = actifOverride || requireActif();
    if (!actif) return false;

    const bureauId = currentBureauId();
    const bureau = currentBureau();
    const part = KasoftStore.getParticipation(state, bureauId);
    if (delta > 0 && bureau?.inscrits && part.valid + part.blancs + part.nuls + 1 > bureau.inscrits) {
        if (window.Ui) Ui.toast("لا يمكن تجاوز عدد المسجلين", "error");
        else alert("لا يمكن تجاوز عدد المسجلين");
        return false;
    }

    try {
        const data = await KasoftStore.postVoteDelta(
            bureauId, partiId, mourakibId, delta, actif
        );
        if (data.state) {
            state = KasoftStore.applyServerState(state, data.state, { authoritativeVotes: true });
        }
        render();
        return true;
    } catch {
        /* hors-ligne — repli local */
    }

    if (!applyVoteLocally(partiId, mourakibId, delta, actif)) return false;
    persist();
    render();
    return true;
}

function resolveJournalTarget(entry) {
    if (entry.partiId && entry.mourakibId) {
        return { partiId: entry.partiId, mourakibId: entry.mourakibId };
    }
    const parti = state.partis.find((p) => p.name === entry.parti);
    if (!parti) return null;
    const list = KasoftStore.VOTE_LISTS.find((l) => l.label === entry.mourakib);
    if (!list) return null;
    return { partiId: parti.id, mourakibId: list.id };
}

function findLastPlusEntry(bureauId) {
    for (const j of state.journal || []) {
        if (j.bureauId !== bureauId) continue;
        if (j.action === "-1" || j.action === "تراجع") return null;
        if (j.action !== "+1") continue;
        const ids = resolveJournalTarget(j);
        if (!ids) return null;
        const count = KasoftStore.getMourakibCount(state, bureauId, ids.partiId, ids.mourakibId);
        if (count > 0) return { entry: j, ...ids };
        return null;
    }
    return null;
}

async function performUndo(actif) {
    const last = findLastPlusEntry(currentBureauId());
    if (!last) {
        alert(tr("phone_undo_none") || "لا يوجد + لحذفه");
        return false;
    }
    return changeVote(last.partiId, last.mourakibId, -1, actif);
}

function renderCloseSuggestion() {
    if (!els.closeSuggestion) return;
    const b = currentBureau();
    const part = KasoftStore.getParticipation(state, currentBureauId());
    const show = b?.status === "ouvert" && part.valid > 0;
    els.closeSuggestion.classList.toggle("hidden", !show);
}

function renderLockedState() {
    const locked = isLocked();
    if (els.lockedBanner) els.lockedBanner.classList.toggle("hidden", !locked);
    if (els.grid) els.grid.classList.toggle("comptage-locked", locked);
    els.grid?.querySelectorAll(".ptable-plus").forEach((btn) => {
        btn.disabled = locked;
    });
    if (els.pvBlancs) els.pvBlancs.disabled = locked;
    if (els.pvNuls) els.pvNuls.disabled = locked;
    if (els.pvVotants) els.pvVotants.disabled = locked;
    bureauCounters?.refresh();
}

function renderParticipation() {
    const bureauId = currentBureauId();
    const part = KasoftStore.getParticipation(state, bureauId);
    els.participationPct.textContent = `${part.pct}%`;
    els.participationDetail.textContent = `${part.votants} / ${part.inscrits} مسجل`;
    if (els.pvDetail) {
        els.pvDetail.textContent = `صحيحة: ${part.valid} | بيضاء: ${part.blancs} | ملغاة: ${part.nuls}`;
    }
    showPvValidation();
}

function renderTotals() {
    const bureauId = currentBureauId();
    const total = KasoftStore.getBureauTotal(state, bureauId);
    els.totalVotes.textContent = String(total);
    renderParticipation();

    const partiTotals = state.partis.map((p) => ({
        ...p,
        total: KasoftStore.getPartiTotal(state, bureauId, p.id),
    }));
    const leaderId = partiTotals.reduce(
        (best, p) => (p.total > (best?.total || 0) ? p : best),
        null
    )?.id;

    els.breakdown.innerHTML = partiTotals
        .map((p) => {
            const pct = total ? Math.round((p.total / total) * 100) : 0;
            return `<span class="breakdown-item" style="border-color:${p.color}">
                ${p.name}: <strong class="num" lang="en-US" dir="ltr">${p.total}</strong>
                (<span class="num" lang="en-US">${pct}%</span>)
            </span>`;
        })
        .join("");

    return leaderId;
}

function renderGrid(leaderId) {
    els.grid.innerHTML = KasoftPartiesTable.render({
        state,
        bureauId: currentBureauId(),
        locked: isLocked(),
        leaderId,
    });
}

function journalFilterId() {
    if (!isAdmin()) return currentBureauId();
    const v = els.journalFilter?.value;
    if (v === undefined || v === null || v === "") return "*";
    return v;
}

function renderJournalFilter() {
    if (!els.journalFilterWrap || !els.journalFilter) return;
    if (!isAdmin()) {
        els.journalFilterWrap.classList.add("hidden");
        if (els.journalBureauTh) els.journalBureauTh.classList.add("hidden");
        return;
    }
    els.journalFilterWrap.classList.remove("hidden");
    if (els.journalBureauTh) els.journalBureauTh.classList.remove("hidden");
    const prev = els.journalFilter.value || "*";
    const allLabel = tr("cpt_journal_all_bureaux");
    els.journalFilter.innerHTML =
        `<option value="*">${allLabel}</option>` +
        state.bureaux
            .map((b) => {
                const code = b.code ? ` [${b.code}]` : "";
                return `<option value="${b.id}">${b.name}${code}</option>`;
            })
            .join("");
    if ([...els.journalFilter.options].some((o) => o.value === prev)) {
        els.journalFilter.value = prev;
    } else {
        els.journalFilter.value = "*";
    }
}

function renderJournal() {
    renderJournalFilter();
    const filterId = journalFilterId();
    const showBureau = isAdmin() && filterId === "*";
    const entries = KasoftStore.filterJournalForBureau(state, filterId);
    const colSpan = showBureau ? 7 : 6;
    if (els.journalBureauTh) {
        els.journalBureauTh.classList.toggle("hidden", !isAdmin());
    }
    els.journal.innerHTML =
        entries
            .map((j) => {
                const bureauCell = isAdmin()
                    ? `<td>${KasoftStore.bureauNameForJournal(state, j.bureauId)}</td>`
                    : "";
                return `
        <tr>
            <td class="num" lang="en-US" dir="ltr">${KasoftStore.formatTime(j.time)}</td>
            ${bureauCell}
            <td>${j.actif}</td>
            <td>${j.parti}</td>
            <td>${j.mourakib}</td>
            <td class="num" lang="en-US" dir="ltr">${j.action}</td>
            <td class="num" lang="en-US" dir="ltr">${j.total}</td>
        </tr>`;
            })
            .join("") || `<tr><td colspan="${colSpan}" class="hint">لا توجد عمليات بعد</td></tr>`;
}

function rememberVoteTarget(partiId, mourakibId) {
    lastVoteTarget = { partiId, mourakibId };
    document.querySelectorAll(".ptable-cell-active").forEach((el) => {
        el.classList.remove("ptable-cell-active");
    });
    const cell = els.grid
        ?.querySelector(`[data-vote="${partiId}:${mourakibId}:1"]`)
        ?.closest(".ptable-cell");
    if (cell) cell.classList.add("ptable-cell-active");
}

function renderStatusSelect() {
    if (!els.status) return;
    const current = els.status.value || currentBureau()?.status || "attente";
    const labelFn = window.KasoftI18n?.statusLabel
        ? (k) => KasoftI18n.statusLabel(k)
        : (k) => KasoftStore.BUREAU_STATUSES[k]?.label || k;
    els.status.innerHTML = Object.keys(KasoftStore.BUREAU_STATUSES)
        .map((k) => `<option value="${k}">${labelFn(k)}</option>`)
        .join("");
    els.status.value = current;
}

function renderBureauSelect() {
    renderStatusSelect();
    const sid = scopedBureauId();
    const list = bureauxForSelect();
    if (sid) state.currentBureau = sid;
    els.bureau.innerHTML = list
        .map((b) => {
            const code = b.code ? ` [${b.code}]` : "";
            const selected = b.id === (sid || state.currentBureau) ? " selected" : "";
            return `<option value="${b.id}"${selected}>${b.name}${code}</option>`;
        })
        .join("");
    if (sid) {
        els.bureau.value = sid;
        els.bureau.disabled = true;
    } else {
        els.bureau.disabled = false;
    }
    const hint = document.getElementById("scoped-bureau-hint");
    if (hint) hint.classList.toggle("hidden", !sid);
    const b = currentBureau();
    if (b) els.status.value = b.status || "attente";
    if (els.status) els.status.disabled = !isAdmin();
    const bid = currentBureauId();
    state.pv = state.pv || {};
    const pv = state.pv[bid] || {};
    if (els.pvBlancs) els.pvBlancs.value = pv.blancs ?? 0;
    if (els.pvNuls) els.pvNuls.value = pv.nuls ?? 0;
    if (els.pvVotants) els.pvVotants.value = pv.votants ?? "";
    if (els.pvNumero) {
        const hadNumero = Boolean(state.pv?.[bid]?.numero);
        els.pvNumero.value = KasoftStore.ensurePvNumber(state, bid);
        if (!hadNumero) KasoftStore.saveState(state);
    }
}

function render() {
    if (!isReady()) {
        els.empty.classList.remove("hidden");
        els.app.classList.add("hidden");
        bureauCounters?.refresh();
        return;
    }
    els.empty.classList.add("hidden");
    els.app.classList.remove("hidden");

    renderBureauSelect();
    els.mourakibActif.value = state.mourakibActif || "";

    const leaderId = renderTotals();
    renderGrid(leaderId);
    renderJournal();
    renderLockedState();
    renderCloseSuggestion();
    pvScan?.refreshVisibility?.();
}

let pvScan = null;
let bureauCounters = null;

function initBureauCounters() {
    if (bureauCounters || !window.KasoftBureauCounters) return;
    bureauCounters = KasoftBureauCounters.init({
        getState: () => state,
        persist,
        getBureauId: currentBureauId,
        isLocked,
        requireActif,
        canUndo: () => !!findLastPlusEntry(currentBureauId()),
        onUndo: performUndo,
        onRender: () => renderJournal(),
    });
}

function initPvScan() {
    if (pvScan || !window.KasoftPvScan) return;
    pvScan = KasoftPvScan.init({
        getState: () => state,
        getBureauId: currentBureauId,
        isReady,
    });
}

initPvScan();
initBureauCounters();

els.bureau.addEventListener("change", () => {
    persist();
    render();
});

els.status?.addEventListener("change", () => {
    if (!isAdmin()) {
        const b = currentBureau();
        els.status.value = b?.status || "attente";
        return;
    }
    if (els.status.value === "ferme" && !confirm(tr("cpt_close_confirm"))) {
        const b = currentBureau();
        els.status.value = b?.status || "attente";
        return;
    }
    persist();
    render();
});
els.mourakibActif.addEventListener("change", persist);
if (els.pvBlancs) els.pvBlancs.addEventListener("change", () => { persist(); render(); });
if (els.pvNuls) els.pvNuls.addEventListener("change", () => { persist(); render(); });
if (els.pvVotants) els.pvVotants.addEventListener("change", () => { persist(); render(); });

els.grid.addEventListener("click", (e) => {
    const raw = e.target.dataset.vote;
    if (!raw) return;
    const [partiId, mourakibId, delta] = raw.split(":");
    rememberVoteTarget(partiId, mourakibId);
    changeVote(partiId, mourakibId, parseInt(delta, 10));
});

if (els.btnResetVotes) {
    els.btnResetVotes.addEventListener("click", resetBureauVotes);
}

async function clotureAndExport() {
    const bureau = currentBureau();
    if (!bureau) return;
    const bid = currentBureauId();
    if (bureau.status === "ferme") {
        if (window.Ui) Ui.toast(tr("cpt_already_closed"), "info");
        return;
    }
    const check = KasoftStore.validateBureauPV(state, bid);
    if (!check.ok && !confirm(`${check.errors.join("\n")}\n\n${tr("cpt_cloture_force")}`)) {
        return;
    }
    if (!confirm(tr("cpt_cloture_confirm"))) return;

    const result = KasoftStore.cloturerBureau(state, bid, { force: !check.ok });
    if (!result.ok) return;

    els.status.value = "ferme";
    persist();
    KasoftStore.downloadText(
        `محضر_${bureau.name.replace(/\s+/g, "_")}.txt`,
        KasoftStore.buildBureauPVLines(state, bid)
    );
    if (window.Ui) Ui.toast(tr("cpt_cloture_done"), "success");

    if (confirm(tr("cpt_cloture_pdf_prompt"))) {
        try {
            await KasoftStore.downloadPdf("/api/kasoft/export-pv-pdf", state, {
                bureau_id: bid,
                filename: "محضر_المكتب.pdf",
            });
        } catch (e) {
            if (window.Ui) Ui.toast(e.message, "error");
        }
    }
    if (confirm(tr("cpt_email_prompt"))) {
        KasoftStore.openPvEmail(state, bid);
    }
    render();
}

if (els.btnCloture) {
    els.btnCloture.addEventListener("click", clotureAndExport);
}

if (els.btnEmailPv) {
    els.btnEmailPv.addEventListener("click", () => {
        const bureau = currentBureau();
        if (!bureau) return;
        KasoftStore.openPvEmail(state, currentBureauId());
    });
}

if (els.btnSendSummary) {
    els.btnSendSummary.addEventListener("click", async () => {
        if (window.Ui) Ui.setLoading(els.btnSendSummary, true);
        try {
            await KasoftStore.sendRegionalSummary(state);
            if (window.Ui) Ui.toast(tr("cpt_summary_sent"), "success");
        } catch (e) {
            if (window.Ui) Ui.toast(e.message || tr("cpt_summary_fail"), "error");
        } finally {
            if (window.Ui) Ui.setLoading(els.btnSendSummary, false);
        }
    });
}

document.addEventListener("keydown", (e) => {
    if (!els.app || els.app.classList.contains("hidden")) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!lastVoteTarget) return;
    if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        changeVote(lastVoteTarget.partiId, lastVoteTarget.mourakibId, 1);
    } else if (e.key === "-") {
        e.preventDefault();
        changeVote(lastVoteTarget.partiId, lastVoteTarget.mourakibId, -1);
    }
});

els.btnExport.addEventListener("click", () => {
    const bureau = currentBureau();
    if (!bureau) return;
    const check = KasoftStore.validateBureauPV(state, currentBureauId());
    if (!check.ok) {
        if (!confirm(`${check.errors.join("\n")}\n\nتصدير المحضر على أي حال؟`)) return;
    }
    KasoftStore.downloadText(
        `محضر_${bureau.name.replace(/\s+/g, "_")}.txt`,
        KasoftStore.buildBureauPVLines(state, currentBureauId())
    );
    if (window.Ui) Ui.toast("تم تصدير المحضر", "success");
});

els.btnExportPdf.addEventListener("click", async () => {
    const check = KasoftStore.validateBureauPV(state, currentBureauId());
    if (!check.ok) {
        if (!confirm(`${check.errors.join("\n")}\n\nتصدير PDF على أي حال؟`)) return;
    }
    if (window.Ui) Ui.setLoading(els.btnExportPdf, true);
    try {
        await KasoftStore.downloadPdf("/api/kasoft/export-pv-pdf", state, {
            bureau_id: currentBureauId(),
            filename: "محضر_المكتب.pdf",
        });
        if (window.Ui) Ui.toast("تم تحميل PDF", "success");
    } catch (e) {
        if (window.Ui) Ui.toast(e.message, "error");
        else alert(e.message);
    } finally {
        if (window.Ui) Ui.setLoading(els.btnExportPdf, false);
    }
});

els.btnRegional.addEventListener("click", () => {
    KasoftStore.downloadText(
        "التقرير_الإقليمي.txt",
        KasoftStore.buildRegionalReportLines(state)
    );
    if (window.Ui) Ui.toast("تم تصدير التقرير", "success");
});

if (els.btnRegionalCsv) {
    els.btnRegionalCsv.addEventListener("click", () => {
        KasoftStore.downloadCsv(
            "التقرير_الإقليمي.csv",
            KasoftStore.buildRegionalReportCsv(state)
        );
        if (window.Ui) Ui.toast("تم تحميل CSV", "success");
    });
}

els.btnRegionalPdf.addEventListener("click", async () => {
    if (window.Ui) Ui.setLoading(els.btnRegionalPdf, true);
    try {
        await KasoftStore.downloadPdf("/api/kasoft/rapport-pdf", state, {
            filename: "التقرير_الإقليمي.pdf",
        });
        if (window.Ui) Ui.toast("تم تحميل PDF", "success");
    } catch (e) {
        if (window.Ui) Ui.toast(e.message, "error");
        else alert(e.message);
    } finally {
        if (window.Ui) Ui.setLoading(els.btnRegionalPdf, false);
    }
});

if (els.btnJournal) {
    els.btnJournal.addEventListener("click", () => {
        const filterId = journalFilterId();
        const all = filterId === "*";
        const bureau = !all ? state.bureaux.find((b) => b.id === filterId) : null;
        const name = all
            ? "جميع_المكاتب"
            : (bureau?.name || "المكتب").replace(/\s+/g, "_");
        KasoftStore.downloadText(
            `سجل_${name}.txt`,
            KasoftStore.buildJournalLines(state, filterId)
        );
        if (window.Ui) Ui.toast("تم تصدير السجل", "success");
    });
}

els.journalFilter?.addEventListener("change", () => {
    renderJournal();
});

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
            else alert(e.message);
        } finally {
            if (window.Ui) Ui.setLoading(els.btnAllPvZip, false);
        }
    });
}

function initFromUrl() {
    if (scopedBureauId()) {
        enforceScopedBureau();
        return;
    }
    const params = new URLSearchParams(window.location.search);
    const bid = params.get("bureau");
    if (bid && state.bureaux.some((b) => b.id === bid)) {
        state.currentBureau = bid;
    }
}

KasoftStore.loadStateAsync().then((s) => {
    state = s;
    enforceScopedBureau();
    initFromUrl();
    initPvScan();
    initBureauCounters();
    render();
});

let syncTimer = null;
function startAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(async () => {
        if (document.hidden || isLocked()) return;
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
    }, 60000);
}
KasoftStore.connectRealtime((merged) => {
    if (document.hidden || isLocked()) return;
    if (KasoftStore.stateSignature(merged) !== KasoftStore.stateSignature(state)) {
        state = merged;
        render();
    }
});
startAutoSync();
document.addEventListener("kasoft:lang", () => {
    if (window.KasoftI18n) KasoftI18n.applyI18n();
    render();
});
