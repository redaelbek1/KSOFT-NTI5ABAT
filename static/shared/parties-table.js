/**
 * Tableau de comptage — une ligne par حزب (image + nom), une colonne par
 * لائحة (جهوية / وطنية) avec un compteur et un bouton +.
 *
 * Utilisé tel quel par la version PC et la version téléphone.
 *
 * KasoftPartiesTable.render({ state, bureauId, locked, leaderId }) → HTML
 */
(function () {
    function tr(key, fallback) {
        return window.KasoftI18n?.t(key) || fallback;
    }

    function escapeHtml(text) {
        return String(text ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[c]));
    }

    function cell(parti, list, count, locked) {
        const disabled = locked ? " disabled" : "";
        return `
            <td class="ptable-cell">
                <div class="ptable-counter">
                    <span class="ptable-count num" lang="en-US" dir="ltr">${count}</span>
                    <button type="button" class="ptable-plus"${disabled}
                        data-vote="${parti.id}:${list.id}:1"
                        aria-label="${escapeHtml(parti.name)} — ${escapeHtml(list.label)} +">+</button>
                </div>
            </td>`;
    }

    function render({ state, bureauId, locked = false, leaderId = null }) {
        const lists = KasoftStore.VOTE_LISTS;
        if (!state.partis.length) {
            return `<p class="hint">${tr("cpt_no_partis", "لا توجد أحزاب — أضفها في الإعدادات")}</p>`;
        }

        const head = lists
            .map((l) => `<th>${escapeHtml(KasoftStore.voteListLabel(l.id))}</th>`)
            .join("");

        const rows = state.partis
            .map((p) => {
                const total = KasoftStore.getPartiTotal(state, bureauId, p.id);
                const isLeader = p.id === leaderId && total > 0;
                const cells = lists
                    .map((l) =>
                        cell(p, l, KasoftStore.getListCount(state, bureauId, p.id, l.id), locked)
                    )
                    .join("");
                return `
            <tr class="ptable-row${isLeader ? " ptable-row-leader" : ""}">
                <th scope="row" class="ptable-parti">
                    ${KasoftLogos.badge(p, { className: "ptable-logo" })}
                    <span class="ptable-parti-name">${escapeHtml(p.name)}</span>
                </th>
                ${cells}
            </tr>`;
            })
            .join("");

        return `
        <div class="ptable-wrap">
            <table class="ptable">
                <thead>
                    <tr>
                        <th class="ptable-parti-th">${tr("cpt_col_parti", "الحزب")}</th>
                        ${head}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }

    window.KasoftPartiesTable = { render };
})();
