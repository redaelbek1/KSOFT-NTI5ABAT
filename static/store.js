const STORAGE_KEY = "kasoft_electoral_v2";
const PARTY_COLORS = [
    "#f9a825", "#43a047", "#e53935", "#8e24aa",
    "#1565c0", "#00838f", "#c62828", "#4527a0",
    "#2e7d32", "#ef6c00",
];

const BUREAU_STATUSES = {
    ouvert: { label: "مفتوح", class: "status-open" },
    ferme: { label: "مغلق", class: "status-closed" },
    attente: { label: "في الانتظار", class: "status-pending" },
};

const MOROCCO_REGIONS = [
    "طنجة- تطوان -الحسيمة",
    "الشرق",
    "فاس- مكناس",
    "الرباط -سلا -القنيطرة",
    "بني ملال -خنيفرة",
    "الدار البيضاء-سطات",
    "مراكش- آسفي",
    "درعة -تافيلالت",
    "سوس- ماسة",
    "كلميم -واد نون",
    "العيون- الساقية الحمراء",
    "الداخلة- وادي الذهب",
];

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizeBureau(b) {
    return {
        id: b.id,
        name: b.name || "",
        inscrits: parseInt(b.inscrits, 10) || 0,
        capacite: parseInt(b.capacite, 10) || parseInt(b.inscrits, 10) || 0,
        ville: b.ville || "",
        region: b.region || MOROCCO_REGIONS[3],
        status: BUREAU_STATUSES[b.status] ? b.status : "attente",
        code: b.code || "",
        centre: b.centre || "",
        adresse: b.adresse || "",
        pin: b.pin || "",
    };
}

function emptyConfig() {
    return {
        bureaux: [],
        partis: [],
        mourakibs: {},
        votes: {},
        journal: [],
        currentBureau: "",
        mourakibActif: "",
    };
}

function migrateState(data) {
    const merged = {
        ...emptyConfig(),
        ...data,
        mourakibs: data.mourakibs || {},
        votes: data.votes || {},
        journal: data.journal || [],
    };
    merged.bureaux = (data.bureaux || []).map(normalizeBureau);
    merged.partis = data.partis || [];
    return merged;
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyConfig();
        return migrateState(JSON.parse(raw));
    } catch {
        return emptyConfig();
    }
}

function cleanStatePayload(state) {
    return {
        bureaux: state.bureaux || [],
        partis: state.partis || [],
        mourakibs: state.mourakibs || {},
        votes: state.votes || {},
        pv: state.pv || {},
        journal: state.journal || [],
        currentBureau: state.currentBureau || "",
        mourakibActif: state.mourakibActif || "",
    };
}

function maxInt(a, b, fallback = 0) {
    const va = parseInt(a, 10);
    const vb = parseInt(b, 10);
    const na = Number.isNaN(va) ? fallback : va;
    const nb = Number.isNaN(vb) ? fallback : vb;
    return Math.max(na, nb);
}

function mergeBureau(local, remote) {
    const merged = { ...remote, ...local, id: local.id || remote.id };
    ["name", "ville", "region", "code", "centre", "adresse"].forEach((key) => {
        merged[key] = (local[key] || remote[key] || "").trim() || merged[key] || "";
    });
    merged.inscrits = maxInt(local.inscrits, remote.inscrits);
    merged.capacite = maxInt(local.capacite, remote.capacite, merged.inscrits);
    if (local.status === "ferme" || remote.status === "ferme") merged.status = "ferme";
    else if (local.status === "ouvert" || remote.status === "ouvert") merged.status = "ouvert";
    else merged.status = local.status || remote.status || "attente";
    return normalizeBureau(merged);
}

function journalLatestMs(journal) {
    if (!Array.isArray(journal) || !journal.length) return 0;
    return journal.reduce((max, entry) => {
        const t = entry?.time ? new Date(entry.time).getTime() : 0;
        return t > max ? t : max;
    }, 0);
}

function cloneVotes(votes) {
    return JSON.parse(JSON.stringify(votes || {}));
}

function mergeVotes(localVotes, remoteVotes, localJournal, remoteJournal) {
    const localT = journalLatestMs(localJournal);
    const remoteT = journalLatestMs(remoteJournal);
    if (remoteT > localT) return cloneVotes(remoteVotes);
    if (localT > remoteT) return cloneVotes(localVotes);

    const merged = {};
    const bureauIds = new Set([
        ...Object.keys(localVotes || {}),
        ...Object.keys(remoteVotes || {}),
    ]);
    bureauIds.forEach((bid) => {
        const localB = localVotes?.[bid] || {};
        const remoteB = remoteVotes?.[bid] || {};
        merged[bid] = {};
        const partiIds = new Set([...Object.keys(localB), ...Object.keys(remoteB)]);
        partiIds.forEach((pid) => {
            const localP = localB[pid] || {};
            const remoteP = remoteB[pid] || {};
            merged[bid][pid] = {};
            const mourakibIds = new Set([...Object.keys(localP), ...Object.keys(remoteP)]);
            mourakibIds.forEach((mid) => {
                const rv = remoteP[mid];
                const lv = localP[mid];
                if (remoteT >= localT && rv !== undefined) {
                    merged[bid][pid][mid] = parseInt(rv, 10) || 0;
                } else if (lv !== undefined) {
                    merged[bid][pid][mid] = parseInt(lv, 10) || 0;
                } else {
                    merged[bid][pid][mid] = maxInt(lv, rv);
                }
            });
        });
    });
    return merged;
}

function mergeJournal(localJournal, remoteJournal) {
    const seen = new Map();
    [...(remoteJournal || []), ...(localJournal || [])].forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const key = `${entry.time}|${entry.bureauId}|${entry.parti}|${entry.mourakib}|${entry.action}`;
        seen.set(key, entry);
    });
    return Array.from(seen.values())
        .sort((a, b) => new Date(b.time) - new Date(a.time))
        .slice(0, 50);
}

function mergePv(localPv, remotePv) {
    const merged = {};
    const bureauIds = new Set([
        ...Object.keys(localPv || {}),
        ...Object.keys(remotePv || {}),
    ]);
    bureauIds.forEach((bid) => {
        const localP = localPv?.[bid] || {};
        const remoteP = remotePv?.[bid] || {};
        const entry = { ...remoteP, ...localP };
        ["blancs", "nuls", "votants"].forEach((field) => {
            entry[field] = maxInt(localP[field], remoteP[field]);
        });
        if (!entry.numero) entry.numero = localP.numero || remoteP.numero || "";
        merged[bid] = entry;
    });
    return merged;
}

function mergePartis(localPartis, remotePartis) {
    const byId = new Map();
    (remotePartis || []).forEach((parti) => {
        if (parti?.id) byId.set(parti.id, { ...parti });
    });
    (localPartis || []).forEach((parti) => {
        if (!parti?.id) return;
        const existing = byId.get(parti.id);
        if (existing) {
            byId.set(parti.id, {
                ...existing,
                ...parti,
                name: (parti.name || existing.name || "").trim(),
                color: parti.color || existing.color,
            });
        } else {
            byId.set(parti.id, { ...parti });
        }
    });
    return Array.from(byId.values());
}

function mergeMourakibs(localM, remoteM) {
    const merged = { ...(remoteM || {}) };
    Object.entries(localM || {}).forEach(([pid, mourakibs]) => {
        const remoteList = new Map(
            (merged[pid] || []).filter((m) => m?.id).map((m) => [m.id, { ...m }])
        );
        (mourakibs || []).forEach((mourakib) => {
            if (!mourakib?.id) return;
            const existing = remoteList.get(mourakib.id);
            remoteList.set(
                mourakib.id,
                existing ? { ...existing, ...mourakib } : { ...mourakib }
            );
        });
        merged[pid] = Array.from(remoteList.values());
    });
    return merged;
}

function mergeStates(local, remote) {
    if (!remote || (!remote.bureaux?.length && !Object.keys(remote.votes || {}).length)) {
        return migrateState(local);
    }
    if (!local || (!local.bureaux?.length && !Object.keys(local.votes || {}).length)) {
        return migrateState(remote);
    }

    const localB = new Map((local.bureaux || []).filter((b) => b.id).map((b) => [b.id, b]));
    const remoteB = new Map((remote.bureaux || []).filter((b) => b.id).map((b) => [b.id, b]));
    const bureauIds = new Set([...localB.keys(), ...remoteB.keys()]);
    const bureaux = Array.from(bureauIds)
        .map((id) => mergeBureau(localB.get(id) || { id }, remoteB.get(id) || { id }))
        .filter((b) => b.id);

    return migrateState({
        bureaux,
        partis: mergePartis(local.partis, remote.partis),
        mourakibs: mergeMourakibs(local.mourakibs, remote.mourakibs),
        votes: mergeVotes(local.votes, remote.votes, local.journal, remote.journal),
        pv: mergePv(local.pv, remote.pv),
        journal: mergeJournal(local.journal, remote.journal),
        currentBureau: local.currentBureau || remote.currentBureau || "",
        mourakibActif: local.mourakibActif || remote.mourakibActif || "",
    });
}

function stateSignature(state) {
    return JSON.stringify(cleanStatePayload(state));
}

async function postVoteDelta(bureauId, partiId, mourakibId, delta, actif) {
    const res = await fetch("/api/kasoft/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
            bureau_id: bureauId,
            parti_id: partiId,
            mourakib_id: mourakibId,
            delta,
            actif,
        }),
    });
    if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        throw new Error("يجب تسجيل الدخول");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "خطأ في تسجيل الصوت");
    return data;
}

function applyServerState(local, serverState, options = {}) {
    const server = migrateState(serverState);
    let merged = mergeStates(local, server);
    if (options.authoritativeVotes && server.votes) {
        merged = migrateState({ ...merged, votes: cloneVotes(server.votes) });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
}

async function fetchApiToken() {
    try {
        const res = await fetch("/api/kasoft/session", { credentials: "same-origin" });
        if (!res.ok) return null;
        const data = await res.json();
        return data.token || null;
    } catch {
        return null;
    }
}

let realtimeWs = null;
let realtimeHandler = null;
let realtimeReconnectTimer = null;

function connectRealtime(onState) {
    realtimeHandler = onState;
    if (realtimeWs && realtimeWs.readyState <= WebSocket.OPEN) return;

    fetchApiToken().then((token) => {
        if (!token) return;
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const url = `${proto}//${window.location.host}/ws/sync?token=${encodeURIComponent(token)}`;
        const ws = new WebSocket(url);
        realtimeWs = ws;
        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.type === "state" && msg.state && realtimeHandler) {
                    const local = loadState();
                    const merged = mergeStates(local, migrateState(msg.state));
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                    realtimeHandler(merged);
                }
            } catch {
                /* ignore */
            }
        };
        ws.onclose = () => {
            if (realtimeWs === ws) realtimeWs = null;
            if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
            realtimeReconnectTimer = setTimeout(() => connectRealtime(realtimeHandler), 5000);
        };
        ws.onerror = () => {
            try {
                ws.close();
            } catch {
                /* ignore */
            }
        };
    });
}

function disconnectRealtime() {
    if (realtimeReconnectTimer) {
        clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer = null;
    }
    if (realtimeWs) {
        try {
            realtimeWs.close();
        } catch {
            /* ignore */
        }
        realtimeWs = null;
    }
    realtimeHandler = null;
}

async function fetchRemoteState() {
    const res = await fetch("/api/kasoft/state", { credentials: "same-origin" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    if (!data || typeof data !== "object") return null;
    return migrateState(data);
}

function saveState(state, options = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!options.skipSync) syncToServer(state);
}

async function loadStateAsync(options = {}) {
    const local = loadState();
    try {
        const remote = await fetchRemoteState();
        if (!remote) return local;
        const merged = mergeStates(local, remote);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        if (
            !options.skipPush
            && stateSignature(merged) !== stateSignature(remote)
        ) {
            syncToServer(merged);
        }
        return merged;
    } catch {
        /* hors-ligne */
    }
    return local;
}

function syncToServer(state) {
    fetch("/api/kasoft/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(cleanStatePayload(state)),
    })
        .then((res) => {
            if (res.status === 401 && window.Ui) {
                Ui.toast("انتهت الجلسة — سجّل الدخول مجدداً.", "error");
            } else if (res.status === 403 && window.Ui) {
                Ui.toast("غير مصرح — الإعدادات للمسؤول فقط.", "error");
            } else if (!res.ok && window.Ui) {
                Ui.toast("تعذّر حفظ البيانات على الخادم.", "error");
            }
        })
        .catch(() => {
            if (window.Ui) Ui.toast("غير متصل — البيانات محفوظة محلياً.", "warn");
        });
}

function formatNum(n) {
    return `\u2066${n}\u2069`;
}

function numHtml(n) {
    return `<span class="num" lang="en-US" dir="ltr">\u2066${n}\u2069</span>`;
}

function formatTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function formatDate() {
    return new Date().toLocaleDateString("en-US");
}

function ensureVotes(state, bureauId) {
    if (!state.votes[bureauId]) state.votes[bureauId] = {};
    return state.votes[bureauId];
}

function getMourakibCount(state, bureauId, partiId, mourakibId) {
    return state.votes[bureauId]?.[partiId]?.[mourakibId] || 0;
}

function getPartiTotal(state, bureauId, partiId) {
    const bucket = state.votes[bureauId]?.[partiId] || {};
    return Object.values(bucket).reduce((s, n) => s + n, 0);
}

function getBureauTotal(state, bureauId) {
    const bucket = state.votes[bureauId] || {};
    return Object.values(bucket).reduce(
        (sum, parti) => sum + Object.values(parti).reduce((a, b) => a + b, 0),
        0
    );
}

function getParticipation(state, bureauId) {
    const bureau = state.bureaux.find((b) => b.id === bureauId);
    const inscrits = bureau?.inscrits || 0;
    const valid = getBureauTotal(state, bureauId);
    const pv = state.pv?.[bureauId] || {};
    const blancs = parseInt(pv.blancs, 10) || 0;
    const nuls = parseInt(pv.nuls, 10) || 0;
    const votants = parseInt(pv.votants, 10) || (valid + blancs + nuls);
    const pct = inscrits ? Math.round((votants / inscrits) * 100) : 0;
    return {
        inscrits,
        valid,
        blancs,
        nuls,
        votants,
        pct: Math.min(pct, 100),
    };
}

function duplicateBureau(state, id) {
    const b = state.bureaux.find((x) => x.id === id);
    if (!b) return null;
    const newId = uid();
    const copy = normalizeBureau({
        ...b,
        id: newId,
        name: `${b.name} (نسخة)`,
        code: "",
        status: "attente",
    });
    state.bureaux.push(copy);
    if (state.votes[b.id]) {
        state.votes[newId] = JSON.parse(JSON.stringify(state.votes[b.id]));
    }
    return copy;
}

function clearAllData(state) {
    const empty = emptyConfig();
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, empty);
    state.pv = {};
    return state;
}

function validateStatePayload(data) {
    if (!data || typeof data !== "object") return "بيانات غير صالحة";
    if (!Array.isArray(data.bureaux)) return "قائمة المكاتب غير صالحة";
    if (!Array.isArray(data.partis)) return "قائمة الأحزاب غير صالحة";
    for (const b of data.bureaux) {
        if (!b || !String(b.name || "").trim()) return "اسم المكتب مطلوب";
    }
    return null;
}

function ensurePvNumber(state, bureauId) {
    state.pv = state.pv || {};
    if (!state.pv[bureauId]) state.pv[bureauId] = {};
    if (!state.pv[bureauId].numero) {
        const bureau = state.bureaux.find((b) => b.id === bureauId);
        const code = (bureau?.code || bureauId).replace(/\s+/g, "-").toUpperCase();
        const d = new Date();
        const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        state.pv[bureauId].numero = `PV-${code}-${date}`;
    }
    return state.pv[bureauId].numero;
}

function getRegionStats(state, region) {
    const list = state.bureaux.filter((b) => b.region === region);
    const inscrits = list.reduce((s, b) => s + b.inscrits, 0);
    const votants = list.reduce((s, b) => s + getParticipation(state, b.id).votants, 0);
    const valid = list.reduce((s, b) => s + getBureauTotal(state, b.id), 0);
    const pct = inscrits ? Math.min(100, Math.round((votants / inscrits) * 100)) : 0;
    return { count: list.length, inscrits, votants, valid, pct };
}

function getPartiRanking(state) {
    return state.partis
        .map((p) => ({
            ...p,
            total: state.bureaux.reduce(
                (s, b) => s + getPartiTotal(state, b.id, p.id),
                0
            ),
        }))
        .sort((a, b) => b.total - a.total);
}

function isBureauLocked(state, bureauId) {
    const bureau = state.bureaux.find((b) => b.id === bureauId);
    return bureau?.status === "ferme";
}

function validateBureauPV(state, bureauId) {
    const part = getParticipation(state, bureauId);
    const errors = [];
    const warnings = [];
    const pv = state.pv?.[bureauId] || {};
    const hasVotants = pv.votants !== "" && pv.votants != null && pv.votants !== undefined;

    if (part.inscrits && part.votants > part.inscrits) {
        errors.push("عدد المصوتين يتجاوز عدد المسجلين");
    }
    if (part.inscrits && part.valid + part.blancs + part.nuls > part.inscrits) {
        errors.push("مجموع الأصوات يتجاوز عدد المسجلين");
    }
    if (hasVotants && part.valid + part.blancs + part.nuls !== part.votants) {
        warnings.push("مجموع الصحيحة والبيضاء والملغاة لا يساوي عدد المصوتين");
    }
    return { ok: errors.length === 0, errors, warnings, part };
}

function getDashboardStats(state) {
    const totalBureaux = state.bureaux.length;
    const ouverts = state.bureaux.filter((b) => b.status === "ouvert").length;
    const fermes = state.bureaux.filter((b) => b.status === "ferme").length;
    const totalInscrits = state.bureaux.reduce((s, b) => s + b.inscrits, 0);
    const totalValid = state.bureaux.reduce(
        (s, b) => s + getBureauTotal(state, b.id),
        0
    );
    const totalVotants = state.bureaux.reduce(
        (s, b) => s + getParticipation(state, b.id).votants,
        0
    );
    const participation = totalInscrits
        ? Math.min(100, Math.round((totalVotants / totalInscrits) * 100))
        : 0;
    return { totalBureaux, ouverts, fermes, totalInscrits, totalVotes: totalValid, totalVotants, participation };
}

function addJournalEntry(state, entry) {
    state.journal.unshift(entry);
    if (state.journal.length > 50) state.journal.length = 50;
}

function formatDateTime() {
    const d = new Date();
    const date = d.toLocaleDateString("en-US");
    const time = d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    return `${date} ${time}`;
}

function buildVerifyPv(state, bureauId) {
    const pvNum = ensurePvNumber(state, bureauId);
    const valid = getBureauTotal(state, bureauId);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `KASOFT|${pvNum}|${bureauId}|${valid}|${stamp}`;
}

function buildVerifyRapport(state) {
    const valid = state.bureaux.reduce((s, b) => s + getBureauTotal(state, b.id), 0);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `KASOFT|RAPPORT|${valid}|${stamp}`;
}

function signatureLines(declaration) {
    return [
        "",
        "── التحقق والتوقيعات ──",
        declaration,
        "",
        "التوقيع — رئيس مكتب الاقتراع: _______________________",
        "التوقيع — ممثل السلطة الإشرافية: _______________________",
        "التوقيع — ممثل الأحزاب / المراقبون: _______________________",
    ];
}

function buildJournalLines(state, bureauId) {
    const bureau = bureauId ? state.bureaux.find((b) => b.id === bureauId) : null;
    const entries = bureauId
        ? state.journal.filter((j) => j.bureauId === bureauId)
        : state.journal;
    const lines = [
        "═══════════════════════════════════════",
        "           سجل العمليات — كاسوفت",
        "═══════════════════════════════════════",
    ];
    if (bureau) {
        const pvNum = ensurePvNumber(state, bureauId);
        lines.push(`المكتب: ${bureau.name}`);
        lines.push(`رمز المكتب: ${bureau.code || "—"}`);
        lines.push(`رقم المحضر: ${pvNum}`);
        lines.push(`المدينة: ${bureau.ville} — ${bureau.region}`);
    }
    lines.push(`التاريخ: ${formatDateTime()}`);
    lines.push(`عدد الإجراءات: ${entries.length}`);
    lines.push("");
    lines.push("الوقت | المراقب النشط | الحزب | المراقب | الإجراء | المجموع");
    lines.push("─".repeat(72));
    entries.slice(0, 50).forEach((j) => {
        lines.push(
            `${formatTime(j.time)} | ${j.actif} | ${j.parti} | ${j.mourakib} | ${j.action} | ${j.total}`
        );
    });
    lines.push("");
    lines.push("كاسوفت للمعلومية والاستشارات — الدار البيضاء — سري وموثوق");
    return lines;
}

function buildBureauPVLines(state, bureauId) {
    const bureau = state.bureaux.find((b) => b.id === bureauId);
    if (!bureau) return [];
    const part = getParticipation(state, bureauId);
    const pvNum = ensurePvNumber(state, bureauId);
    const verify = buildVerifyPv(state, bureauId);

    const lines = [
        "═══════════════════════════════════════",
        "   محضر مكتب الاقتراع — نسخة رسمية (v1)",
        "═══════════════════════════════════════",
        `رقم المحضر: ${pvNum}`,
        `رمز المكتب: ${bureau.code || "—"}`,
        `المكتب: ${bureau.name}`,
        `المدينة: ${bureau.ville}`,
        `الجهة: ${bureau.region}`,
        `المركز: ${bureau.centre || "—"}`,
        `العنوان: ${bureau.adresse || "—"}`,
        `الحالة: ${BUREAU_STATUSES[bureau.status].label}`,
        `عدد المسجلين: ${bureau.inscrits}`,
        `السعة: ${bureau.capacite}`,
        `عدد المصوتين: ${part.votants}`,
        `الأصوات الصحيحة: ${part.valid}`,
        `الأوراق البيضاء: ${part.blancs}`,
        `الأصوات الملغاة: ${part.nuls}`,
        `نسبة المشاركة: ${part.pct}%`,
        `التاريخ والوقت: ${formatDateTime()}`,
        "",
        "── توزيع الأصوات حسب الحزب ──",
        "",
    ];

    state.partis.forEach((p) => {
        const total = getPartiTotal(state, bureauId, p.id);
        lines.push(`${p.name}: ${total} صوت`);
        const details = (state.mourakibs[p.id] || [])
            .map((m) => {
                const c = getMourakibCount(state, bureauId, p.id, m.id);
                return c > 0 ? `${m.name}: ${c}` : null;
            })
            .filter(Boolean);
        if (details.length) lines.push(`  تفصيل المراقبين: ${details.join("، ")}`);
        lines.push("");
    });

    lines.push(`المجموع العام: ${part.valid} صوت صحيح`);
    lines.push("");
    lines.push("── آخر العمليات (10) ──");
    const journal = state.journal.filter((j) => j.bureauId === bureauId).slice(0, 10);
    if (journal.length) {
        journal.forEach((j) => {
            lines.push(
                `${formatTime(j.time)} | ${j.actif} | ${j.parti} | ${j.action} → ${j.total}`
            );
        });
    } else {
        lines.push("— لا توجد عمليات —");
    }
    lines.push(...signatureLines("تصريح: أؤكد أن هذا المحضر مطابق لنتائج الفرز داخل المكتب المذكور."));
    lines.push(`رمز التحقق: ${verify}`);
    lines.push("");
    lines.push("كاسوفت للمعلومية والاستشارات — الدار البيضاء — سري وموثوق");
    return lines;
}

function buildRegionalReportLines(state) {
    const stats = getDashboardStats(state);
    const totalBlancs = state.bureaux.reduce(
        (s, b) => s + getParticipation(state, b.id).blancs,
        0
    );
    const totalNuls = state.bureaux.reduce(
        (s, b) => s + getParticipation(state, b.id).nuls,
        0
    );
    const verify = buildVerifyRapport(state);
    const lines = [
        "═══════════════════════════════════════",
        "     التقرير الإقليمي الموحد — كاسوفت",
        "═══════════════════════════════════════",
        `التاريخ: ${formatDate()}`,
        `عدد المكاتب: ${stats.totalBureaux}`,
        `المكاتب المفتوحة: ${stats.ouverts}`,
        `المكاتب المغلقة: ${stats.fermes}`,
        `مجموع المسجلين: ${stats.totalInscrits}`,
        `مجموع المصوتين: ${stats.totalVotants}`,
        `مجموع الأصوات الصحيحة: ${stats.totalVotes}`,
        `مجموع الأوراق البيضاء: ${totalBlancs}`,
        `مجموع الأصوات الملغاة: ${totalNuls}`,
        `نسبة المشاركة العامة: ${stats.participation}%`,
        "",
        "── تفصيل حسب المكتب ──",
        "",
        "المكتب | المدينة | الحالة | مسجلون | مصوتون | صحيحة | بيضاء | ملغاة | %",
        "─".repeat(72),
    ];

    state.bureaux.forEach((b) => {
        const part = getParticipation(state, b.id);
        const st = BUREAU_STATUSES[b.status].label;
        lines.push(
            `${b.name} | ${b.ville} | ${st} | ${b.inscrits} | ${part.votants} | ${part.valid} | ${part.blancs} | ${part.nuls} | ${part.pct}%`
        );
    });

    lines.push("", "── المجموع حسب الحزب (كل المكاتب) ──", "");
    state.partis.forEach((p) => {
        const total = state.bureaux.reduce(
            (s, b) => s + getPartiTotal(state, b.id, p.id),
            0
        );
        lines.push(`${p.name}: ${total} صوت`);
    });
    lines.push(...signatureLines("تصريح: أؤكد صحة هذا التقرير الإقليمي الموحد."));
    lines.push(`رمز التحقق: ${verify}`);
    lines.push("");
    lines.push("كاسوفت للمعلومية والاستشارات — الدار البيضاء — سري وموثوق");
    return lines;
}

function downloadText(filename, lines) {
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadPdf(endpoint, state, extra = {}) {
    const body = { ...cleanStatePayload(state), ...extra };
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
    });
    if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        throw new Error("يجب تسجيل الدخول");
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "خطأ في إنشاء PDF");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = extra.filename || "rapport.pdf";
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadZip(endpoint, state, extra = {}) {
    const body = { ...cleanStatePayload(state), ...extra };
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
    });
    if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
        throw new Error("يجب تسجيل الدخول");
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "خطأ في إنشاء الأرشيف");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = extra.filename || "export.zip";
    a.click();
    URL.revokeObjectURL(url);
}

function downloadCsv(filename, lines) {
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function csvEscape(value) {
    const s = String(value ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
}

function buildRegionalReportCsv(state) {
    const lines = [
        "المكتب,المدينة,الجهة,الحالة,مسجلون,مصوتون,صحيحة,بيضاء,ملغاة,مشاركة%",
    ];
    state.bureaux.forEach((b) => {
        const part = getParticipation(state, b.id);
        const st = BUREAU_STATUSES[b.status].label;
        lines.push(
            [
                csvEscape(b.name),
                csvEscape(b.ville),
                csvEscape(b.region),
                csvEscape(st),
                b.inscrits,
                part.votants,
                part.valid,
                part.blancs,
                part.nuls,
                part.pct,
            ].join(",")
        );
    });
    lines.push("");
    lines.push("الحزب,مجموع الأصوات");
    state.partis.forEach((p) => {
        const total = state.bureaux.reduce(
            (s, b) => s + getPartiTotal(state, b.id, p.id),
            0
        );
        lines.push(`${csvEscape(p.name)},${total}`);
    });
    return lines;
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportBackup(state) {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`نسخة_احتياطية_كاسوفت_${stamp}.json`, cleanStatePayload(state));
}

async function restoreBackup(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    const err = validateStatePayload(data);
    if (err) throw new Error(err);
    const state = migrateState(data);
    saveState(state);
    const res = await fetch("/api/kasoft/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanStatePayload(state)),
        credentials: "same-origin",
    });
    if (!res.ok) throw new Error("فشل استعادة النسخة على الخادم");
    return state;
}

function cloneState(state) {
    return migrateState(JSON.parse(JSON.stringify(state)));
}

function statesEqual(a, b) {
    return stateSignature(a) === stateSignature(b);
}

function cloturerBureau(state, bureauId, options = {}) {
    const bureau = state.bureaux.find((b) => b.id === bureauId);
    if (!bureau) return { ok: false, error: "bureau" };
    if (bureau.status === "ferme") return { ok: true, already: true };

    const check = validateBureauPV(state, bureauId);
    if (!check.ok && !options.force) {
        return { ok: false, validation: check };
    }

    bureau.status = "ferme";
    ensurePvNumber(state, bureauId);
    addJournalEntry(state, {
        time: new Date().toISOString(),
        bureauId,
        actif: (state.mourakibActif || "").trim() || "—",
        parti: "—",
        mourakib: "—",
        action: "إغلاق",
        total: getBureauTotal(state, bureauId),
    });
    return { ok: true, check };
}

function openPvEmail(state, bureauId) {
    const bureau = state.bureaux.find((b) => b.id === bureauId);
    if (!bureau) return;
    const part = getParticipation(state, bureauId);
    const pvNum = ensurePvNumber(state, bureauId);
    const subject = encodeURIComponent(`PV — ${bureau.name} — ${pvNum}`);
    const body = encodeURIComponent(
        [
            "محضر مكتب الاقتراع — كاسوفت",
            `رقم المحضر: ${pvNum}`,
            `المكتب: ${bureau.name}`,
            `المدينة: ${bureau.ville} — ${bureau.region}`,
            `المسجلون: ${bureau.inscrits}`,
            `المصوتون: ${part.votants}`,
            `الأصوات الصحيحة: ${part.valid}`,
            `البيضاء: ${part.blancs} | الملغاة: ${part.nuls}`,
            `نسبة المشاركة: ${part.pct}%`,
            "",
            "يرجى إرفاق ملف المحضر (TXT/PDF) المُصدَّر من النظام.",
        ].join("\n")
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

async function sendRegionalSummary(state) {
    const lines = buildRegionalReportLines(state);
    const stats = getDashboardStats(state);
    const dateSlug = formatDate().replace(/\//g, "-");
    const filename = `resume_regional_${dateSlug}.txt`;
    downloadText(filename, lines);

    const summaryText = [
        "KASOFT — Résumé régional / ملخص إقليمي",
        `Date: ${formatDate()}`,
        `Bureaux: ${stats.totalBureaux} | Ouverts: ${stats.ouverts} | Fermés: ${stats.fermes}`,
        `Inscrits: ${stats.totalInscrits} | Votants: ${stats.totalVotants}`,
        `Participation: ${stats.participation}%`,
        `Voix valides: ${stats.totalVotes}`,
        "",
        "Le fichier TXT détaillé a été téléchargé — veuillez le joindre à votre message.",
    ].join("\n");

    const subject = encodeURIComponent("KASOFT — Résumé régional élections");
    const body = encodeURIComponent(summaryText);

    if (navigator.share && navigator.canShare) {
        try {
            const file = new File([lines.join("\n")], filename, { type: "text/plain;charset=utf-8" });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: "KASOFT — Résumé régional",
                    text: summaryText,
                    files: [file],
                });
                return;
            }
        } catch {
            /* fallback mailto */
        }
    }
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function filterJournalForBureau(state, bureauId) {
    if (!bureauId) return (state.journal || []).slice(0, 50);
    return (state.journal || [])
        .filter((j) => !j.bureauId || j.bureauId === bureauId)
        .slice(0, 50);
}

window.KasoftStore = {
    STORAGE_KEY,
    PARTY_COLORS,
    BUREAU_STATUSES,
    MOROCCO_REGIONS,
    uid,
    normalizeBureau,
    defaultConfig: emptyConfig,
    migrateState,
    cloneState,
    statesEqual,
    mergeStates,
    fetchRemoteState,
    connectRealtime,
    disconnectRealtime,
    postVoteDelta,
    applyServerState,
    stateSignature,
    loadState,
    loadStateAsync,
    saveState,
    syncToServer,
    formatNum,
    numHtml,
    formatTime,
    formatDate,
    ensureVotes,
    getMourakibCount,
    getPartiTotal,
    getBureauTotal,
    getParticipation,
    getDashboardStats,
    getRegionStats,
    getPartiRanking,
    duplicateBureau,
    clearAllData,
    validateStatePayload,
    ensurePvNumber,
    isBureauLocked,
    validateBureauPV,
    cloturerBureau,
    openPvEmail,
    sendRegionalSummary,
    filterJournalForBureau,
    addJournalEntry,
    buildBureauPVLines,
    buildJournalLines,
    buildRegionalReportLines,
    buildRegionalReportCsv,
    downloadText,
    downloadCsv,
    downloadPdf,
    downloadZip,
    downloadJson,
    exportBackup,
    restoreBackup,
};
