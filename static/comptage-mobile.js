/** Version mobile — cartes des partis + journal uniquement */
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

function applyVoteLocally(partiId, mourakibId, delta, actif) {
    const bureauId = currentBureauId();
    const bucket = KasoftStore.ensureVotes(state, bureauId);
    if (!bucket[partiId]) bucket[partiId] = {};
    const current = bucket[partiId][mourakibId] || 0;
    const next = Math.max(0, current + delta);
    if (next === current) return false;

    bucket[partiId][mourakibId] = next;
    const parti = state.partis.find((p) => p.id === partiId);
    const mourakib = (state.mourakibs[partiId] || []).find((m) => m.id === mourakibId);
    KasoftStore.addJournalEntry(state, {
        time: new Date().toISOString(),
        bureauId,
        actif,
        parti: parti?.name || "",
        mourakib: mourakib?.name || "",
        action: delta > 0 ? "+1" : "-1",
        total: next,
        partiTotal: KasoftStore.getPartiTotal(state, bureauId, partiId),
    });
    return true;
}

async function changeVote(partiId, mourakibId, delta) {
    if (isLocked()) {
        alert(tr("cpt_locked") || "المكتب مغلق — لا يمكن تعديل الأصوات");
        return;
    }
    const actif = requireActif();
    if (!actif) return;

    const bureauId = currentBureauId();
    const bureau = currentBureau();
    const part = KasoftStore.getParticipation(state, bureauId);
    if (delta > 0 && bureau?.inscrits && part.valid + part.blancs + part.nuls + 1 > bureau.inscrits) {
        alert(tr("cpt_over_inscrits") || "لا يمكن تجاوز عدد المسجلين");
        return;
    }

    try {
        const data = await KasoftStore.postVoteDelta(
            bureauId, partiId, mourakibId, delta, actif
        );
        if (data.state) {
            state = KasoftStore.applyServerState(state, data.state, { authoritativeVotes: true });
        }
        render();
        return;
    } catch {
        /* hors-ligne */
    }

    if (!applyVoteLocally(partiId, mourakibId, delta, actif)) return;
    persist();
    render();
}

function renderLockedState() {
    const locked = isLocked();
    if (els.lockedBanner) els.lockedBanner.classList.toggle("hidden", !locked);
    if (els.grid) els.grid.classList.toggle("comptage-locked", locked);
    els.grid?.querySelectorAll(".btn-counter").forEach((btn) => {
        btn.disabled = locked;
    });
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
    const bureauId = currentBureauId();

    els.grid.innerHTML = state.partis
        .map((p) => {
            const total = KasoftStore.getPartiTotal(state, bureauId, p.id);
            const inscrits = currentBureau()?.inscrits || 0;
            const pct = inscrits ? Math.min(100, Math.round((total / inscrits) * 100)) : 0;
            const mourakibs = state.mourakibs[p.id] || [];
            const isLeader = p.id === leaderId && total > 0;

            const mourakibRows = mourakibs
                .map((m) => {
                    const count = KasoftStore.getMourakibCount(state, bureauId, p.id, m.id);
                    const disabled = isLocked() ? " disabled" : "";
                    return `
                    <div class="mourakib-row">
                        <span class="mourakib-name">${m.name}</span>
                        <div class="counter">
                            <button type="button" class="btn-counter"${disabled} data-vote="${p.id}:${m.id}:-1">−</button>
                            <span class="counter-value num" lang="en-US" dir="ltr">${count}</span>
                            <button type="button" class="btn-counter btn-counter-plus"${disabled} data-vote="${p.id}:${m.id}:1">+</button>
                        </div>
                    </div>`;
                })
                .join("");

            return `
            <div class="parti-card${isLeader ? " parti-leader" : ""}" style="--parti-color:${p.color}">
                ${isLeader ? '<span class="leader-badge">في الصدارة</span>' : ""}
                <div class="parti-card-header" style="background:${p.color}">
                    <h3>${p.name}</h3>
                    <span class="parti-total"><span class="num" lang="en-US" dir="ltr">${total}</span> صوت</span>
                </div>
                <div class="parti-progress">
                    <div class="parti-progress-fill" style="width:${pct}%;background:${p.color}"></div>
                </div>
                <div class="parti-card-body">
                    ${mourakibRows || `<p class="hint">${tr("cpt_no_mourakibs")}</p>`}
                </div>
            </div>`;
        })
        .join("");
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
            .join("") || `<tr><td colspan="6" class="hint">لا توجد عمليات بعد</td></tr>`;
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
}

els.bureau.addEventListener("change", () => {
    persist();
    render();
});

els.mourakibActif.addEventListener("change", persist);

els.grid.addEventListener("click", (e) => {
    const raw = e.target.dataset.vote;
    if (!raw) return;
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
