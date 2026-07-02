/** Force l'affichage 0-9 sur les zones numériques (secours si le navigateur convertit) */
(function () {
    const EAST = "٠١٢٣٤٥٦٧٨٩";
    const SEL =
        ".num, .kpi-value, .totals-value, .counter-value, .bulk-sub, " +
        ".preview-table td, .journal-table td, .breakdown-item strong";

    function westernizeText(text) {
        return text.replace(/[٠-٩]/g, (c) => String(EAST.indexOf(c)));
    }

    function fixNode(root) {
        (root || document).querySelectorAll(SEL).forEach((el) => {
            if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
                const fixed = westernizeText(el.textContent);
                if (fixed !== el.textContent) el.textContent = fixed;
            }
            el.querySelectorAll("*").forEach((child) => {
                if (child.childNodes.length === 1 && child.childNodes[0].nodeType === 3) {
                    const t = child.textContent;
                    const fixed = westernizeText(t);
                    if (fixed !== t) child.textContent = fixed;
                }
            });
        });
    }

    function boot() {
        fixNode();
        const obs = new MutationObserver(() => fixNode());
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
