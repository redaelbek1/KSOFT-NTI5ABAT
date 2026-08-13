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

function tr(key) {
    return window.KasoftI18n?.t(key) || key;
}

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
        alert(tr("exp_err_region"));
        return false;
    }
    if (communal && !province) {
        alert(tr("exp_err_province"));
        return false;
    }
    if (communal && !commune) {
        alert(tr("exp_err_commune"));
        return false;
    }
    if (communal && !circ) {
        alert(tr("exp_err_circ"));
        return false;
    }
    return true;
}

function resetDependents() {
    els.province.innerHTML = `<option value="0">${tr("exp_ph_province")}</option>`;
    els.province.disabled = true;
    els.commune.innerHTML = `<option value="0">${tr("exp_ph_commune")}</option>`;
    els.commune.disabled = true;
    els.circ.innerHTML = `<option value="0">${tr("exp_ph_circ")}</option>`;
    if (!isCommunal()) {
        els.circ.innerHTML = `<option value="0">${tr("exp_ph_all_circ")}</option>`;
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
    if (!res.ok) throw new Error(data.error || tr("exp_err_load"));
    if (data && data.error) throw new Error(data.error);
    return data;
}

async function loadRegions(token) {
    const data = await apiGet(`/api/regions?election=${electionKey()}`);
    if (token !== loadToken) return;
    const placeholder = isCommunal() ? tr("exp_ph_region") : tr("exp_national");
    fillOptions(els.region, data, placeholder);
}

async function loadCircuitsLegislative(token) {
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    els.status.textContent = tr("exp_loading_circ");
    const data = await apiGet(
        `/api/circuits?election=${electionKey()}&region=${region}&province=${province}`
    );
    if (token !== loadToken) return;
    fillOptions(els.circ, data, tr("exp_ph_all_circ"));
    els.status.textContent = "";
}

async function loadProvinces(token) {
    const region = parseInt(els.region.value, 10);
    els.status.textContent = tr("exp_loading_provinces");
    const data = await apiGet(
        `/api/provinces?election=${electionKey()}&region=${region}`
    );
    if (token !== loadToken) return;
    fillOptions(els.province, data, tr("exp_ph_province"));
    els.status.textContent = "";
}

async function loadCommunes(token) {
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    if (!province) return;
    els.status.textContent = tr("exp_loading_communes");
    const data = await apiGet(
        `/api/communes?election=${electionKey()}&region=${region}&province=${province}`
    );
    if (token !== loadToken) return;
    fillOptions(els.commune, data, tr("exp_ph_commune"));
    els.status.innerHTML = data.length
        ? `${tr("exp_loaded_communes_prefix")} <span class="num" lang="en-US" dir="ltr">${data.length}</span> ${tr("exp_loaded_communes_suffix")}`
        : "";
}

async function loadCircuitsCommunal(token) {
    const region = parseInt(els.region.value, 10);
    const province = parseInt(els.province.value, 10);
    const commune = parseInt(els.commune.value, 10);
    if (!commune) return;
    els.status.textContent = tr("exp_loading_circ");
    const data = await apiGet(
        `/api/circuits?election=${electionKey()}&region=${region}&province=${province}&commune=${commune}`
    );
    if (token !== loadToken) return;
    fillOptions(els.circ, data, tr("exp_ph_circ"));
    els.status.textContent = "";
}

async function onTypeChange() {
    loadToken += 1;
    const token = loadToken;
    const communal = isCommunal();

    els.communeWrap.classList.toggle("hidden", !communal);
    if (els.circLabel) {
        els.circLabel.textContent = communal ? tr("exp_circ_com") : tr("exp_circ_leg");
        els.circLabel.dataset.i18n = communal ? "exp_circ_com" : "exp_circ_leg";
    }

    document.querySelectorAll(".leg-only").forEach((opt) => {
        opt.hidden = communal;
    });

    resetDependents();
    await loadRegions(token);
    if (token !== loadToken) return;

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
    const msg = e.message || tr("exp_err_load");
    if (window.Ui) Ui.toast(msg, "error");
    else alert(msg);
}

async function runPreview() {
    if (!validateSelection()) return;

    els.preview.disabled = true;
    els.status.textContent = tr("exp_loading_results");

    try {
        const res = await fetch("/api/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selectionPayload()),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || tr("exp_err_load"));

        renderPreview(data.rows, data.communal);
        els.status.innerHTML = `${tr("exp_preview_count_prefix")} <span class="num" lang="en-US" dir="ltr">${data.count}</span> ${tr("exp_preview_count_suffix")}`;
    } catch (e) {
        clearPreview();
        const msg = e.message || tr("exp_err_load");
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
    els.status.textContent = tr("exp_loading_file");

    try {
        const res = await fetch("/api/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(selectionPayload()),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || tr("exp_err_load"));
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = tr("exp_csv_filename");
        a.click();
        URL.revokeObjectURL(url);
        if (window.Ui) Ui.toast(tr("exp_download_ok"), "success");
        else els.status.textContent = tr("exp_download_ok");
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

        els.commune.innerHTML = `<option value="0">${tr("exp_ph_commune")}</option>`;
        els.commune.disabled = true;
        els.circ.innerHTML = isCommunal()
            ? `<option value="0">${tr("exp_ph_circ")}</option>`
            : `<option value="0">${tr("exp_ph_all_circ")}</option>`;

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

    document.addEventListener("kasoft:lang", () => {
        if (window.KasoftI18n) KasoftI18n.applyI18n();
        onTypeChange();
    });
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
    const msg = communal ? tr("exp_bulk_confirm_com") : tr("exp_bulk_confirm_leg");
    if (!confirm(msg)) return;

    setBulkButtonsDisabled(true);
    bulkProgress.classList.remove("hidden");
    bulkDownload.classList.add("hidden");
    bulkFill.style.width = "0%";
    bulkMsg.textContent = tr("exp_bulk_starting");

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
