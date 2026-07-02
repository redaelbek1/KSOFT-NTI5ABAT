const ELECTION_YEARS = {
    legislative: [
        { key: "legislative_2021", year: 2021 },
        { key: "legislative_2016", year: 2016 },
    ],
    communal: [
        { key: "communal_2021", year: 2021 },
        { key: "communal_2015", year: 2015 },
    ],
};

const els = {
    type: document.getElementById("election-type"),
    year: document.getElementById("election-year"),
    region: document.getElementById("filter-region"),
    province: document.getElementById("filter-province"),
    communeWrap: document.getElementById("commune-wrap"),
    commune: document.getElementById("filter-commune"),
    circ: document.getElementById("filter-circ"),
    circLabel: document.getElementById("circ-label"),
    preview: document.getElementById("btn-preview"),
    search: document.getElementById("btn-search"),
    status: document.getElementById("status-msg"),
    previewEmpty: document.getElementById("preview-empty"),
    legBody: document.getElementById("preview-leg-body"),
    comBody: document.getElementById("preview-com-body"),
};

let loadToken = 0;

function electionKey() {
    const list = ELECTION_YEARS[els.type.value];
    return list.find((e) => e.year === parseInt(els.year.value, 10)).key;
}

function isCommunal() {
    return els.type.value === "communal";
}

function selectedText(select) {
    return select.options[select.selectedIndex]?.text || "";
}

function selectionPayload() {
    const communal = isCommunal();
    return {
        election: electionKey(),
        region: parseInt(els.region.value, 10),
        province: parseInt(els.province.value, 10),
        commune: communal ? parseInt(els.commune.value, 10) : 0,
        circ: parseInt(els.circ.value, 10),
        region_name: selectedText(els.region),
        province_name: els.province.value !== "0" ? selectedText(els.province) : "",
        commune_name: els.commune.value !== "0" ? selectedText(els.commune) : "",
        circ_name: selectedText(els.circ),
    };
}

function validateSelection() {
    const communal = isCommunal();
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    const commune = communal ? parseInt(els.commune.value, 10) : 0;
    const circ = parseInt(els.circ.value, 10);

    if (communal && !region) {
        alert("المرجو اختيار جهة");
        return false;
    }
    if (communal && !province) {
        alert("المرجو اختيار عمالة أو إقليم");
        return false;
    }
    if (communal && !commune) {
        alert("المرجو اختيار جماعة أو مقاطعة");
        return false;
    }
    if (communal && !circ) {
        alert("المرجو اختيار دائرة انتخابية");
        return false;
    }
    return true;
}

function resetDependents() {
    els.province.innerHTML = '<option value="0">اختر العمالة أو الإقليم</option>';
    els.province.disabled = true;
    els.commune.innerHTML = '<option value="0">اختر الجماعة</option>';
    els.commune.disabled = true;
    els.circ.innerHTML = '<option value="0">اختر الدائرة الانتخابية</option>';
    if (!isCommunal()) {
        els.circ.innerHTML = '<option value="0">جميع الدوائر</option>';
    }
    clearPreview();
}

function fillOptions(select, items, placeholder) {
    select.innerHTML = `<option value="0">${placeholder}</option>`;
    items.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = item.name;
        select.appendChild(opt);
    });
    select.disabled = false;
}

function clearPreview() {
    if (!els.legBody) return;
    els.legBody.innerHTML = "";
    els.comBody.innerHTML = "";
    if (els.previewEmpty) els.previewEmpty.classList.remove("hidden");
}

function renderPreview(rows, communal) {
    if (!els.legBody) return;

    document.getElementById("preview-leg").classList.toggle("hidden", communal);
    document.getElementById("preview-com").classList.toggle("hidden", !communal);

    const body = communal ? els.comBody : els.legBody;
    body.innerHTML = rows
        .map((row) => {
            const cells = [
                row.parti,
                row.candidat,
                row.voix,
            ];
            if (!communal) cells.push(row.sieges ?? "");
            return `<tr>${cells.map((c) => `<td class="num" lang="en-US" dir="ltr">${c}</td>`).join("")}</tr>`;
        })
        .join("");

    els.previewEmpty.classList.add("hidden");
}

async function apiGet(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "خطأ في التحميل");
    if (data && data.error) throw new Error(data.error);
    return data;
}

async function loadCircuitsLegislative(token) {
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    els.status.textContent = "جاري تحميل الدوائر...";
    const data = await apiGet(
        `/api/circuits?election=${electionKey()}&region=${region}&province=${province}`
    );
    if (token !== loadToken) return;
    fillOptions(els.circ, data, "جميع الدوائر");
    els.status.textContent = "";
}

async function loadProvinces(token) {
    const region = parseInt(els.region.value, 10);
    els.status.textContent = "جاري تحميل العمالات...";
    const data = await apiGet(
        `/api/provinces?election=${electionKey()}&region=${region}`
    );
    if (token !== loadToken) return;
    fillOptions(els.province, data, "اختر العمالة أو الإقليم");
    els.status.textContent = "";
}

async function loadCommunes(token) {
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    if (!province) return;
    els.status.textContent = "جاري تحميل الجماعات (10-30 ثانية أول مرة)...";
    const data = await apiGet(
        `/api/communes?election=${electionKey()}&region=${region}&province=${province}`
    );
    if (token !== loadToken) return;
    fillOptions(els.commune, data, "اختر الجماعة");
    els.status.innerHTML = data.length
        ? `تم تحميل <span class="num" lang="en-US" dir="ltr">${data.length}</span> جماعة`
        : "";
}

async function loadCircuitsCommunal(token) {
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    const commune = parseInt(els.commune.value, 10);
    if (!commune) return;
    els.status.textContent = "جاري تحميل الدوائر...";
    const data = await apiGet(
        `/api/circuits?election=${electionKey()}&region=${region}&province=${province}&commune=${commune}`
    );
    if (token !== loadToken) return;
    fillOptions(els.circ, data, "اختر الدائرة الانتخابية");
    els.status.textContent = "";
}

function onTypeChange() {
    loadToken += 1;
    const token = loadToken;
    const communal = isCommunal();

    els.communeWrap.classList.toggle("hidden", !communal);
    els.circLabel.textContent = communal
        ? "الدائرة الانتخابية"
        : "الدائرة الانتخابية البرلمانية";

    document.querySelectorAll(".leg-only").forEach((opt) => {
        opt.hidden = communal;
    });

    if (communal && els.region.value === "0") {
        els.region.value = "2";
    }

    resetDependents();

    const region = parseInt(els.region.value, 10);
    if (region > 0) {
        loadProvinces(token).catch(showError);
    } else if (!communal) {
        loadCircuitsLegislative(token).catch(showError);
    }
}

function updateYears() {
    const years = ELECTION_YEARS[els.type.value];
    els.year.innerHTML = years
        .map((y) => `<option value="${y.year}" lang="en-US">${y.year}</option>`)
        .join("");
    onTypeChange();
}

function showError(e) {
    els.status.textContent = "";
    const msg = e.message || "خطأ في التحميل";
    if (window.Ui) Ui.toast(msg, "error");
    else alert(msg);
}

async function runPreview() {
    if (!validateSelection()) return;

    els.preview.disabled = true;
    els.status.textContent = "جاري جلب النتائج...";

    try {
        const res = await fetch("/api/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selectionPayload()),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "خطأ في التحميل");

        renderPreview(data.rows, data.communal);
        els.status.innerHTML = `تم عرض <span class="num" lang="en-US" dir="ltr">${data.count}</span> سجل`;
    } catch (e) {
        clearPreview();
        const msg = e.message || "خطأ في التحميل";
        if (window.Ui) Ui.toast(msg, "error");
        else alert(msg);
        els.status.textContent = "";
    } finally {
        els.preview.disabled = false;
    }
}

async function runDownload() {
    if (!validateSelection()) return;

    els.search.disabled = true;
    els.status.textContent = "جاري تحميل الملف...";

    try {
        const res = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selectionPayload()),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "خطأ في التحميل");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "توزيع_الأصوات.csv";
        a.click();
        URL.revokeObjectURL(url);
        if (window.Ui) Ui.toast("تم التحميل بنجاح", "success");
        else els.status.textContent = "تم التحميل بنجاح";
    } catch (e) {
        els.status.textContent = "";
        if (window.Ui) Ui.toast(e.message, "error");
        else alert(e.message);
    } finally {
        els.search.disabled = false;
    }
}

/* ── Initialisation (page export uniquement) ── */
if (els.type) {
    els.type.addEventListener("change", updateYears);
    els.year.addEventListener("change", onTypeChange);

    els.region.addEventListener("change", () => {
        loadToken += 1;
        const token = loadToken;
        resetDependents();
        const region = parseInt(els.region.value, 10);
        if (region === 0 && !isCommunal()) {
            loadCircuitsLegislative(token).catch(showError);
        } else if (region > 0) {
            loadProvinces(token).catch(showError);
        }
    });

    els.province.addEventListener("change", () => {
        loadToken += 1;
        const token = loadToken;
        const province = parseInt(els.province.value, 10);

        els.commune.innerHTML = '<option value="0">اختر الجماعة</option>';
        els.commune.disabled = true;
        els.circ.innerHTML = isCommunal()
            ? '<option value="0">اختر الدائرة الانتخابية</option>'
            : '<option value="0">جميع الدوائر</option>';

        if (!province) return;
        if (isCommunal()) {
            loadCommunes(token).catch(showError);
        } else {
            loadCircuitsLegislative(token).catch(showError);
        }
    });

    els.commune.addEventListener("change", () => {
        loadToken += 1;
        const token = loadToken;
        if (parseInt(els.commune.value, 10)) {
            loadCircuitsCommunal(token).catch(showError);
        }
    });

    els.preview.addEventListener("click", runPreview);
    els.search.addEventListener("click", runDownload);
    updateYears();
}

/* ── تصدير كل البيانات ── */
const bulkProgress = document.getElementById("bulk-progress");
const bulkFill = document.getElementById("bulk-fill");
const bulkMsg = document.getElementById("bulk-msg");
const bulkDownload = document.getElementById("bulk-download");
const bulkButtons = document.querySelectorAll(".btn-export-type");
let bulkPoll = null;

function setBulkButtonsDisabled(disabled) {
    bulkButtons.forEach((btn) => { btn.disabled = disabled; });
}

function pollBulkStatus() {
    bulkPoll = setInterval(async () => {
        const res = await fetch("/api/export-all/status", { credentials: "same-origin" });
        const data = await res.json();
        bulkFill.style.width = `${data.progress || 0}%`;
        bulkMsg.textContent = data.message || "—";

        if (!data.running) {
            clearInterval(bulkPoll);
            setBulkButtonsDisabled(false);
            if (data.error) {
                alert(data.error);
            } else if (data.file) {
                bulkDownload.classList.remove("hidden");
                bulkDownload.click();
            }
        }
    }, 2000);
}

async function startBulkExport(types) {
    const communal = types.includes("communal");
    const msg = communal
        ? "هذا التصدير يستغرق وقتاً طويلاً (ساعات للجماعية). هل تريد المتابعة؟"
        : "سيتم تصدير كل الدوائر التشريعية (2021 و 2016). هل تريد المتابعة؟";
    if (!confirm(msg)) return;

    setBulkButtonsDisabled(true);
    bulkProgress.classList.remove("hidden");
    bulkDownload.classList.add("hidden");
    bulkFill.style.width = "0%";
    bulkMsg.textContent = "بدء التصدير...";

    try {
        const res = await fetch("/api/export-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ types }),
        });
        if (res.status === 401) {
            window.location.href = `/login?next=${encodeURIComponent("/export")}`;
            return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        pollBulkStatus();
    } catch (e) {
        setBulkButtonsDisabled(false);
        alert(e.message);
    }
}

bulkButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        startBulkExport(btn.dataset.types.split(","));
    });
});
