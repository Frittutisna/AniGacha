function getItemsPerPage() {return window.innerWidth < 640 ? 30 : 50}

function escapeHTML(str) {return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPercent(val) {
    const pct   = Math.round(val * 100      * 1000) / 1000;
    const whole = Math.floor(pct);
    const rem   = Math.round((pct - whole)  * 1000) / 1000;

    const fractions = {
        0.125   : "⅛",
        0.25    : "¼",
        0.375   : "⅜",
        0.5     : "½",
        0.625   : "⅝",
        0.75    : "¾",
        0.875   : "⅞"
    };

    const frac = fractions[rem];
    if (frac) return whole > 0 ? `${whole}${frac}` : frac;

    return `${pct}`;
}

function getAnimeTitle(char) {
    if (titleLang === "EN") return char.animeEnglish    || char.animeRomaji     || "Unknown Series";
    else                    return char.animeRomaji     || char.animeEnglish    || "Unknown Series";
}

function updateStarsUI() {
    const isGuest = !currentUser;
    document.getElementById("star-count").textContent = isGuest ? "∞" : stars.toLocaleString();

    const todayJst      = activeDailyJstDate || getCurrentJstDate();
    const dailyStarsBtn = document.getElementById("daily-stars-btn");
    const canClaimStars = Boolean(currentUser) && lastDailyStarsDate !== todayJst;

    dailyStarsBtn.classList.toggle("hidden", !canClaimStars);

    const hasFreeStandard = isGuest || (Boolean(currentUser) && lastFreeSummonDate !== todayJst);
    const pullStandardBtn = document.getElementById("pull-10");

    pullStandardBtn.textContent = hasFreeStandard ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS.STANDARD}`;
    pullStandardBtn.disabled    = actionInFlight || !databaseReady || (!isGuest && !hasFreeStandard && stars < SUMMON_COSTS.STANDARD);

    const pullHofBtn        = document.getElementById("pull-hof-10");
    pullHofBtn.textContent  = isGuest ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS.HOF}`;
    pullHofBtn.disabled     = actionInFlight || !databaseReady || (!isGuest && stars < SUMMON_COSTS.HOF);

    const pullListBtn = document.getElementById("pull-list-10");

    if (pullListBtn) {
        pullListBtn.textContent = isGuest ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS.LIST}`;
        pullListBtn.disabled    = actionInFlight || !databaseReady || !anilistUsername || (!isGuest && stars < SUMMON_COSTS.LIST);
    }

    ALL_THEMED_KEYS.forEach(key => {
        const banner    = THEMED_BANNERS[key];
        const btn       = document.getElementById(banner.buttonElId);
        btn.textContent = isGuest ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS[key]}`;
        btn.disabled    = actionInFlight || !databaseReady || !banner.active || (!isGuest && stars < SUMMON_COSTS[key]);
    });
}

const tableColgroup = document.getElementById("rates-table-colgroup");
const tableHead     = document.getElementById("rates-table-head");
const poolRow       = document.getElementById("rates-row-pool");
const spawnRow      = document.getElementById("rates-row-spawn");
const sparkRow      = document.getElementById("rates-row-spark");
const sellRow       = document.getElementById("rates-row-sell");

RARITIES.forEach(r => {
    const col = document.createElement("col");
    tableColgroup.appendChild(col);

    const th        = document.createElement("th");
    th.className    = `py-1 px-0.5 font-bold !border-0 ${r.badge}`;
    th.textContent  = r.tier;

    tableHead.appendChild(th);

    const tdPool        = document.createElement("td");
    tdPool.className    = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdPool.textContent  = formatPercent(r.dist);

    poolRow.appendChild(tdPool);

    const tdSpawn       = document.createElement("td");
    tdSpawn.className   = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdSpawn.textContent = formatPercent(r.spawn);

    spawnRow.appendChild(tdSpawn);

    const tdSpark       = document.createElement("td");
    tdSpark.className   = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdSpark.textContent = r.sparkCost >= 1000 ? `${r.sparkCost / 1000}K` : r.sparkCost;

    sparkRow.appendChild(tdSpark);

    const tdSell        = document.createElement("td");
    tdSell.className    = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdSell.textContent  = r.sellValue;

    sellRow.appendChild(tdSell);
});

function getField(row, candidates) {
    const keys = Object.keys(row);

    for (const c of candidates) {
        const match = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());

        if (match && row[match] !== undefined && row[match] !== null) {
            const val = String(row[match]).trim();
            if (val !== "" && val.toLowerCase() !== "null" && val.toLowerCase() !== "none" && val.toLowerCase() !== "nan") return val;
        }
    }

    return null;
}

function parseAnimeDate(row) {
    const rawDate = getField(row, ["start_date", "release_date", "aired", "date", "premiered", "year", "start_year", "season_year"]);
    if (!rawDate) return null;

    if (/^\d{8}$/.test(rawDate)) {
        const y = Number(rawDate.slice(0, 4));
        const m = Math.min(Math.max(Number(rawDate.slice(4, 6)), 1), 99) - 1;
        const d = Math.min(Math.max(Number(rawDate.slice(6, 8)), 1), 99);

        return new Date(y, m, d).getTime();
    }

    if (/^\d{4}$/.test(rawDate)) return new Date(Number(rawDate), 0, 1).getTime();

    const parsed = Date.parse(rawDate);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseRawDateInt(row) {
    const rawDate = getField(row, ["start_date", "release_date", "aired", "date", "premiered", "year", "start_year", "season_year"]);
    if (!rawDate) return null;

    const digits = rawDate.replace(/\D/g, "");

    if (digits.length >=    8) return Number(digits.slice(0, 8));
    if (digits.length ===   4) return Number(`${digits}9999`);

    return null;
}

function parseCSVList(rawVal) {
    if (!rawVal) return [];
    return String(rawVal).split(",").map(s => s.trim()).filter(Boolean);
}

function normalizeId(val) {
    if (!val) return null;
    const str = String(val).trim().replace(/\.0+$/, "");
    return str === "" ? null : str;
}

function resolveRootAnime(animeId, animeMap) {
    if (!animeId) return null;

    let currId      = animeId;
    const visited   = new Set();

    while (currId && !visited.has(currId)) {
        visited.add(currId);

        const node = animeMap.get(currId);
        if (!node) break;

        if (node.rootId && animeMap.has(node.rootId)) {
            currId = node.rootId;
            continue;
        }

        if (node.parentId && animeMap.has(node.parentId)) {
            currId = node.parentId;
            continue;
        }

        break;
    }

    return animeMap.get(currId) || animeMap.get(animeId) || null;
}

function getMinSparkCost(bannerKey) {
    if (!databaseReady || characterPool.length === 0) return Infinity;

    if (bannerKey === "STANDARD" || bannerKey === "HOF") {
        let minCost = Infinity;

        for (const char of characterPool) {
            if ((inventory[char.uniqueKey] || 0) < 6 && char.rarity.sparkCost < minCost) {
                minCost = char.rarity.sparkCost;
                if (minCost === 10) break;
            }
        }

        return minCost;
    }

    if (bannerKey === "LIST") {
        if (!anilistUsername || anilistEligibleKeys.size === 0) return Infinity;
        let minCost = Infinity;

        for (const key of anilistEligibleKeys) {
            if ((inventory[key] || 0) >= 6) continue;

            const char = characterMap.get(key);
            if (char && char.rarity.sparkCost < minCost) minCost = char.rarity.sparkCost;
        }

        return minCost;
    }

    const themed = THEMED_BANNERS[bannerKey];
    if (!themed || !themed.active || !themed.active.eligibleKeys || themed.active.eligibleKeys.size === 0) return Infinity;

    let minCost = Infinity;

    for (const key of themed.active.eligibleKeys) {
        if ((inventory[key] || 0) >= 6) continue;

        const char = characterMap.get(key);
        if (char && char.rarity.sparkCost < minCost) minCost = char.rarity.sparkCost;
    }

    return minCost;
}

function updateSparkButtonsUI() {
    document.getElementById("spark-count-standard").textContent = sparkPoints.STANDARD.toLocaleString();
    document.getElementById("spark-standard").disabled          = actionInFlight || !databaseReady || sparkPoints.STANDARD < getMinSparkCost("STANDARD");
    document.getElementById("spark-count-hof").textContent      = sparkPoints.HOF.toLocaleString();
    document.getElementById("spark-hof").disabled               = actionInFlight || !databaseReady || sparkPoints.HOF < getMinSparkCost("HOF");

    const sparkListCountEl  = document.getElementById("spark-count-list");
    const sparkListBtnEl    = document.getElementById("spark-list");

    if (sparkListCountEl && sparkListBtnEl) {
        sparkListCountEl.textContent    = (sparkPoints.LIST || 0).toLocaleString();
        sparkListBtnEl.disabled         = actionInFlight || !databaseReady || !anilistUsername || (sparkPoints.LIST || 0) < getMinSparkCost("LIST");
    }

    ALL_THEMED_KEYS.forEach(key => {
        const banner = THEMED_BANNERS[key];

        document.getElementById(banner.sparkCountElId)  .textContent    = sparkPoints.THEMED.toLocaleString();
        document.getElementById(banner.sparkBtnElId)    .disabled       = actionInFlight || !databaseReady || !banner.active || sparkPoints.THEMED < getMinSparkCost(key);
    });
}

function getSparkIndicatorText(bannerKey) {
    if (bannerKey === "STANDARD")   return "Standard Spark";
    if (bannerKey === "HOF")        return "Premium Spark";
    if (bannerKey === "LIST")       return `${anilistUsername || "List"} Spark`;

    const themed = THEMED_BANNERS[bannerKey];
    return themed && themed.active ? `${themed.active.title} Spark` : `${bannerKey} Spark`;
}

function isCharacterEligibleForBanner(char, bannerKey) {
    if (!bannerKey)                                         return false;
    if (bannerKey === "STANDARD" || bannerKey === "HOF")    return true;
    if (bannerKey === "LIST")                               return Boolean(anilistUsername && anilistEligibleKeys.has(char.uniqueKey));

    const themed = THEMED_BANNERS[bannerKey];
    if (!themed || !themed.active || !themed.active.eligibleKeys) return false;

    return themed.active.eligibleKeys.has(char.uniqueKey);
}

const isCharacterSparkableInBanner = isCharacterEligibleForBanner;

function getBannerFiftyFiftyKey(bannerKey) {
    const todayJst = activeDailyJstDate || getCurrentJstDate();
    let key = null;

    if (ALL_THEMED_KEYS.includes(bannerKey)) {
        const themedSelection = fiftyFifty.THEMED?.[bannerKey];
        if (themedSelection?.date === todayJst) key = themedSelection.uniqueKey;
    } else                                      key = fiftyFifty[bannerKey] || null;

    if (!key) return null;
    if ((inventory[key] || 0) >= 6) return null;

    return key;
}

function updateFiftyFiftyButtonsUI() {
    const setBtnState = (btnId, labelId, bannerKey, enabled) => {
        const btn       = document.getElementById(btnId);
        const labelEl   = document.getElementById(labelId);

        if (!btn || !labelEl) return;

        const key   = getBannerFiftyFiftyKey(bannerKey);
        const char  = key ? characterMap.get(key) : null;

        labelEl.textContent = char ? char.name : "None";
        btn.disabled = actionInFlight || !databaseReady || !enabled;

        if (char) {
            btn.setAttribute("data-tooltip-title",  `50/50: ${char.name}`);
            btn.setAttribute("data-tooltip",        `50% summon chance from their tier`);
        } else {
            btn.setAttribute("data-tooltip-title",  "50/50 Selection");
            btn.setAttribute("data-tooltip",        "Select a non-maxed S+ character for a 50% summon chance from their tier");
        }
    };

    setBtnState("fifty-standard",   "fifty-label-standard", "STANDARD", true);
    setBtnState("fifty-hof",        "fifty-label-hof",      "HOF",      true);
    setBtnState("fifty-list",       "fifty-label-list",     "LIST",     Boolean(anilistUsername));

    ALL_THEMED_KEYS.forEach(key => {
        const banner = THEMED_BANNERS[key];
        setBtnState(banner.fiftyBtnElId, banner.fiftyLabelElId, key, Boolean(banner.active));
    });
}

function getFiftyFiftyIndicatorText(bannerKey) {
    if (bannerKey === "STANDARD")   return "Standard 50/50";
    if (bannerKey === "HOF")        return "Premium 50/50";
    if (bannerKey === "LIST")       return `${anilistUsername || "List"} 50/50`;

    const themed = THEMED_BANNERS[bannerKey];
    return themed && themed.active ? `${themed.active.title} 50/50` : `${bannerKey} 50/50`;
}

function enterSparkMode(bannerKey) {
    if (activeFiftyFiftyBanner) exitFiftyFiftyMode(false);

    hideResultsSection();
    activeSparkBanner = bannerKey;

    setSortControlState     ("CHARACTER", "POPULARITY", "DESC");
    clearFilterCheckboxes   (["#filter-rarity-group", "#filter-own-group", "#filter-lock-group", "#filter-list-group"]);

    document.getElementById("sell-all-btn")         .classList.add      ("hidden");
    document.getElementById("filter-lock-section")  .classList.add      ("hidden");

    const sortWrapper = document.getElementById("sort-filter-wrapper");

    sortWrapper?.classList.remove   ("col-span-2");
    sortWrapper?.classList.add      ("col-span-1");

    const indicator     = document.getElementById("spark-mode-indicator");
    const label         = document.getElementById("spark-mode-label");
    label.textContent   = getSparkIndicatorText(bannerKey);

    indicator.classList.remove("hidden");
    currentPage = 1;
    renderInventory();
    document.getElementById("inventory-grid").scrollIntoView({behavior: "smooth", block: "nearest"});
}

function exitSparkMode(shouldRender = true) {
    activeSparkBanner = null;

    document.getElementById("filter-own-section")   .classList.toggle   ("hidden", isSharedView);
    document.getElementById("filter-lock-section")  .classList.remove   ("hidden");
    document.getElementById("spark-mode-indicator") .classList.add      ("hidden");

    if (!isSharedView) document.querySelectorAll('#filter-own-group input[type="checkbox"]').forEach(cb => {cb.checked = cb.value === "OWNED"})

    if (shouldRender) {
        currentPage = 1;
        renderInventory();
    }
}

function enterFiftyFiftyMode(bannerKey) {
    if (activeSparkBanner) exitSparkMode(false);

    if (!activeFiftyFiftyBanner) preFiftyFiftyViewState = {
        entity  : document.getElementById("sort-entity")?.value || "CHARACTER",
        field   : document.getElementById("sort-field")?.value || "RARITY",
        dir     : document.getElementById("sort-dir-btn")?.dataset.dir || "DESC",
        rarity  : getCheckedValues("#filter-rarity-group"),
        own     : getCheckedValues("#filter-own-group"),
        lock    : getCheckedValues("#filter-lock-group"),
        list    : getCheckedValues("#filter-list-group"),
        search  : document.getElementById("search-input")?.value || "",
        page    : currentPage
    };

    hideResultsSection();
    activeFiftyFiftyBanner = bannerKey;

    setSortControlState     ("CHARACTER", "RARITY", "DESC");
    clearFilterCheckboxes   (["#filter-rarity-group", "#filter-own-group", "#filter-lock-group", "#filter-list-group"]);

    document.querySelectorAll('#filter-rarity-group input[type="checkbox"]').forEach(cb => {cb.closest("label")?.classList.toggle("hidden", !FIFTY_FIFTY_TIERS.has(cb.value))});

    document.getElementById("sell-all-btn")         .classList.add("hidden");
    document.getElementById("filter-lock-section")  .classList.add("hidden");

    const sortWrapper = document.getElementById("sort-filter-wrapper");

    sortWrapper?.classList.remove   ("col-span-2");
    sortWrapper?.classList.add      ("col-span-1");

    const indicator     = document.getElementById("fifty-mode-indicator");
    const label         = document.getElementById("fifty-mode-label");
    label.textContent   = getFiftyFiftyIndicatorText(bannerKey);

    indicator.classList.remove("hidden");
    currentPage = 1;
    renderInventory();
    document.getElementById("inventory-grid").scrollIntoView({behavior: "smooth", block: "nearest"});
}

function exitFiftyFiftyMode(shouldRender = true) {
    activeFiftyFiftyBanner = null;
    document.querySelectorAll('#filter-rarity-group input[type="checkbox"]').forEach(cb => {cb.closest("label")?.classList.remove("hidden")});

    document.getElementById("filter-own-section")   .classList.toggle   ("hidden", isSharedView);
    document.getElementById("filter-lock-section")  .classList.remove   ("hidden");
    document.getElementById("fifty-mode-indicator") .classList.add      ("hidden");

    const saved             = preFiftyFiftyViewState;
    preFiftyFiftyViewState  = null;

    if (saved) {
        setSortControlState(saved.entity, saved.field, saved.dir);
        const restoreCheckboxes = (selector, values) => {document.querySelectorAll(`${selector} input[type="checkbox"]`).forEach(cb => {cb.checked = values.has(cb.value)})};

        restoreCheckboxes("#filter-rarity-group",   saved.rarity);
        restoreCheckboxes("#filter-own-group",      saved.own);
        restoreCheckboxes("#filter-lock-group",     saved.lock);
        restoreCheckboxes("#filter-list-group",     saved.list);

        const searchEl = document.getElementById("search-input");
        const clearBtn = document.getElementById("clear-search");

        if (searchEl) {
            searchEl.value = saved.search;
            clearBtn?.classList.toggle("hidden", saved.search === "");
        }
    }

    if (shouldRender) {
        currentPage = saved ? saved.page : 1;
        renderInventory();
    }
}

async function selectFiftyFiftyCharacter(uniqueKey) {
    if (!activeFiftyFiftyBanner || actionInFlight) return;

    const bannerKey         = activeFiftyFiftyBanner;
    const currentKey        = getBannerFiftyFiftyKey(bannerKey);
    const nextKey           = currentKey === uniqueKey ? null : uniqueKey;
    const previousSelection = structuredClone(fiftyFifty);

    if (ALL_THEMED_KEYS.includes(bannerKey)) {
        if (!fiftyFifty.THEMED) fiftyFifty.THEMED = {};
        if (nextKey)            fiftyFifty.THEMED[bannerKey] = {date: activeDailyJstDate || getCurrentJstDate(), uniqueKey: nextKey};
        else                    delete fiftyFifty.THEMED[bannerKey];
    } else                      fiftyFifty[bannerKey] = nextKey;

    updateFiftyFiftyButtonsUI   ();
    exitFiftyFiftyMode          ();

    const result = await sendGachaAction({
        action      : "SET_FIFTY_FIFTY",
        bannerType  : bannerKey,
        uniqueKey   : nextKey
    });

    if (!result) {
        fiftyFifty = previousSelection;

        updateFiftyFiftyButtonsUI   ();
        renderInventory             ();
    }
}

function updateSellAllUI() {
    let totalValue = 0;

    for (const [key, ownedCount] of Object.entries(inventory)) {
        if (ownedCount > 0 && !lockedCards.has(key)) {
            const char = characterMap.get(key);
            if (char) totalValue += char.rarity.sellValue * getSellMultiplier(ownedCount);
        }
    }

    const sellAllBtn    = document.getElementById("sell-all-btn");
    const sortWrapper   = document.getElementById("sort-filter-wrapper");
    const inSelectMode  = activeSparkBanner !== null || activeFiftyFiftyBanner !== null;
    const shouldHide    = isSharedView || inSelectMode || totalValue <= 0;
    const isFullWidth   = shouldHide && !inSelectMode;

    document.getElementById("sell-all-amount").textContent  = totalValue.toLocaleString();
    sellAllBtn.disabled                                     = sellInFlight || totalValue <= 0;

    sellAllBtn.     classList.toggle("hidden",      shouldHide);
    sortWrapper?.   classList.toggle("col-span-2",  isFullWidth);
    sortWrapper?.   classList.toggle("col-span-1",  !isFullWidth);
}

async function sparkCharacter(uniqueKey) {
    if (!activeSparkBanner) return;

    const res = await sendGachaAction({action: "SPARK", bannerType: activeSparkBanner, uniqueKey});
    if (res && activeSparkBanner) exitSparkMode();
}

function getSellMultiplier(ownedCount) {
    if (ownedCount >=   6) return 4;
    if (ownedCount >=   3) return 3;
    if (ownedCount ===  2) return 2;

    return 1;
}

async function toggleCardLock(uniqueKey) {
    if (!inventory[uniqueKey] || lockInFlight) return;

    lockInFlight = true;
    updateLockButtonsUI();

    try {
        if (!currentUser) {
            await sendGachaAction({action: "TOGGLE_LOCK", uniqueKey});
            if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) renderResults(lastResults, false, lastBannerType);
            return;
        }

        if (lockedCards.has(uniqueKey)) lockedCards.delete(uniqueKey);
        else                            lockedCards.add(uniqueKey);

        renderInventory();
        if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) renderResults(lastResults, false, lastBannerType);

        await sendGachaAction({ action: "TOGGLE_LOCK", uniqueKey });
        if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) renderResults(lastResults, false, lastBannerType);
    } finally {
        lockInFlight = false;
        updateLockButtonsUI();
    }
}

async function sellCharacter(uniqueKey) {
    const count = inventory[uniqueKey] || 0;
    const char  = characterMap.get(uniqueKey);

    if (!char || count <= 0 || lockedCards.has(uniqueKey) || sellInFlight) return;

    sellInFlight = true;
    updateSellButtonsUI();

    try {
        if (!currentUser) {
            await sendGachaAction({action: "SELL", uniqueKey});
            return;
        }

        stars += char.rarity.sellValue * getSellMultiplier(count);
        delete inventory[uniqueKey];

        updateStarsUI   ();
        renderInventory ();

        await sendGachaAction({action: "SELL", uniqueKey});
    } finally {
        sellInFlight = false;
        updateSellButtonsUI();
    }
}

async function sellAllUnlocked() {
    if (sellInFlight) return;

    hideResultsSection();
    sellInFlight = true;
    updateSellButtonsUI();

    try {await sendGachaAction({action: "SELL_ALL"})} finally {
        sellInFlight = false;
        updateSellButtonsUI();
    }
}