async function performSummon(_, bannerType = "STANDARD") {
    const nowJstDate = new Intl.DateTimeFormat("en-CA", {
        timeZone    : "Asia/Tokyo",
        year        : "numeric",
        month       : "2-digit",
        day         : "2-digit"
    }).format(new Date());

    if (activeDailyJstDate && nowJstDate !== activeDailyJstDate) {
        if (currentUser)    await sendGachaAction({action: "INIT"});
        else                applyDailyBanners(getClientDailyBanners());

        alert("Daily banners rotates at midnight JST; review today's banners before summoning");
        return;
    }

    const res = await sendGachaAction({action: "SUMMON", bannerType});
    if (!res) return;

    if (activeSparkBanner)      exitSparkMode       ();
    if (activeFiftyFiftyBanner) exitFiftyFiftyMode  ();

    if (!isSharedView) {
        document.querySelectorAll('#filter-own-group input[type="checkbox"]').forEach(cb => {cb.checked = cb.value === "OWNED"});
        currentPage = 1;
        renderInventory();
    }

    const results = res.rolledResults.map(r => ({
        char            : characterMap.get(r.uniqueKey),
        occurrenceCount : r.occurrenceCount,
        autoSoldStars   : r.autoSoldStars || 0
    }));

    lastResults     = results;
    lastBannerType  = bannerType;

    renderResults(results, true, bannerType);
}

function createCardHTML(char, {
    duplicateCount  = null,
    animateDelay    = 0,
    extraClass      = "",
    showSparkButton = false,
    canAffordSpark  = false,
    showFiftyButton = false,
    isFiftySelected = false,
    showSellButton  = false,
    autoSoldStars   = 0
} = {}) {
    const r             = char.rarity;
    const safeName      = escapeHTML(char.name);
    const safeAnime     = escapeHTML(getAnimeTitle(char));
    const fullTooltip   = `${safeName}\n${safeAnime}`;
    const listPrefix    = isListCharacter(char) ? "L" : "";
    const dupLevel      = duplicateCount >= 6 ? "3" : duplicateCount >= 3 ? "2" : duplicateCount === 2 ? "1" : "";

    const imgHtml = char.imageUrl
        ? `<img src="${char.imageUrl}" alt="${safeName}" loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            class="w-full h-full object-cover object-top" />
        <div style="display:none" class="w-full h-full bg-slate-200 dark:bg-slate-800 items-center justify-center text-slate-500 dark:text-slate-400 p-2 text-center">
            <span class="text-base sm:text-lg font-bold leading-[1.05]">No<br>Image</span>
        </div>`
        : `<div class="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 p-2 text-center">
            <span class="text-base sm:text-lg font-bold leading-[1.05]">No<br>Image</span>
        </div>`;

    const sparkFooterHtml = showSparkButton
        ? `<div class="px-1.5 pb-1.5">
            <button type="button" data-spark-key="${escapeHTML(char.uniqueKey)}" ${canAffordSpark ? "" : "disabled"}
                class="spark-card-btn w-full py-1 rounded text-[11px] font-bold bg-slate-950/80 hover:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed text-white transition">
                Spark: ${r.sparkCost}
            </button>
        </div>`
        : "";

    const fiftyFooterHtml = showFiftyButton
        ? `<div class="px-1.5 pb-1.5">
            <button type="button" data-fifty-key="${escapeHTML(char.uniqueKey)}"
                class="fifty-card-btn w-full py-1 rounded text-[11px] font-bold ${isFiftySelected ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-slate-950/80 hover:bg-slate-950 text-white"} transition">
                ${isFiftySelected ? "Selected" : "Select"}
            </button>
        </div>`
        : "";

    const isOwned   = Boolean(inventory[char.uniqueKey]);
    const isLocked  = isOwned && lockedCards.has(char.uniqueKey);
    const sellTotal = r.sellValue * getSellMultiplier(duplicateCount || 1);

    const lockBadgeHtml = (isOwned && !isSharedView)
        ? `<button type="button" data-lock-key="${escapeHTML(char.uniqueKey)}" ${lockInFlight ? "disabled" : ""}
            title="${isLocked ? "Unlock" : "Lock"}"
            aria-label="${isLocked ? "Unlock" : "Lock"}"
            class="lock-card-btn absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded ${r.badge} disabled:opacity-40 disabled:cursor-not-allowed transition">
            ${isLocked
                ? `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                   </svg>`
                : `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                   </svg>`}
           </button>`
        : "";

    const sellBtnColors = r.tier === "F"
        ? "bg-white hover:bg-slate-200 text-black"
        : "bg-slate-950/80 hover:bg-slate-950 text-white";

    const sellFooterHtml = showSellButton
        ? `<div class="px-1.5 pb-1.5">
            <button type="button" data-sell-key="${escapeHTML(char.uniqueKey)}" ${(sellInFlight || isLocked) ? "disabled" : ""}
                class="sell-card-btn w-full py-1 rounded text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition ${sellBtnColors}">
                Sell: ★ ${sellTotal}
            </button>
        </div>`
        : "";

    const autoSoldFooterHtml = autoSoldStars > 0
        ? `<div class="px-1.5 pb-1.5">
            <div title="Already maxed (Level 3) — automatically sold for ★ ${autoSoldStars}"
                class="w-full py-1 rounded text-[11px] font-bold text-center ${sellBtnColors}">
                Sold: ★ ${autoSoldStars}
            </div>
        </div>`
        : "";

    return `
        <div title="${fullTooltip}" style="animation-delay: ${animateDelay}ms"
            class="${extraClass} ${animateDelay ? 'card-animate opacity-0' : ''} rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${r.border} flex flex-col transition hover:-translate-y-0.5">
        <div class="${r.badge} !border-0 overflow-hidden flex flex-col h-full">
            <div class="relative aspect-[3/4] w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            ${imgHtml}
            <span data-tooltip-title="${[
                    listPrefix ? "AniList" : null,
                    r.tier,
                    dupLevel ? `Level ${dupLevel}` : null
                ].filter(Boolean).join(" • ")}"
                title="${[
                    listPrefix ? "From your AniList" : null,
                    duplicateCount > 1 ? `${duplicateCount - 1} extra ${duplicateCount - 1 === 1 ? "copy" : "copies"}` : "Base copy"
                ].filter(Boolean).join("\n")}"
                class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-help ${r.badge}">
                ${listPrefix}${r.tier}${dupLevel}
            </span>
            ${lockBadgeHtml}
            </div>
            <div class="p-1 flex-1 flex flex-col justify-center text-center gap-0.5">
            <div class="font-bold text-xs leading-tight line-clamp-1">
                ${safeName}
            </div>
            <div class="text-[10px] leading-tight line-clamp-1">
                ${safeAnime}
            </div>
            </div>
            ${sparkFooterHtml}
            ${fiftyFooterHtml}
            ${sellFooterHtml}
            ${autoSoldFooterHtml}
        </div>
        </div>
    `;
}

function hideResultsSection() {document.getElementById("results-section")?.classList.add("hidden")}

function renderResults(results, animate = false, bannerType = lastBannerType) {
    const section           = document.getElementById("results-section");
    const grid              = document.getElementById("results-grid");
    const isThemedBanner    = Boolean(THEMED_BANNERS[bannerType]);

    const sortBatchByRarity = (batch) => batch.slice().sort((a, b) => compareHighestRarity(a.char, b.char) || popularityTiebreaker(a.char, b.char));

    const displayResults = results.length > 1
        ? isThemedBanner
            ? [results[0], ...sortBatchByRarity(results.slice(1, 5)), ...sortBatchByRarity(results.slice(5))]
            : [results[0], ...sortBatchByRarity(results.slice(1))]
        : results;

    const cardWidthClass = isThemedBanner
        ? "w-[calc((100%-1rem)/3)] sm:w-[calc((100%-3.0625rem)/5)] lg:w-[calc((100%-5.625rem)/10)]"
        : "w-[calc((100%-1rem)/3)] sm:w-[calc((100%-3.0625rem)/5)] lg:w-[calc((100%-5.0625rem)/10)]";

    const separatorHTML = `<div aria-hidden="true" class="hidden sm:block w-px self-stretch bg-slate-300 dark:bg-slate-700 shrink-0"></div>`;
    section.classList.remove("hidden");

    grid.innerHTML = displayResults.map((res, idx) => {
        const cardHTML = createCardHTML(res.char, {
            duplicateCount  : res.occurrenceCount > 1 ? res.occurrenceCount : null,
            animateDelay    : animate ? idx * 60 : 0,
            extraClass      : `${cardWidthClass} shrink-0`,
            autoSoldStars   : res.autoSoldStars || 0
        });

        if (idx === 0) return `<div class="w-full flex justify-center sm:contents">${cardHTML}</div>${separatorHTML}`;

        const needsSeparatorAfter = isThemedBanner && idx === 4;
        return needsSeparatorAfter ? `${cardHTML}${separatorHTML}` : cardHTML;
    }).join("");
}

function getCharacterLevel(ownedCount) {
    if (ownedCount >=   6) return 3;
    if (ownedCount >=   3) return 2;
    if (ownedCount ===  2) return 1;

    return 0;
}

const RARITY_ORDER = new Map(RARITIES.map((r, idx) => [r.tier, idx]));

function compareHighestRarity(a, b) {return (RARITY_ORDER.get(a.rarity.tier) ?? 99) - (RARITY_ORDER.get(b.rarity.tier) ?? 99);}
function popularityTiebreaker(a, b) {return (b.count - a.count) || compareHighestRarity(a, b) || (b.animeCount - a.animeCount)}

function sortCharacters(list, sortMode) {return list.slice().sort((a, b) => {switch (sortMode) {
    case "RARITY_ASC"       : return -compareHighestRarity(a, b)    ||  popularityTiebreaker(a, b);
    case "CHAR_COUNT_DESC"  : return                                    popularityTiebreaker(a, b);
    case "CHAR_COUNT_ASC"   : return (a.count - b.count)            ||  popularityTiebreaker(a, b);

    case "LEVEL_DESC": {
        const diff = getCharacterLevel(inventory[b.uniqueKey] || 0) - getCharacterLevel(inventory[a.uniqueKey] || 0);
        return diff || popularityTiebreaker(a, b);
    }

    case "LEVEL_ASC": {
        const diff = getCharacterLevel(inventory[a.uniqueKey] || 0) - getCharacterLevel(inventory[b.uniqueKey] || 0);
        return diff || popularityTiebreaker(a, b);
    }

    case "ANIME_COUNT_DESC" : return (b.animeCount - a.animeCount)                      || popularityTiebreaker(a, b);
    case "ANIME_COUNT_ASC"  : return (a.animeCount - b.animeCount)                      || popularityTiebreaker(a, b);
    case "CHAR_AZ"          : return a.name.localeCompare(b.name)                       || popularityTiebreaker(a, b);
    case "CHAR_ZA"          : return b.name.localeCompare(a.name)                       || popularityTiebreaker(a, b);
    case "ANIME_AZ"         : return getAnimeTitle(a).localeCompare(getAnimeTitle(b))   || popularityTiebreaker(a, b);
    case "ANIME_ZA"         : return getAnimeTitle(b).localeCompare(getAnimeTitle(a))   || popularityTiebreaker(a, b);

    case "DATE_NEW":
        if (a.animeDate === null && b.animeDate === null)   return popularityTiebreaker(a, b);
        if (a.animeDate === null)                           return 1;
        if (b.animeDate === null)                           return -1;

        return (b.animeDate - a.animeDate) || popularityTiebreaker(a, b);

    case "DATE_OLD":
        if (a.animeDate === null && b.animeDate === null)   return popularityTiebreaker(a, b);
        if (a.animeDate === null)                           return 1;
        if (b.animeDate === null)                           return -1;

        return (a.animeDate - b.animeDate) || popularityTiebreaker(a, b);
    case "RARITY_DESC"  : return compareHighestRarity(a, b) || popularityTiebreaker(a, b);
    default             : return compareHighestRarity(a, b) || popularityTiebreaker(a, b);
}})}

function parseSearchQuery(rawQuery) {
    const tokens    = [];
    const regex     = /([a-zA-Z_]+)\s*(:|>=|<=|>|<|=)\s*(?:"([^"]*)"|'([^']*)'|(\S+))|"([^"]*)"|'([^']*)'|(\S+)/g;

    let match;

    while ((match = regex.exec(rawQuery)) !== null) {
        if (match[1]) {
            const field = match[1].toLowerCase();
            const op    = match[2];
            const val   = (match[3] ?? match[4] ?? match[5] ?? "").toLowerCase().trim();

            if (val !== "") tokens.push({field, op, val});
        } else {
            const term = (match[6] ?? match[7] ?? match[8] ?? "").toLowerCase().trim();
            if (term !== "") tokens.push({ field: null, op: ":", val: term });
        }
    }

    return tokens;
}

function compareNumeric(actual, op, target) {
    if (actual === null || actual === undefined || Number.isNaN(actual)) return false;

    switch (op) {
        case ">"    : return actual >   target;
        case ">="   : return actual >=  target;
        case "<"    : return actual <   target;
        case "<="   : return actual <=  target;
        case "="    : return actual === target;
        case ":"    : return actual === target;
        default     : return false;
    }
}

function matchesSearchTokens(char, tokens) {
    if (tokens.length === 0) return true;

    for (const tok of tokens) {
        const {field, op, val} = tok;

        if (!field) {
            const nameMatch     = char.name                                 .toLowerCase().includes(val);
            const romajiMatch   = char.animeRomaji  && char.animeRomaji     .toLowerCase().includes(val);
            const englishMatch  = char.animeEnglish && char.animeEnglish    .toLowerCase().includes(val);

            if (!nameMatch && !romajiMatch && !englishMatch) return false;
            continue;
        }

        if      (field === "character"  || field === "char"     || field === "name") if (!char.name.toLowerCase().includes(val)) return false;
        else if (field === "anime"      || field === "series"   || field === "title") {
            const numVal                = Number(val);
            const isNumericComparison   = (op === ">" || op === ">=" || op === "<" || op === "<=" || op === "=") && !Number.isNaN(numVal);

            if (isNumericComparison || (/^\d{4}$/.test(val) && op !== ":")) if (!compareNumeric(char.animeYear, op, numVal)) return false;
            else {
                const romajiMatch  = char.animeRomaji   && char.animeRomaji     .toLowerCase().includes(val);
                const englishMatch = char.animeEnglish  && char.animeEnglish    .toLowerCase().includes(val);

                if (!romajiMatch && !englishMatch) return false;
            }
        } else if (field === "year" || field === "era") {
            const numVal = Number(val);

            if (Number.isNaN(numVal))                           return false;
            if (!compareNumeric(char.animeYear, op, numVal))    return false;
        } else if (field === "genre" || field === "genres") {
            let found = false;
            for (const g of char.genres) {if (g.toLowerCase().includes(val)) {found = true; break}}
            if (!found) return false;
        } else if (field === "tag" || field === "tags") {
            let found = false;
            for (const t of char.tags) {if (t.toLowerCase().includes(val)) {found = true; break}}
            if (!found) return false;
        } else if (field === "studio" || field === "studios") {
            let found = false;
            for (const s of char.studios) {if (s.toLowerCase().includes(val)) {found = true; break}}
            if (!found) return false;
        } else if (field === "source") {
            if (!char.source || !char.source.toLowerCase().includes(val)) return false;
        } else if (field === "tier" || field === "rarity") {
            if (char.rarity.tier.toLowerCase() !== val) return false;
        } else if (field === "spark" || field === "cost") {
            const numVal = Number(val);

            if (Number.isNaN(numVal))                               return false;
            if (!compareNumeric(char.rarity.sparkCost, op, numVal)) return false;
        } else if (field === "owned" || field === "count") {
            const ownedCount    = inventory[char.uniqueKey] || 0;
            const numVal        = Number(val);

            if (Number.isNaN(numVal))                       return false;
            if (!compareNumeric(ownedCount, op, numVal))    return false;
        } else if (field === "level" || field === "lvl") {
            const charLevel = getCharacterLevel(inventory[char.uniqueKey] || 0);
            const numVal    = Number(val);

            if (Number.isNaN(numVal))                   return false;
            if (!compareNumeric(charLevel, op, numVal)) return false;
        } else {
            const fallback      = `${field}${op}${val}`;
            const nameMatch     = char.name                                 .toLowerCase().includes(fallback);
            const romajiMatch   = char.animeRomaji  && char.animeRomaji     .toLowerCase().includes(fallback);
            const englishMatch  = char.animeEnglish && char.animeEnglish    .toLowerCase().includes(fallback);

            if (!nameMatch && !romajiMatch && !englishMatch) return false;
        }
    }

    return true;
}

let invCacheSignature   = "";
let invCachedFiltered   = [];
let invStateVersion     = 0;

function invalidateInventoryCache() {
    invStateVersion++;
    invCacheSignature = "";
}

function renderInventory(useCache = false) {
    if (!useCache) invalidateInventoryCache();
    updateSellAllUI();

    const grid          = document.getElementById   ("inventory-grid");
    const paginationEls = document.querySelectorAll (".pagination-controls");

    if (characterPool.length === 0) return;

    const selectedRarities  = getCheckedValues("#filter-rarity-group");
    const selectedOwn       = getCheckedValues("#filter-own-group");
    const selectedLock      = getCheckedValues("#filter-lock-group");
    const selectedList      = getCheckedValues("#filter-list-group");
    const sortMode          = getResolvedSortMode();
    const rawQuery          = document.getElementById("search-input").value.trim();
    const itemsPerPage      = getItemsPerPage();
    const isSparkMode       = activeSparkBanner !== null;
    const isFiftyMode       = activeFiftyFiftyBanner !== null;
    const sparkKey          = isSparkMode && ALL_THEMED_KEYS.includes(activeSparkBanner) ? "THEMED" : activeSparkBanner;
    const availableSpark    = isSparkMode ? sparkPoints[sparkKey] : 0;
    const selectedFiftyKey  = isFiftyMode ? getBannerFiftyFiftyKey(activeFiftyFiftyBanner) : null;
    const isAnilistLinked   = Boolean(anilistUsername);
    const lang              = typeof titleLang !== "undefined" ? titleLang : "JP";

    document.getElementById("filter-own-section")?.     classList.toggle("hidden", isSharedView);
    document.getElementById("filter-list-section")?.    classList.toggle("hidden", !isAnilistLinked);
    document.getElementById("filter-status-row")?.      classList.remove("hidden");

    const cacheSig = [
        invStateVersion,
        characterPool.length,
        isSharedView    ? 1                                                     : 0,
        isSparkMode     ? `${activeSparkBanner}:${availableSpark}`              : "0",
        isFiftyMode     ? `${activeFiftyFiftyBanner}:${selectedFiftyKey || ""}` : "0",
        isAnilistLinked ? anilistUsername                                       : "",
        lang,
        sortMode,
        rawQuery,
        Array.from(selectedRarities)    .sort().join(","),
        Array.from(selectedOwn)         .sort().join(","),
        Array.from(selectedLock)        .sort().join(","),
        Array.from(selectedList)        .sort().join(",")
    ].join("|");

    let filtered;

    if (cacheSig === invCacheSignature) filtered = invCachedFiltered;
    else {
        const searchTokens = parseSearchQuery(rawQuery);

        filtered = characterPool.filter(c => {
            const isOwned   = Boolean(inventory[c.uniqueKey]);
            const isLocked  = isOwned && lockedCards.has(c.uniqueKey);

            if (isSharedView) {
                if (!isOwned) return false;
            } else if (selectedOwn.size > 0) {
                const ownMatch = (selectedOwn.has("OWNED") && isOwned) || (selectedOwn.has("UNOWNED") && !isOwned);
                if (!ownMatch) return false;
            }

            if (isSparkMode) {
                if ((inventory[c.uniqueKey] || 0) >= 6)                         return false;
                if (!isCharacterSparkableInBanner(c, activeSparkBanner))        return false;
                if (availableSpark < c.rarity.sparkCost)                        return false;
            } else if (isFiftyMode) {
                if ((inventory[c.uniqueKey] || 0) >= 6)                         return false;
                if (!FIFTY_FIFTY_TIERS.has(c.rarity.tier))                      return false;
                if (!isCharacterEligibleForBanner(c, activeFiftyFiftyBanner))   return false;
            } else {
                if (selectedLock.size > 0) {
                    const lockMatch = (selectedLock.has("LOCKED") && isLocked) || (selectedLock.has("UNLOCKED") && isOwned && !isLocked);
                    if (!lockMatch) return false;
                }
            }

            if (selectedRarities.size > 0 && !selectedRarities.has(c.rarity.tier)) return false;

            if (isAnilistLinked && selectedList.size > 0) {
                const onList    = isListCharacter(c);
                const listMatch = (selectedList.has("IN_LIST") && onList) || (selectedList.has("NOT_IN_LIST") && !onList);

                if (!listMatch) return false;
            }

            if (!matchesSearchTokens(c, searchTokens)) return false;
            return true;
        });

        if (filtered.length > 0) filtered = sortCharacters(filtered, sortMode);

        invCacheSignature = cacheSig;
        invCachedFiltered = filtered;
    }

    if (filtered.length === 0) {
        const emptyMsg = isSparkMode
            ? "No affordable sparkable characters match the current filter"
            : isFiftyMode
                ? "No eligible S+ characters match the current filter"
                : "No characters match the current filter";

        grid.innerHTML = `<div class="col-span-full text-center py-8 text-slate-500 text-sm">${emptyMsg}</div>`;
        paginationEls.forEach(el => el.classList.add("hidden"));

        return;
    }

    totalPages  = Math.max(1, Math.ceil(filtered.length / itemsPerPage));

    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex    = (currentPage - 1) * itemsPerPage;
    const displaySlice  = filtered.slice(startIndex, startIndex + itemsPerPage);

    grid.innerHTML = displaySlice.map(c => {
        const ownedCount    = inventory[c.uniqueKey] || 0;
        const canAfford     = isSparkMode && availableSpark >= c.rarity.sparkCost;

        const card = createCardHTML(c, {
            duplicateCount  : ownedCount > 1 ? ownedCount : null,
            showSparkButton : isSparkMode   && !isSharedView,
            canAffordSpark  : canAfford,
            showFiftyButton : isFiftyMode   && !isSharedView,
            isFiftySelected : isFiftyMode   && selectedFiftyKey === c.uniqueKey,
            showSellButton  : !isSparkMode  && !isFiftyMode && !isSharedView && ownedCount > 0
        });

        return ownedCount === 0 && !isSparkMode && !isFiftyMode
            ? `<div class="opacity-35 grayscale hover:grayscale-0 hover:opacity-80 transition">${card}</div>`
            : card;
    }).join("");

    if (totalPages > 1) {
        paginationEls.forEach(el => el.classList.remove("hidden"));

        document.querySelectorAll(".page-input")    .forEach(el => {el.value        = currentPage; el.max = totalPages});
        document.querySelectorAll(".total-pages")   .forEach(el => {el.textContent  = totalPages});
        document.querySelectorAll(".first-page")    .forEach(el => {el.disabled     = currentPage <= 1});
        document.querySelectorAll(".prev-page")     .forEach(el => {el.disabled     = currentPage <= 1});
        document.querySelectorAll(".next-page")     .forEach(el => {el.disabled     = currentPage >= totalPages});
        document.querySelectorAll(".last-page")     .forEach(el => {el.disabled     = currentPage >= totalPages});
    } else paginationEls                            .forEach(el => el.classList.add("hidden"));
}

function resetPageAndRender() {
    hideResultsSection();
    currentPage = 1;
    renderInventory();
}