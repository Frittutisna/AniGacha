const themeToggleBtn = document.getElementById("theme-toggle");

themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("anigacha_theme", isDark ? "dark" : "light");
});

const langToggleBtn         = document.getElementById("lang-toggle");
langToggleBtn.textContent   = titleLang;

langToggleBtn.addEventListener("click", () => {
    titleLang = titleLang === "JP" ? "EN" : "JP";
    localStorage.setItem("anigacha_lang", titleLang);
    langToggleBtn.textContent = titleLang;
    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) renderResults(lastResults, false, lastBannerType);
    renderInventory();
    if (typeof aniQuizRefreshMcLanguage === "function") aniQuizRefreshMcLanguage();
});

const SORT_FIELDS_BY_ENTITY = {
    CHARACTER: [
        {value: "RARITY",       label: "Rarity"},
        {value: "RANK",         label: "Rank"},
        {value: "POPULARITY",   label: "Popularity"},
        {value: "LEVEL",        label: "Level"},
        {value: "NAME",         label: "Name"}
    ],

    ANIME: [
        {value: "POPULARITY",   label: "Popularity"},
        {value: "NAME",         label: "Name"},
        {value: "DATE",         label: "Date"}
    ]
};

function getCheckedValues       (containerSelector) {return new Set(Array.from(document.querySelectorAll(`${containerSelector} input[type="checkbox"]:checked`)).map(cb => cb.value))}
function clearFilterCheckboxes  (selectors)         {selectors.forEach(sel => {document.querySelectorAll(`${sel} input[type="checkbox"]`).forEach(cb => {cb.checked = false})})}

function closeAllCustomSelects(exceptWrapper = null) {document.querySelectorAll(".custom-select-wrapper").forEach(wrapper => {
    if (wrapper === exceptWrapper) return;

    wrapper.querySelector(".custom-select-menu")    ?.classList.add     ("hidden");
    wrapper.querySelector(".custom-select-chevron") ?.classList.remove  ("rotate-180");
})}

function syncCustomSelectUI(wrapper) {
    const select    = wrapper.querySelector("select");
    const labelEl   = wrapper.querySelector(".custom-select-label");
    const menu      = wrapper.querySelector(".custom-select-menu");

    if (!select || !labelEl || !menu) return;

    const selectedOpt   = select.options[select.selectedIndex];
    const activeText    = selectedOpt ? selectedOpt.textContent : "";

    const sizersHtml = Array.from(select.options)
        .map(opt => `<span class="col-start-1 row-start-1 invisible h-0 overflow-hidden pointer-events-none" aria-hidden="true">${escapeHTML(opt.textContent)}</span>`)
        .join("");

    labelEl.className = "custom-select-label inline-grid whitespace-nowrap";
    labelEl.innerHTML = `<span class="col-start-1 row-start-1">${escapeHTML(activeText)}</span>${sizersHtml}`;

    menu.innerHTML = Array.from(select.options)
        .filter(opt => !opt.disabled)
        .map(opt => {
            const isSelected = opt.value === select.value;

            const activeClasses = isSelected
                ? "bg-indigo-600/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold"
                : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800";

            const checkHtml = isSelected
                ? `<svg class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
                : `<span class="w-3.5 h-3.5 shrink-0"></span>`;

            return `
                <button type="button" data-option-value="${escapeHTML(opt.value)}"
                    class="w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between gap-3 whitespace-nowrap transition ${activeClasses}">
                    <span>${escapeHTML(opt.textContent)}</span>
                    ${checkHtml}
                </button>
            `;
        }).join("");
}

function setCustomSelectValue(selectId, value) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.value = value;

    const wrapper = select.closest(".custom-select-wrapper");
    if (wrapper) syncCustomSelectUI(wrapper);
}

function initCustomSelects() {document.querySelectorAll(".custom-select-wrapper").forEach(wrapper => {
    const select    = wrapper.querySelector("select");
    const trigger   = wrapper.querySelector(".custom-select-trigger");
    const menu      = wrapper.querySelector(".custom-select-menu");
    const chevron   = wrapper.querySelector(".custom-select-chevron");

    if (!select || !trigger || !menu) return;
    syncCustomSelectUI(wrapper);

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();

        const isHidden = menu.classList.contains("hidden");
        closeAllCustomSelects(wrapper);

        menu.       classList.toggle("hidden",      !isHidden);
        chevron?.   classList.toggle("rotate-180",  isHidden);
    });

    menu.addEventListener("click", (e) => {
        e.stopPropagation();

        const optBtn = e.target.closest("[data-option-value]");
        if (!optBtn) return;

        const nextVal = optBtn.getAttribute("data-option-value");

        if (select.value !== nextVal) {
            select.value = nextVal;
            syncCustomSelectUI(wrapper);
            select.dispatchEvent(new Event("change"));
        }

        menu.       classList.add       ("hidden");
        chevron?.   classList.remove    ("rotate-180");
    });
})}

function syncSortFieldOptions(preferredField = null) {
    const entityEl  = document.getElementById("sort-entity");
    const fieldEl   = document.getElementById("sort-field");

    if (!entityEl || !fieldEl) return;

    const currentField  = preferredField || fieldEl.value;
    const options       = SORT_FIELDS_BY_ENTITY[entityEl.value] || SORT_FIELDS_BY_ENTITY.CHARACTER;

    fieldEl.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");

    const nextVal = options.some(o => o.value === currentField) ? currentField : options[0].value;
    setCustomSelectValue("sort-field", nextVal);
}

function setSortControlState(entity, field, dir) {
    const dirBtn = document.getElementById("sort-dir-btn");
    if (!dirBtn) return;

    setCustomSelectValue("sort-entity", entity);
    syncSortFieldOptions(field);

    dirBtn.dataset.dir = dir;
    dirBtn.textContent = dir === "ASC" ? "▲" : "▼";
}

function getResolvedSortMode() {
    const entity    = document.getElementById("sort-entity")    ?.value         || "CHARACTER";
    const field     = document.getElementById("sort-field")     ?.value         || "RARITY";
    const dir       = document.getElementById("sort-dir-btn")   ?.dataset.dir   || "DESC";

    if (entity === "CHARACTER") {
        if (field === "RARITY")     return dir === "ASC" ? "RARITY_ASC"         : "RARITY_DESC";
        if (field === "RANK")       return dir === "ASC" ? "RANK_ASC"           : "RANK_DESC";
        if (field === "POPULARITY") return dir === "ASC" ? "CHAR_COUNT_ASC"     : "CHAR_COUNT_DESC";
        if (field === "LEVEL")      return dir === "ASC" ? "LEVEL_ASC"          : "LEVEL_DESC";
        if (field === "NAME")       return dir === "ASC" ? "CHAR_ZA"            : "CHAR_AZ";
    } else {
        if (field === "POPULARITY") return dir === "ASC" ? "ANIME_COUNT_ASC"    : "ANIME_COUNT_DESC";
        if (field === "NAME")       return dir === "ASC" ? "ANIME_ZA"           : "ANIME_AZ";
        if (field === "DATE")       return dir === "ASC" ? "DATE_OLD"           : "DATE_NEW";
    }

    return "RARITY_DESC";
}

function initSortFilterDropdown() {
    const wrapper   = document.getElementById("sort-filter-wrapper");
    const trigger   = document.getElementById("sort-filter-trigger");
    const menu      = document.getElementById("sort-filter-menu");
    const chevron   = document.getElementById("sort-filter-chevron");

    if (!wrapper || !trigger || !menu) return;

    initCustomSelects       ();
    syncSortFieldOptions    ("RARITY");

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();

        closeAllCustomSelects();
        const isHidden = menu.classList.contains("hidden");

        menu.       classList.toggle("hidden",      !isHidden);
        chevron?.   classList.toggle("rotate-180",  isHidden);
    });

    menu.addEventListener("click", (e) => {
        if (!e.target.closest(".custom-select-wrapper")) closeAllCustomSelects();
        e.stopPropagation();
    });

    document.getElementById("sort-entity")?.addEventListener("change", () => {
        syncSortFieldOptions    ();
        resetPageAndRender      ();
    });

    document.getElementById("sort-field")?.addEventListener("change", resetPageAndRender);

    document.getElementById("sort-dir-btn")?.addEventListener("click", (e) => {
        const btn       = e.currentTarget;
        const nextDir   = btn.dataset.dir === "DESC" ? "ASC" : "DESC";
        btn.dataset.dir = nextDir;
        btn.textContent = nextDir === "ASC" ? "▲" : "▼";

        resetPageAndRender();
    });

    menu.addEventListener("change", (e) => {if (e.target.matches('input[type="checkbox"]')) resetPageAndRender()});

    document.addEventListener("click", () => {
        closeAllCustomSelects();

        const sortMenu      = document.getElementById("sort-filter-menu");
        const sortChevron   = document.getElementById("sort-filter-chevron");
        const quizMenu      = document.getElementById("quiz-settings-menu");
        const quizChevron   = document.getElementById("quiz-settings-chevron");

        if (sortMenu)       sortMenu    .classList.add      ("hidden");
        if (sortChevron)    sortChevron .classList.remove   ("rotate-180");
        if (quizMenu)       quizMenu    .classList.add      ("hidden");
        if (quizChevron)    quizChevron .classList.remove   ("rotate-180");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const alertModalEl = document.getElementById("alert-modal");
            const shareModalEl = document.getElementById("share-modal");

            if (alertModalEl && !alertModalEl.classList.contains("hidden")) {
                e.preventDefault    ();
                closeAlertModal     ();

                return;
            }

            if (shareModalEl && !shareModalEl.classList.contains("hidden")) {
                e.preventDefault            ();
                shareModalEl.classList.add  ("hidden");

                return;
            }
        }

        if (e.key === "Escape") {
            closeAllCustomSelects();

            menu.       classList.add       ("hidden");
            chevron?.   classList.remove    ("rotate-180");

            const alertModalEl = document.getElementById("alert-modal");

            if (alertModalEl && !alertModalEl.classList.contains("hidden")) {
                closeAlertModal();
                return;
            }

            closeAnilistModal();
            const logoutModalEl = document.getElementById("logout-modal");

            if (logoutModalEl && !logoutModalEl.classList.contains("hidden")) {
                logoutModalEl.classList.add("hidden");
                return;
            }

            document.getElementById("deck-modal")?.     classList.add("hidden");
            document.getElementById("share-modal")?.    classList.add("hidden");
            document.getElementById("photo-modal")?.    classList.add("hidden");
            document.getElementById("quiz-end-modal")?. classList.add("hidden");
            document.getElementById("sell-all-modal")?. classList.add("hidden");
        }
    });
}

let alertModalOnClose = null;

function closeAlertModal() {
    const modal = document.getElementById("alert-modal");
    if (!modal || modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");

    const cb = alertModalOnClose;
    alertModalOnClose = null;
    if (typeof cb === "function") cb();
}

function showAlertModal(message, title = "Notice", onClose = null) {
    const modal = document.getElementById("alert-modal");
    if (!modal) return;

    document.getElementById("alert-modal-title")    .textContent    = title;
    document.getElementById("alert-modal-message")  .textContent    = message;
    alertModalOnClose                                               = onClose;

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    modal.classList.remove("hidden");
}

document.getElementById("alert-modal")?.addEventListener("click", (e) => {if (e.target.id === "alert-modal") closeAlertModal()});

initSortFilterDropdown();

function initQuizSettingsDropdown() {
    const wrapper   = document.getElementById("quiz-settings-wrapper");
    const trigger   = document.getElementById("quiz-settings-trigger");
    const menu      = document.getElementById("quiz-settings-menu");
    const chevron   = document.getElementById("quiz-settings-chevron");

    if (!wrapper || !trigger || !menu) return;

    trigger.addEventListener("click", (e) => {
        e.stopPropagation       ();
        closeAllCustomSelects   ();

        document.getElementById("sort-filter-menu")?.       classList.add       ("hidden");
        document.getElementById("sort-filter-chevron")?.    classList.remove    ("rotate-180");

        const isHidden = menu.classList.contains("hidden");
        menu.classList.toggle("hidden", !isHidden);
        chevron?.classList.toggle("rotate-180", isHidden);
    });

    menu.addEventListener("click", (e) => {
        if (!e.target.closest(".custom-select-wrapper")) closeAllCustomSelects();
        e.stopPropagation();
    });

    function bindRangeSelects(minId, maxId) {
        const minSel = document.getElementById(minId);
        const maxSel = document.getElementById(maxId);

        if (!minSel || !maxSel) return;

        const syncBounds = (changed) => {
            const minVal = minSel.value ? Number(minSel.value) : null;
            const maxVal = maxSel.value ? Number(maxSel.value) : null;

            if (minVal !== null && maxVal !== null && minVal >= maxVal) {
                if (changed === "min")  maxSel.value = "";
                else                    minSel.value = "";
            }

            Array.from(maxSel.options).forEach(opt => {opt.disabled = Boolean(opt.value && minVal !== null && Number(opt.value) <= minVal)});
            Array.from(minSel.options).forEach(opt => {opt.disabled = Boolean(opt.value && maxVal !== null && Number(opt.value) >= maxVal)});

            syncCustomSelectUI(minSel.closest(".custom-select-wrapper"));
            syncCustomSelectUI(maxSel.closest(".custom-select-wrapper"));

            if (typeof aniQuizUpdateSettingsPreview === "function") aniQuizUpdateSettingsPreview();
        };

        minSel.addEventListener("change", () => syncBounds("min"));
        maxSel.addEventListener("change", () => syncBounds("max"));
    }

    bindRangeSelects("quiz-vintage-min",    "quiz-vintage-max");
    bindRangeSelects("quiz-diff-min",       "quiz-diff-max");
}

initQuizSettingsDropdown();

function initGlobalTooltips() {
    const tooltipEl     = document.getElementById("global-tooltip");
    const headerEl      = document.getElementById("global-tooltip-header");
    const titleEl       = document.getElementById("global-tooltip-title");
    const bodyEl        = document.getElementById("global-tooltip-body");
    const listWrapEl    = document.getElementById("global-tooltip-list-wrap");
    const listEl        = document.getElementById("global-tooltip-list");

    if (!tooltipEl) return;

    let activeTarget        = null;
    let longPressTimer      = null;
    let suppressNextClick   = false;
    const isTouchDevice     = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;

    function isNonInteractiveTooltipTarget(el) {return !el.closest("button, a, input, select, [data-lock-key], [data-sell-key], [data-spark-key]")}

    function syncTooltipContent(el) {
        if (el.hasAttribute("title")) {
            const raw = el.getAttribute("title");
            if (raw) el.setAttribute("data-tooltip", raw);

            el.removeAttribute("title");
        }

        const rawText = el.getAttribute("data-tooltip");
        if (!rawText) return false;

        const customTitle   = el.getAttribute("data-tooltip-title");
        const lines         = rawText.split("\n").map(l => l.trim());
        const splitIdx      = lines.indexOf("");
        const descLines     = (splitIdx >= 0    ? lines.slice(0, splitIdx) : lines) .filter(Boolean);
        const listItems     = splitIdx >= 0     ? lines.slice(splitIdx + 1)         .filter(Boolean) : [];
        const lineClass     = "sm:whitespace-nowrap";

        if (customTitle) {
            titleEl.textContent = customTitle;
            titleEl.className   = "whitespace-nowrap";

            headerEl.classList.remove("hidden");

            bodyEl.className = "mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300 space-y-0.5";
            bodyEl.innerHTML = descLines.map(l => `<p class="${lineClass}">${escapeHTML(l)}</p>`).join("");
        } else if (descLines.length > 1) {
            titleEl.textContent = descLines[0];
            titleEl.className   = "whitespace-nowrap";

            headerEl.classList.remove("hidden");

            bodyEl.className = "mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 space-y-0.5";
            bodyEl.innerHTML = descLines.slice(1).map(l => `<p class="${lineClass}">${escapeHTML(l)}</p>`).join("");
        } else {
            headerEl.classList.add("hidden");

            bodyEl.className = "text-[11px] font-semibold leading-snug text-slate-800 dark:text-slate-100";
            bodyEl.innerHTML = descLines.map(l => `<p class="${lineClass}">${escapeHTML(l)}</p>`).join("");
        }

        if (listItems.length > 0) {
            listEl.innerHTML = listItems.map(item =>
                `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">${escapeHTML(item)}</span>`
            ).join("");

            listWrapEl      .classList.remove   ("hidden");
        } else listWrapEl   .classList.add      ("hidden");

        return true;
    }

    let tooltipRafId = 0;

    function positionTooltip(el) {
        const margin    = 8;
        const maxAvail  = window.innerWidth - margin * 2;
        const hasList   = !listWrapEl.classList.contains("hidden");
        const rect      = el.getBoundingClientRect();

        tooltipEl.style.width       = "max-content";
        tooltipEl.style.maxWidth    = `${maxAvail}px`;

        if (hasList) {
            listWrapEl.classList.add("hidden");

            const contentW          = Math.min(tooltipEl.offsetWidth, maxAvail);
            tooltipEl.style.width   = `${contentW}px`;

            listWrapEl.classList.remove("hidden");
        }

        const tipW  = tooltipEl.offsetWidth;
        const tipH  = tooltipEl.offsetHeight;
        let left    = rect.left + rect.width / 2 - tipW / 2;
        left        = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));

        let top = rect.bottom + 8;
        if (top + tipH > window.innerHeight - margin) top = Math.max(margin, rect.top - tipH - 8);

        tooltipEl.style.left    = `${Math.round(left)}px`;
        tooltipEl.style.top     = `${Math.round(top)}px`;
    }

    function showTooltip(el) {
        if (!syncTooltipContent(el)) return;

        activeTarget = el;
        cancelAnimationFrame(tooltipRafId);

        tooltipRafId = requestAnimationFrame(() => {
            if (activeTarget !== el) return;
            positionTooltip(el);

            tooltipEl.classList.remove  ("opacity-0");
            tooltipEl.classList.add     ("opacity-100");
        });
    }

    function hideTooltip() {
        activeTarget = null;
        cancelAnimationFrame(tooltipRafId);

        tooltipEl.classList.remove  ("opacity-100");
        tooltipEl.classList.add     ("opacity-0");
    }

    document.addEventListener("mouseover", (e) => {
        if (isTouchDevice()) return;
        const target = e.target.closest("[title], [data-tooltip]");

        if (!target) {
            if (activeTarget) hideTooltip();
            return;
        }

        if (target !== activeTarget) showTooltip(target);
    });

    document.addEventListener("mouseout", (e) => {
        if (isTouchDevice() || !activeTarget) return;

        const next = e.relatedTarget?.closest?.("[title], [data-tooltip]");
        if (next !== activeTarget) hideTooltip();
    });

    document.addEventListener("touchstart", (e) => {
        if (!isTouchDevice()) return;
        const target = e.target.closest("[title], [data-tooltip]");

        if (!target) {
            hideTooltip();
            return;
        }

        if (isNonInteractiveTooltipTarget(target)) {
            if (activeTarget === target)    hideTooltip();
            else                            showTooltip(target);

            return;
        }

        clearTimeout(longPressTimer);

        longPressTimer = setTimeout(() => {
            showTooltip(target);
            suppressNextClick = true;
        }, 400);

    }, {passive: true});

    document.addEventListener("touchmove",  () => {clearTimeout(longPressTimer)}, {passive: true});
    document.addEventListener("touchend",   () => {clearTimeout(longPressTimer)});

    document.addEventListener("focusin", (e) => {
        if (isTouchDevice()) return;

        const target = e.target.closest("[title], [data-tooltip]");
        if (target) showTooltip(target);
    });

    document.addEventListener("focusout",   () => {if (!isTouchDevice())    hideTooltip()});
    document.addEventListener("scroll",     () => {if (activeTarget)        hideTooltip()}, {capture: true, passive: true});

    document.addEventListener("click", (e) => {
        if (suppressNextClick) {
            e.preventDefault    ();
            e.stopPropagation   ();

            suppressNextClick = false;
            return;
        }

        if (activeTarget && document.body.contains(activeTarget)) {
            if (!isTouchDevice() || isNonInteractiveTooltipTarget(activeTarget)) {
                syncTooltipContent  (activeTarget);
                positionTooltip     (activeTarget);
            } else  hideTooltip();
        } else      hideTooltip();
    }, true);
}

initGlobalTooltips();

const PAGE_NAV_ICONS = {
    HOME    : '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    QUIZ    : '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    CASINO  : '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/>',
    TABI    : '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>'
};

const PAGE_NAV_LABELS = {
    HOME    : "Home",
    QUIZ    : "Quiz",
    CASINO  : "Casino",
    TABI    : "Tabi"
};

function syncPageNavigation(currentPage = "HOME") {
    const trigger   = document.getElementById("page-nav-trigger");
    const icon      = document.getElementById("page-nav-icon");
    const menu      = document.getElementById("page-nav-menu");

    if (!trigger || !icon || !menu) return;

    const activePage    = PAGE_NAV_LABELS[currentPage] ? currentPage : "HOME";
    icon.innerHTML      = PAGE_NAV_ICONS[activePage];

    trigger.setAttribute("aria-label", `Open page navigation; currently on the ${PAGE_NAV_LABELS[activePage]} page`);

    menu.innerHTML = Object.entries(PAGE_NAV_LABELS)
        .filter(([page]) => page !== activePage)
        .map(([page, pageLabel]) => `
            <button type="button"
                role="menuitem"
                data-page-target="${page}"
                class="w-full px-3 py-2.5 flex items-center gap-2.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap">
                <svg class="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round">
                    ${PAGE_NAV_ICONS[page]}
                </svg>
                <span>${pageLabel}</span>
            </button>
        `).join("");
}

function switchHeaderPage(targetPage) {
    const mainPage      = document.getElementById("main-page");
    const quizPage      = document.getElementById("quiz-page");
    const casinoPage    = document.getElementById("casino-page");
    const tabiPage      = document.getElementById("tabi-page");
    const leavingQuiz   = !quizPage.classList.contains("hidden") && targetPage !== "QUIZ";

    if (leavingQuiz && typeof aniQuizRun !== "undefined" && aniQuizRun && !document.getElementById("quiz-active").classList.contains("hidden")) {
        aniQuizEndToHome = (targetPage === "HOME");
        quizEndModal?.classList.remove("hidden");
        document.getElementById("quiz-end-confirm")?.focus();

        return;
    }

    mainPage.   classList.toggle("hidden", targetPage !== "HOME");
    quizPage.   classList.toggle("hidden", targetPage !== "QUIZ");
    casinoPage. classList.toggle("hidden", targetPage !== "CASINO");
    tabiPage?.  classList.toggle("hidden", targetPage !== "TABI");

    syncPageNavigation(targetPage);

    if (targetPage === "QUIZ") {
        if (typeof aniQuizRenderMissions        === "function") aniQuizRenderMissions           ();
        if (typeof aniQuizUpdateSettingsPreview === "function") aniQuizUpdateSettingsPreview    ();
        if (typeof loadAniQuizData              === "function") loadAniQuizData                 ();
    } else if (targetPage === "CASINO") {
        if (currentUser) {
            const bjInput   = document.getElementById("bj-bet-input");
            const rlInput   = document.getElementById("rl-bet-input");
            const fxInput   = document.getElementById("fx-bet-input");
            const synInput  = document.getElementById("syn-bet-input");

            if      (casinoBjState?.status === "ACTIVE"     && casinoBjState.bet)                           bjInput     .value = casinoBjState.bet;
            else if (stars > 0                              && Number(bjInput.value) > stars)               bjInput     .value = stars;
            if      (stars > 0                              && Number(rlInput.value) > stars)               rlInput     .value = stars;
            if      (stars > 0                              && Number(fxInput.value) > stars)               fxInput     .value = stars;
            if      (casinoSynState?.status === "ACTIVE"    && casinoSynState.bet)                          synInput    .value = casinoSynState.bet;
            else if (stars > 0                              && synInput && Number(synInput.value) > stars)  synInput    .value = stars;
        }

        renderBlackjackUI   ();
        renderRouletteUI    ();
        renderForexUI       ();
        renderSynergyUI     ();
    } else if (targetPage === "TABI" && typeof tabiOnPageOpen === "function") tabiOnPageOpen();

    window.scrollTo({top: 0, behavior: "instant"});
}

function closeCasinoPage() {switchHeaderPage("HOME")}

function initPageNavigationDropdown() {
    const wrapper   = document.getElementById("page-nav-wrapper");
    const trigger   = document.getElementById("page-nav-trigger");
    const menu      = document.getElementById("page-nav-menu");
    const chevron   = document.getElementById("page-nav-chevron");

    if (!wrapper || !trigger || !menu) return;

    function closeMenu() {
        menu.       classList.add       ("hidden");
        chevron?.   classList.remove    ("rotate-180");

        trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation       ();
        closeAllCustomSelects   ();

        document.getElementById("sort-filter-menu")?.       classList.add       ("hidden");
        document.getElementById("sort-filter-chevron")?.    classList.remove    ("rotate-180");
        document.getElementById("quiz-settings-menu")?.     classList.add       ("hidden");
        document.getElementById("quiz-settings-chevron")?.  classList.remove    ("rotate-180");

        const isHidden = menu.classList.contains("hidden");

        menu.       classList.toggle    ("hidden",          !isHidden);
        chevron?.   classList.toggle    ("rotate-180",      isHidden);
        trigger.    setAttribute        ("aria-expanded",   String(isHidden));
    });

    menu.addEventListener("click", async (e) => {
        e.stopPropagation();

        const option = e.target.closest("[data-page-target]");
        if (!option) return;

        const targetPage = option.dataset.pageTarget;
        closeMenu();

        if (isSharedView && typeof exitSharedCollection === "function") {
            await exitSharedCollection();
            if (targetPage !== "HOME") switchHeaderPage(targetPage);
            return;
        }

        switchHeaderPage(targetPage);
    });

    document.addEventListener("click",      closeMenu);
    document.addEventListener("keydown",    (e) => {if (e.key === "Escape") closeMenu()});
}

syncPageNavigation          ("HOME");
initPageNavigationDropdown  ();