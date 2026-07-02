let state = KasoftStore.loadState();

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
    btnExport: document.getElementById("btn-export-pv"),
    btnExportPdf: document.getElementById("btn-export-pv-pdf"),
    btnRegional: document.getElementById("btn-export-regional"),
    btnRegionalPdf: document.getElementById("btn-export-regional-pdf"),
    btnRegionalCsv: document.getElementById("btn-export-regional-csv"),
    btnJournal: document.getElementById("btn-export-journal"),
    btnAllPvZip: document.getElementById("btn-export-all-pv-zip"),
    btnResetVotes: document.getElementById("btn-reset-bureau-votes"),
    keyboardHint: document.getElementById("keyboard-hint"),
    lockedBanner: document.getElementById("comptage-locked-banner"),
    closeSuggestion: document.getElementById("close-suggestion"),
    pvWarning: document.getElementById("pv-warning"),
};

let lastVoteTarget = null;

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
    const mourakib = (state.mourakibs[partiId] || []).find((m) => m.id === mourakibId);
    KasoftStore.addJournalEntry(state, {
        time: new Date().toISOString(),
        bureauId,
        actif,
        parti: parti?.name || "",
        mourakib: mourakib?.name || "",
        action: delta > 0 ? "+1" : "-1",
        total: KasoftStore.getPartiTotal(state, bureauId, partiId),
    });
    return true;
}

async function changeVote(partiId, mourakibId, delta) {
    if (isLocked()) {
        if (window.Ui) Ui.toast("المكتب مغلق — لا يمكن تعديل الأصوات", "error");
        else alert("المكتب مغلق — لا يمكن تعديل الأصوات");
        return;
    }
    const actif = requireActif();
    if (!actif) return;

    const bureauId = currentBureauId();
    const bureau = currentBureau();
    const part = KasoftStore.getParticipation(state, bureauId);
    if (delta > 0 && bureau?.inscrits && part.valid + part.blancs + part.nuls + 1 > bureau.inscrits) {
        if (window.Ui) Ui.toast("لا يمكن تجاوز عدد المسجلين", "error");
        else alert("لا يمكن تجاوز عدد المسجلين");
        return;
    }

    try {
        const data = await KasoftStore.postVoteDelta(
            bureauId, partiId, mourakibId, delta, actif
        );
        if (data.state) {
            state = KasoftStore.applyServerState(state, data.state);
        }
        render();
        return;
    } catch {
        /* hors-ligne — repli local */
    }

    if (!applyVoteLocally(partiId, mourakibId, delta, actif)) return;
    persist();
    render();
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
    els.grid?.querySelectorAll(".btn-counter").forEach((btn) => {
        btn.disabled = locked;
    });
    if (els.pvBlancs) els.pvBlancs.disabled = locked;
    if (els.pvNuls) els.pvNuls.disabled = locked;
    if (els.pvVotants) els.pvVotants.disabled = locked;
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
                    ${mourakibRows || '<p class="hint">لا يوجد مراقبون — أضفهم من الإعدادات</p>'}
                </div>
            </div>`;
        })
        .join("");
}

function renderJournal() {
    els.journal.innerHTML =
        state.journal
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
            .join("") || '<tr><td colspan="6" class="hint">لا توجد عمليات بعد</td></tr>';
}

function rememberVoteTarget(partiId, mourakibId) {
    lastVoteTarget = { partiId, mourakibId };
    document.querySelectorAll(".mourakib-row-active").forEach((el) => {
        el.classList.remove("mourakib-row-active");
    });
    const row = els.grid?.querySelector(`[data-vote="${partiId}:${mourakibId}:1"]`)?.closest(".mourakib-row");
    if (row) row.classList.add("mourakib-row-active");
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
    els.bureau.innerHTML = state.bureaux
        .map((b) => {
            const code = b.code ? ` [${b.code}]` : "";
            return `<option value="${b.id}"${b.id === state.currentBureau ? " selected" : ""}>${b.name}${code}</option>`;
        })
        .join("");
    const b = currentBureau();
    if (b) els.status.value = b.status || "attente";
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
}

els.bureau.addEventListener("change", () => {
    persist();
    render();
});

els.status.addEventListener("change", () => {
    if (els.status.value === "ferme" && !confirm("إغلاق المكتب؟ لن يمكن تعديل الأصوات بعد ذلك.")) {
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
        const bureau = currentBureau();
        KasoftStore.downloadText(
            `سجل_${(bureau?.name || "المكتب").replace(/\s+/g, "_")}.txt`,
            KasoftStore.buildJournalLines(state, currentBureauId())
        );
        if (window.Ui) Ui.toast("تم تصدير السجل", "success");
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
            else alert(e.message);
        } finally {
            if (window.Ui) Ui.setLoading(els.btnAllPvZip, false);
        }
    });
}

function initFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const bid = params.get("bureau");
    if (bid && state.bureaux.some((b) => b.id === bid)) {
        state.currentBureau = bid;
    }
}

KasoftStore.loadStateAsync().then((s) => {
    state = s;
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
    }, 20000);
}
startAutoSync();
document.addEventListener("kasoft:lang", () => {
    if (window.KasoftI18n) KasoftI18n.applyI18n();
    render();
});
