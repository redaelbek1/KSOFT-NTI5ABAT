/**
 * Compteurs bureau — ملغاة (undo dernier +) + متنازع عليها (+)
 */
(function () {
    function tr(key, fallback) {
        return window.KasoftI18n?.t(key) || fallback || key;
    }

    function init(options) {
        const {
            getState,
            persist,
            getBureauId,
            isLocked,
            requireActif,
            canUndo,
            onUndo,
            onRender,
        } = options;

        const cancelVal = document.getElementById("counter-cancel-value");
        const negVal = document.getElementById("counter-negotiation-value");
        const btnUndo = document.getElementById("btn-counter-cancel");
        const btnCancelPlus = document.getElementById("btn-counter-cancel-plus");
        const btnNeg = document.getElementById("btn-counter-negotiation");
        if (!cancelVal || !negVal || !btnUndo || !btnCancelPlus || !btnNeg) return null;

        function refresh() {
            const state = getState();
            const bid = getBureauId();
            if (!bid) return;
            cancelVal.textContent = String(KasoftStore.getBureauCounter(state, bid, "cancel"));
            negVal.textContent = String(KasoftStore.getBureauCounter(state, bid, "negotiation"));
            const locked = isLocked();
            const undoOk = typeof canUndo === "function" ? canUndo() : false;
            btnUndo.disabled = locked || !undoOk;
            btnCancelPlus.disabled = locked;
            btnNeg.disabled = locked;
        }

        btnUndo.addEventListener("click", async () => {
            if (isLocked()) {
                alert(tr("cpt_locked", "المكتب مغلق"));
                return;
            }
            const actif = requireActif();
            if (!actif) return;
            if (typeof onUndo === "function") {
                const ok = await onUndo(actif);
                if (ok) {
                    persist();
                    refresh();
                    onRender?.();
                }
            }
        });

        btnCancelPlus.addEventListener("click", () => {
            if (isLocked()) {
                alert(tr("cpt_locked", "المكتب مغلق"));
                return;
            }
            const actif = requireActif();
            if (!actif) return;
            KasoftStore.incrementBureauCounter(getState(), getBureauId(), "cancel", actif);
            persist();
            refresh();
            onRender?.();
        });

        btnNeg.addEventListener("click", () => {
            if (isLocked()) {
                alert(tr("cpt_locked", "المكتب مغلق"));
                return;
            }
            const actif = requireActif();
            if (!actif) return;
            KasoftStore.incrementBureauCounter(getState(), getBureauId(), "negotiation", actif);
            persist();
            refresh();
            onRender?.();
        });

        refresh();
        return { refresh };
    }

    window.KasoftBureauCounters = { init };
})();
