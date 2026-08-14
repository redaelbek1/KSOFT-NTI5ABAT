/** Version téléphone — tableau حزب × لائحة + journal — + uniquement, undo dernier + */
let state = KasoftStore.loadState();

function tr(key) {
    return window.KasoftI18n?.t(key) || key;
}

const els = {
    empty: document.getElementById("comptage-empty"),
    app: document.getElementById("comptage-app"),
    bureau: document.getElementById("comptage-bureau"),
    mourakibActif: document.getElementById("mourakib-actif"),
    totalVotes: document.getElementById("total-votes"),
    grid: document.getElementById("parti-grid"),
    journal: document.getElementById("journal-body"),
    lockedBanner: document.getElementById("comptage-locked-banner"),
};

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
    KasoftStore.saveState(state);
}

function requireActif() {
    const name = els.mourakibActif.value.trim();
    if (!name) {
        alert(tr("cpt_actif_required") || "المرجو إدخال اسم المراقب النشط قبل التسجيل");
        els.mourakibActif.focus();
        return null;
    }
    return name;
}

function isLocked() {
    return KasoftStore.isBureauLocked(state, currentBureauId());
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
        const count = KasoftStore.getMourakibCount(
            state,
            bureauId,
            ids.partiId,
            ids.mourakibId
        );
        if (count > 0) return { entry: j, ...ids };
        return null;
    }
    return null;
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
        action: delta > 0 ? "+1" : "تراجع",
        total: next,
        partiTotal: KasoftStore.getPartiTotal(state, bureauId, partiId),
    });
    return true;
}

async function changeVote(partiId, mourakibId, delta, actifOverride) {
    if (isLocked()) {
        alert(tr("cpt_locked") || "المكتب مغلق — لا يمكن تعديل الأصوات");
        return false;
    }
    const actif = actifOverride || requireActif();
    if (!actif) return false;

    const bureauId = currentBureauId();
    const bureau = currentBureau();
    const part = KasoftStore.getParticipation(state, bureauId);
    if (delta > 0 && bureau?.inscrits && part.valid + part.blancs + part.nuls + 1 > bureau.inscrits) {
        alert(tr("cpt_over_inscrits") || "لا يمكن تجاوز عدد المسجلين");
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
        /* hors-ligne */
    }

    if (!applyVoteLocally(partiId, mourakibId, delta, actif)) return false;
    persist();
    render();
    return true;
}

async function performUndo(actif) {
    const last = findLastPlusEntry(currentBureauId());
    if (!last) {
        alert(tr("phone_undo_none") || "لا يوجد + لحذفه");
        return false;
    }
    return changeVote(last.partiId, last.mourakibId, -1, actif);
}

function renderLockedState() {
    const locked = isLocked();
    if (els.lockedBanner) els.lockedBanner.classList.toggle("hidden", !locked);
    if (els.grid) els.grid.classList.toggle("phone-locked", locked);
    els.grid?.querySelectorAll(".ptable-plus").forEach((btn) => {
        btn.disabled = locked;
    });
    bureauCounters?.refresh();
}

function renderTotals() {
    const bureauId = currentBureauId();
    const total = KasoftStore.getBureauTotal(state, bureauId);
    els.totalVotes.textContent = String(total);

    const partiTotals = state.partis.map((p) => ({
        ...p,
        total: KasoftStore.getPartiTotal(state, bureauId, p.id),
    }));
    return partiTotals.reduce(
        (best, p) => (p.total > (best?.total || 0) ? p : best),
        null
    )?.id;
}

function renderGrid(leaderId) {
    els.grid.innerHTML = KasoftPartiesTable.render({
        state,
        bureauId: currentBureauId(),
        locked: isLocked(),
        leaderId,
    });
}

function renderJournal() {
    const bureauId = currentBureauId();
    const entries = KasoftStore.filterJournalForBureau(state, bureauId);
    els.journal.innerHTML =
        entries
            .map(
                (j) => `
        <tr>
            <td class="num" lang="en-US" dir="ltr">${KasoftStore.formatTime(j.time)}</td>
            <td>${j.actif}</td>
            <td>${j.parti}</td>
            <td>${j.mourakib}</td>
            <td class="num" lang="en-US" dir="ltr">${j.action}</td>
            <td class="num" lang="en-US" dir="ltr">${j.total}</td>
        </tr>`
            )
            .join("") || `<tr><td colspan="6" class="phone-hint-inline">لا توجد عمليات بعد</td></tr>`;
}

function renderBureauSelect() {
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
    pvScan?.refreshVisibility?.();
    document.getElementById("btn-open-pv-scan")?.classList.toggle("hidden", !isReady());
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

els.mourakibActif.addEventListener("change", persist);

els.grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-vote]");
    if (!btn) return;
    const raw = btn.dataset.vote;
    const [partiId, mourakibId, delta] = raw.split(":");
    changeVote(partiId, mourakibId, parseInt(delta, 10));
});

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

if (window.KasoftI18n) KasoftI18n.applyI18n();

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
