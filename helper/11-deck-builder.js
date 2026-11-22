let draftDeck           = {};
let activeDeckSuit      = "Spades";
let selectedDeckSlot    = null;

function getSanitizedDeck(sourceDeck = playerDeck) {
    const clean     = {};
    const usedKeys  = new Set();

    for (const suit of DECK_SUITS) {
        for (const rank of DECK_RANKS) {
            const slotId    = `${suit}:${rank}`;
            const key       = sourceDeck?.[slotId];

            if (!key || usedKeys.has(key) || !(inventory[key] > 0)) continue;

            const char = characterMap.get(key);
            if (!char || char.deckSuit !== suit || char.deckRank !== rank) continue;

            usedKeys.add(key);
            clean[slotId] = key;
        }
    }

    return clean;
}

function isDeckDirty() {
    const saved = getSanitizedDeck(playerDeck);
    const keysA = Object.keys(saved);
    const keysB = Object.keys(draftDeck);

    if (keysA.length !== keysB.length) return true;
    return keysA.some(slotId => saved[slotId] !== draftDeck[slotId]);
}

const DECK_SUIT_TAB_BG = {
    Spades      : "bg-violet-600 hover:bg-violet-500",
    Hearts      : "bg-indigo-600 hover:bg-indigo-500",
    Diamonds    : "bg-blue-600 hover:bg-blue-500",
    Clubs       : "bg-emerald-600 hover:bg-emerald-500"
};

const DECK_EMPTY_CARD_STYLES = {
    Spades      : {cardBg: "bg-violet-600",     border: "border-2 border-violet-500",   footerBg: "bg-violet-700/80"},
    Hearts      : {cardBg: "bg-indigo-600",     border: "border-2 border-indigo-500",   footerBg: "bg-indigo-700/80"},
    Diamonds    : {cardBg: "bg-blue-600",       border: "border-2 border-blue-500",     footerBg: "bg-blue-700/80"},
    Clubs       : {cardBg: "bg-emerald-600",    border: "border-2 border-emerald-500",  footerBg: "bg-emerald-700/80"}
};

const DECK_PIP_COORDS = {
    "2" : [[50, 30], [50, 70]],
    "3" : [[50, 26], [50, 50], [50, 74]],
    "4" : [[35, 30], [65, 30], [35, 70],    [65, 70]],
    "5" : [[35, 30], [65, 30], [50, 50],    [35, 70], [65, 70]],
    "6" : [[35, 27], [65, 27], [35, 50],    [65, 50], [35, 73], [65, 73]],
    "7" : [[35, 27], [65, 27], [50, 38.5],  [35, 50], [65, 50], [35, 73],   [65, 73]],
    "8" : [[35, 27], [65, 27], [50, 38.5],  [35, 50], [65, 50], [50, 61.5], [35, 73], [65, 73]],
    "9" : [[35, 24], [65, 24], [35, 41],    [65, 41], [50, 50], [35, 59],   [65, 59], [35, 76],     [65, 76]],
    "10": [[35, 24], [65, 24], [50, 32.5],  [35, 41], [65, 41], [35, 59],   [65, 59], [50, 67.5],   [35, 76], [65, 76]]
};

function renderPlayingCardCenter(rank, symbol) {
    if (rank === "A")                                                   return `<span class="text-5xl sm:text-6xl leading-none text-white/95">${symbol}</span>`;
    if (rank === "R" || rank === "K" || rank === "Q" || rank === "J")   return `<span class="text-5xl sm:text-6xl font-extrabold leading-none text-white/95">${rank}</span>`;

    const coords    = DECK_PIP_COORDS[rank] || [[50, 50]];
    const pipSize   = coords.length >= 8 ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl";

    return `
        <div class="relative w-full h-full">
            ${coords.map(([x, y]) => `
                <span style="left:${x}%; top:${y}%"
                    class="absolute -translate-x-1/2 -translate-y-1/2 leading-none text-white/95 ${pipSize} ${y > 50 ? "rotate-180" : ""}">
                    ${symbol}
                </span>
            `).join("")}
        </div>
    `;
}

const SYNERGY_RARITY_POINTS = {
    SSR : 128,
    SR  : 64,
    S   : 32,
    A   : 16,
    B   : 8,
    C   : 4,
    D   : 3,
    E   : 2,
    F   : 1
};

function getCharacterEraKey(char) {
    if (!char || !char.animeYear)   return null;
    if (char.animeYear < 2000)      return "Pre-2000s";
    if (char.animeYear < 2010)      return "2000s";

    const start = Math.floor(char.animeYear / 5) * 5;
    return `${start}-${start + 4}`;
}

function evaluateGroupSynergy(chars, maxSlots, {
    slotBase        = 10,
    fullBonus       = 50,
    franchiseWeight = 24,
    studioWeight    = 14,
    sourceWeight    = 8,
    eraWeight       = 10,
    genreWeight     = 6,
    tagWeight       = 6
} = {}) {
    const filled = chars.length;

    if (filled === 0) return {
        score           : 0,
        filled          : 0,
        maxSlots,
        completionPts   : 0,
        powerPts        : 0,
        franchisePts    : 0,
        studioPts       : 0,
        sourcePts       : 0,
        eraPts          : 0,
        genrePts        : 0,
        tagPts          : 0,
        highlights      : []
    };

    const isFull        = filled === maxSlots;
    const completionPts = filled * slotBase + (isFull ? fullBonus : 0);
    let powerPts        = 0;

    const franchiseCounts   = new Map();
    const studioCounts      = new Map();
    const sourceCounts      = new Map();
    const eraCounts         = new Map();
    const genreCounts       = new Map();
    const tagCounts         = new Map();

    for (const c of chars) {
        const tierPts   = SYNERGY_RARITY_POINTS[c.rarity?.tier]     || 1;
        const level     = getCharacterLevel(inventory[c.uniqueKey]  || 1);

        powerPts += tierPts + level * 4;

        if (c.rootAnimeId) {
            const label = getAnimeTitle(c);
            const prev  = franchiseCounts.get(c.rootAnimeId) || {count: 0, label};

            prev.count++;
            franchiseCounts.set(c.rootAnimeId, prev);
        }

        if (c.source) sourceCounts.set(c.source, (sourceCounts.get(c.source) || 0) + 1);

        const eraKey = getCharacterEraKey(c);
        if (eraKey) eraCounts.set(eraKey, (eraCounts.get(eraKey) || 0) + 1);

        for (const s of c.studios   || []) studioCounts .set(s, (studioCounts   .get(s) || 0) + 1);
        for (const g of c.genres    || []) genreCounts  .set(g, (genreCounts    .get(g) || 0) + 1);
        for (const t of c.tags      || []) tagCounts    .set(t, (tagCounts      .get(t) || 0) + 1);
    }

    const calcPairSum = (countMap, weight, maxItems = Infinity) => {
        const entries = Array.from(countMap.entries())
            .map    (([k, v])   => typeof v === "object" ? {key: k, label: v.label, count: v.count} : {key: k, label: k, count: v})
            .filter (item       => item.count >= 2)
            .sort   ((a, b)     => b.count - a.count);

        let pts = 0;
        entries.slice(0, maxItems).forEach(item => {pts += ((item.count * (item.count - 1)) / 2) * weight});

        return {pts: Math.round(pts), top: entries[0] || null};
    };

    const franchiseRes  = calcPairSum(franchiseCounts,  franchiseWeight);
    const studioRes     = calcPairSum(studioCounts,     studioWeight);
    const sourceRes     = calcPairSum(sourceCounts,     sourceWeight);
    const eraRes        = calcPairSum(eraCounts,        eraWeight);
    const genreRes      = calcPairSum(genreCounts,      genreWeight,    3);
    const tagRes        = calcPairSum(tagCounts,        tagWeight,      3);
    const score         = completionPts + powerPts + franchiseRes.pts + studioRes.pts + sourceRes.pts + eraRes.pts + genreRes.pts + tagRes.pts;

    return {
        score,
        filled,
        maxSlots,
        completionPts,
        powerPts,
        franchisePts    : franchiseRes  .pts,
        studioPts       : studioRes     .pts,
        sourcePts       : sourceRes     .pts,
        eraPts          : eraRes        .pts,
        genrePts        : genreRes      .pts,
        tagPts          : tagRes        .pts
    };
}

function computeDeckSynergies(deckObj = draftDeck, suit = activeDeckSuit, rank = null) {
    const activeRank    = rank || (selectedDeckSlot ? selectedDeckSlot.split(":")[1] : "R");
    const suitChars     = [];
    const rankChars     = [];
    const allChars      = [];

    for (const r of DECK_RANKS) {
        const key   = deckObj[`${suit}:${r}`];
        const c     = key ? characterMap.get(key) : null;

        if (c) suitChars.push(c);
    }

    for (const s of DECK_SUITS) {
        const key   = deckObj[`${s}:${activeRank}`];
        const c     = key ? characterMap.get(key) : null;

        if (c) rankChars.push(c);
    }

    for (const s of DECK_SUITS) {
        for (const r of DECK_RANKS) {
            const key   = deckObj[`${s}:${r}`];
            const c     = key ? characterMap.get(key) : null;

            if (c) allChars.push(c);
        }
    }

    const suitSyn = evaluateGroupSynergy(suitChars, 14, {
        slotBase        : 10,
        fullBonus       : 60,
        franchiseWeight : 26,
        studioWeight    : 15,
        sourceWeight    : 8,
        eraWeight       : 10,
        genreWeight     : 6,
        tagWeight       : 6
    });

    const rankSyn = evaluateGroupSynergy(rankChars, 4, {
        slotBase        : 12,
        fullBonus       : 40,
        franchiseWeight : 36,
        studioWeight    : 22,
        sourceWeight    : 12,
        eraWeight       : 14,
        genreWeight     : 8,
        tagWeight       : 8
    });

    const totalBase = evaluateGroupSynergy(allChars, 56, {
        slotBase        : 8,
        fullBonus       : 200,
        franchiseWeight : 18,
        studioWeight    : 10,
        sourceWeight    : 5,
        eraWeight       : 6,
        genreWeight     : 4,
        tagWeight       : 4
    });

    let completedSuits = 0;
    let completedRanks = 0;

    for (const s of DECK_SUITS) {if (DECK_RANKS.every(r => Boolean(deckObj[`${s}:${r}`]))) completedSuits++}
    for (const r of DECK_RANKS) {if (DECK_SUITS.every(s => Boolean(deckObj[`${s}:${r}`]))) completedRanks++}

    const setBonusPts   = completedSuits * 50 + completedRanks * 20;
    const totalScore    = totalBase.score + setBonusPts;

    return {
        suit    : suitSyn,
        rank    : rankSyn,
        activeRank,
        total   : {
            ...totalBase,
            score: totalScore,
            setBonusPts,
            completedSuits,
            completedRanks
        }
    };
}

function formatSynergyTooltipLines(syn, extraLines = []) {
    return [
        `Slots: ${syn.filled}/${syn.maxSlots} (${syn.completionPts})`,
        `Power: ${syn.powerPts}`,
        syn.franchisePts    > 0 ? `Franchise: ${syn.franchisePts}`  : null,
        syn.studioPts       > 0 ? `Studio: ${syn.studioPts}`        : null,
        syn.eraPts          > 0 ? `Era: ${syn.eraPts}`              : null,
        syn.sourcePts       > 0 ? `Source: ${syn.sourcePts}`        : null,
        syn.genrePts        > 0 ? `Genre: ${syn.genrePts}`          : null,
        syn.tagPts          > 0 ? `Tag: ${syn.tagPts}`              : null,
        ...extraLines
    ].filter(Boolean).join("\n");
}

function updateDeckHeaderAndTabs() {
    const totalFilled   = Object.keys(draftDeck).length;
    const synergies     = computeDeckSynergies(draftDeck, activeDeckSuit);

    document.getElementById("deck-clear-btn")   .disabled = totalFilled === 0;
    document.getElementById("deck-save-btn")    .disabled = actionInFlight || !isDeckDirty();

    const syncSynergyPills = (ids, label, tooltipTitle, tooltipBody) => {for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.textContent = label;

        el.setAttribute("data-tooltip-title",   tooltipTitle);
        el.setAttribute("data-tooltip",         tooltipBody);
    }};

    syncSynergyPills(
        ["deck-suit-synergy-pill", "deck-suit-synergy-pill-mobile"],
        `${activeDeckSuit}: ${synergies.suit.score.toLocaleString()}`,
        `${activeDeckSuit} Synergy`,
        formatSynergyTooltipLines(synergies.suit)
    );

    const rankFull = getDeckRankFullName(synergies.activeRank);

    syncSynergyPills(
        ["deck-rank-synergy-pill", "deck-rank-synergy-pill-mobile"],
        `${rankFull}: ${synergies.rank.score.toLocaleString()}`,
        `${rankFull} Synergy`,
        formatSynergyTooltipLines(synergies.rank)
    );

    syncSynergyPills(
        ["deck-total-synergy-pill", "deck-total-synergy-pill-mobile"],
        `Total: ${synergies.total.score.toLocaleString()}`,
        "Total Synergy",
        formatSynergyTooltipLines(synergies.total, [synergies.total.setBonusPts > 0 ? `Sets: ${synergies.total.setBonusPts}` : null])
    );

    document.querySelectorAll(".deck-suit-tab").forEach(btn => {
        const suit      = btn.getAttribute("data-deck-suit");
        const isActive  = suit === activeDeckSuit;
        const bgClass   = DECK_SUIT_TAB_BG[suit] || DECK_SUIT_TAB_BG.Spades;
        let suitCount   = 0;

        for (const rank of DECK_RANKS) {if (draftDeck[`${suit}:${rank}`]) suitCount++}

        const countEl = btn.querySelector(".deck-suit-count");
        if (countEl) countEl.textContent = `${suitCount}/14`;

        btn.className = `deck-suit-tab py-1.5 px-2 rounded-lg ${bgClass} text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition ${isActive ? "opacity-100" : "opacity-65 hover:opacity-100"}`;
    });
}

function renderDeckSlotsGrid() {
    const grid      = document.getElementById("deck-slots-grid");
    const suitStyle = getDeckSuitStyle(activeDeckSuit);

    grid.innerHTML = DECK_RANKS.map(rank => {
        const slotId        = `${activeDeckSuit}:${rank}`;
        const assignedKey   = draftDeck[slotId] || null;
        const char          = assignedKey ? characterMap.get(assignedKey) : null;
        const isSelected    = !isSharedView && selectedDeckSlot === slotId;
        const ringClass     = isSelected ? "ring-2 ring-indigo-500" : "";
        const rankLabel     = `${rank} ${suitStyle.symbol}`;
        const fullRankSuit  = `${getDeckRankFullName(rank)} of ${activeDeckSuit}`;

        if (char) {
            const r                 = char.rarity;
            const safeName          = escapeHTML(char.name);
            const listPrefix        = isListCharacter(char) ? "L" : "";
            const duplicateCount    = inventory[char.uniqueKey] || 1;
            const dupLevel          = duplicateCount >= 6 ? "3" : duplicateCount >= 3 ? "2" : duplicateCount === 2 ? "1" : "";
            const isLocked          = lockedCards.has(char.uniqueKey);

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

            const lockBadgeHtml = `
                <span aria-hidden="true"
                    class="pointer-events-none absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded ${r.badge}">
                    ${isLocked
                        ? `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                           </svg>`
                        : `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                           </svg>`}
                </span>`;

            return `
                <button type="button" data-deck-slot="${slotId}"
                    title="${escapeHTML(`${fullRankSuit}\n${char.name}\n${getAnimeTitle(char)}`)}"
                    class="rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${r.border} ${ringClass} flex flex-col text-left transition hover:-translate-y-0.5">
                    <div class="${r.badge} !border-0 overflow-hidden flex flex-col w-full h-full">
                        <div class="relative aspect-[3/4] w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                            ${imgHtml}
                            <span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${suitStyle.badge}">
                                ${escapeHTML(rankLabel)}
                            </span>
                            <span class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${r.badge}">
                                ${listPrefix}${r.tier}${dupLevel}
                            </span>
                            ${lockBadgeHtml}
                        </div>
                        <div class="p-1 flex-1 flex flex-col justify-center text-center">
                            <div class="font-bold text-xs leading-tight line-clamp-1">
                                ${safeName}
                            </div>
                        </div>
                    </div>
                </button>
            `;
        }

        const emptyStyle = DECK_EMPTY_CARD_STYLES[activeDeckSuit] || DECK_EMPTY_CARD_STYLES.Spades;

        return `
            <button type="button" data-deck-slot="${slotId}"
                title="${escapeHTML(`${fullRankSuit}\nNone`)}"
                class="rounded-lg overflow-hidden ${emptyStyle.cardBg} ${emptyStyle.border} ${ringClass} text-white flex flex-col text-left transition hover:-translate-y-0.5">
                <div class="overflow-hidden flex flex-col w-full h-full">
                    <div class="relative aspect-[3/4] w-full flex items-center justify-center select-none">
                        <span class="absolute top-1.5 left-1 px-1 py-0.5 rounded text-[10px] font-bold text-white leading-none">
                            ${escapeHTML(rankLabel)}
                        </span>
                        ${renderPlayingCardCenter(rank, suitStyle.symbol)}
                        <span class="absolute bottom-1.5 right-1 px-1 py-0.5 rounded text-[10px] font-bold text-white leading-none rotate-180">
                            ${escapeHTML(rankLabel)}
                        </span>
                    </div>
                    <div class="p-1 flex-1 flex flex-col justify-center text-center ${emptyStyle.footerBg} text-white">
                        <div class="font-bold text-xs leading-tight line-clamp-1">
                            None
                        </div>
                    </div>
                </div>
            </button>
        `;
    }).join("");
}

function renderDeckPicker() {
    const panel         = document.getElementById("deck-picker-panel");
    const grid          = document.getElementById("deck-picker-grid");
    const unassignBtn   = document.getElementById("deck-unassign-slot-btn");
    const query         = document.getElementById("deck-picker-search").value.trim().toLowerCase();

    if (isSharedView || !selectedDeckSlot) {
        panel.classList.add("hidden");
        return;
    }

    const [suit, rank]  = selectedDeckSlot.split(":");
    const currentKey    = draftDeck[selectedDeckSlot] || null;

    panel.classList.remove("hidden");
    unassignBtn.classList.toggle("hidden", !currentKey);

    const eligible = characterPool.filter(c => {
        if (!(inventory[c.uniqueKey] > 0))                  return false;
        if (c.deckSuit !== suit || c.deckRank !== rank)     return false;
        if (!query)                                         return true;

        return c.name.toLowerCase().includes(query) ||
               (c.animeRomaji   && c.animeRomaji    .toLowerCase().includes(query)) ||
               (c.animeEnglish  && c.animeEnglish   .toLowerCase().includes(query));
    });

    if (eligible.length === 0) {
        grid.innerHTML = `<div class="col-span-full h-full flex items-center justify-center text-xs text-slate-500">No ${escapeHTML(getDeckRankFullName(rank))} of ${escapeHTML(suit)}</div>`;
        return;
    }

    const baseDraft = {...draftDeck};
    delete baseDraft[selectedDeckSlot];

    const baseSyn = computeDeckSynergies(baseDraft, suit, rank);

    const scoredEligible = eligible.map(c => {
        const testDeck  = {...baseDraft, [selectedDeckSlot]: c.uniqueKey};
        const nextSyn   = computeDeckSynergies(testDeck, suit, rank);

        return {
            char        : c,
            suitDelta   : nextSyn.suit  .score - baseSyn.suit   .score,
            rankDelta   : nextSyn.rank  .score - baseSyn.rank   .score,
            totalDelta  : nextSyn.total .score - baseSyn.total  .score
        };
    }).sort((a, b) => (b.totalDelta + b.suitDelta + b.rankDelta) - (a.totalDelta + a.suitDelta + a.rankDelta) || popularityTiebreaker(a.char, b.char));

    grid.innerHTML = scoredEligible.map(({char: c, suitDelta, rankDelta, totalDelta}) => {
        const selected = currentKey === c.uniqueKey ? "ring-2 ring-indigo-500" : "";

        const imgHtml = c.imageUrl
            ? `<img src="${c.imageUrl}" alt="${escapeHTML(c.name)}" loading="lazy" class="w-full h-full object-cover object-top"/>`
            : `<div class="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500 p-1 text-center">No Image</div>`;

        const tooltipText = `${c.name}\n${getAnimeTitle(c)}\nSuit +${suitDelta} • Rank +${rankDelta} • Total +${totalDelta}`;

        return `
            <button type="button" data-deck-pick="${escapeHTML(c.uniqueKey)}" title="${escapeHTML(tooltipText)}"
                class="aspect-square rounded-lg overflow-hidden ${c.rarity.border} ${selected} bg-slate-200 dark:bg-slate-800 hover:scale-105 transition">
                ${imgHtml}
            </button>
        `;
    }).join("");
}

function renderDeckModal() {
    updateDeckHeaderAndTabs ();
    renderDeckSlotsGrid     ();
    renderDeckPicker        ();
}

function openDeckModal() {
    if (!databaseReady) return;

    const titleEl       = document.getElementById("deck-modal-title");
    const actionsEl     = document.getElementById("deck-modal-actions");
    const playerLabel   = document.getElementById("shared-username")?.textContent?.trim() || "Player";

    titleEl.textContent = isSharedView ? `${playerLabel}'s Deck Collection` : "Deck Builder";
    actionsEl.classList.toggle("hidden", isSharedView);

    draftDeck           = getSanitizedDeck(playerDeck);
    activeDeckSuit      = "Spades";
    selectedDeckSlot    = "Spades:R";

    document.getElementById("deck-picker-search").value = "";
    renderDeckModal();

    document.getElementById("deck-modal").classList.remove("hidden");
    document.getElementById("deck-slots-grid").scrollTop = 0;
}

function autoFillDeck() {
    const next          = {...draftDeck};
    const usedKeys      = new Set(Object.values(next));
    const emptySlots    = [];

    for (const suit of DECK_SUITS) {
        for (const rank of DECK_RANKS) {
            const slotId = `${suit}:${rank}`;
            if (next[slotId]) continue;

            const candidates = characterPool.filter(c =>
                (inventory[c.uniqueKey] > 0)    &&
                c.deckSuit === suit             &&
                c.deckRank === rank             &&
                !usedKeys.has(c.uniqueKey)
            );

            if (candidates.length > 0) emptySlots.push({slotId, suit, rank, candidates});
        }
    }

    emptySlots.sort((a, b) => a.candidates.length - b.candidates.length);

    for (const slot of emptySlots) {
        let bestChar    = null;
        let bestScore   = -Infinity;

        for (const cand of slot.candidates) {
            if (usedKeys.has(cand.uniqueKey)) continue;

            next[slot.slotId]   = cand.uniqueKey;
            const totalScore    = computeDeckSynergies(next, slot.suit, slot.rank).total.score;

            if (totalScore > bestScore || (totalScore === bestScore && bestChar && popularityTiebreaker(cand, bestChar) < 0)) {
                bestScore   = totalScore;
                bestChar    = cand;
            }
        }

        if (bestChar) {
            usedKeys.add(bestChar.uniqueKey);
            next[slot.slotId] = bestChar.uniqueKey;
        } else delete next[slot.slotId];
    }

    let improved    = true;
    let passes      = 0;

    while (improved && passes < 3) {
        improved = false;
        passes++;

        for (const slot of emptySlots) {
            const currentKey = next[slot.slotId];
            if (!currentKey) continue;

            let bestKey     = currentKey;
            let bestScore   = computeDeckSynergies(next, slot.suit, slot.rank).total.score;

            for (const cand of slot.candidates) {
                if (cand.uniqueKey === currentKey || usedKeys.has(cand.uniqueKey)) continue;

                next[slot.slotId]   = cand.uniqueKey;
                const totalScore    = computeDeckSynergies(next, slot.suit, slot.rank).total.score;

                if (totalScore > bestScore) {
                    bestScore   = totalScore;
                    bestKey     = cand.uniqueKey;
                }
            }

            if (bestKey !== currentKey) {
                usedKeys.delete (currentKey);
                usedKeys.add    (bestKey);

                next[slot.slotId]       = bestKey;
                improved                = true;
            } else next[slot.slotId]    = currentKey;
        }
    }

    draftDeck = next;
    renderDeckModal();
}

document.getElementById("deck-builder-btn")?.   addEventListener("click", openDeckModal);
document.getElementById("deck-modal")?.         addEventListener("click", (e)   => {if (e.target.id === "deck-modal") document.getElementById("deck-modal").classList.add("hidden")});

document.getElementById("deck-suit-tabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-deck-suit]");
    if (!tab) return;

    activeDeckSuit      = tab.getAttribute("data-deck-suit");
    const currentRank   = selectedDeckSlot ? selectedDeckSlot.split(":")[1] : "R";
    selectedDeckSlot    = `${activeDeckSuit}:${currentRank}`;

    renderDeckModal();
    document.getElementById("deck-slots-grid").scrollTop = 0;
});

document.getElementById("deck-slots-grid")?.addEventListener("click", (e) => {
    const slotBtn = e.target.closest("[data-deck-slot]");
    if (!slotBtn) return;

    selectedDeckSlot = slotBtn.getAttribute("data-deck-slot");
    renderDeckModal();
});

document.getElementById("deck-picker-search")?.addEventListener("input", renderDeckPicker);

document.getElementById("deck-picker-grid")?.addEventListener("click", (e) => {
    const pickBtn = e.target.closest("[data-deck-pick]");
    if (!pickBtn || !selectedDeckSlot) return;

    const key = pickBtn.getAttribute("data-deck-pick");

    if (draftDeck[selectedDeckSlot] === key)    delete draftDeck[selectedDeckSlot];
    else                                        draftDeck[selectedDeckSlot] = key;

    renderDeckModal();
});

document.getElementById("deck-unassign-slot-btn")?.addEventListener("click", () => {
    if (!selectedDeckSlot) return;
    delete draftDeck[selectedDeckSlot];
    renderDeckModal();
});

document.getElementById("deck-auto-btn")?.addEventListener("click", autoFillDeck);

document.getElementById("deck-clear-btn")?.addEventListener("click", () => {
    draftDeck = {};
    renderDeckModal();
});

document.getElementById("deck-save-btn")?.addEventListener("click", async () => {
    if (actionInFlight || !isDeckDirty()) return;

    const cleanDeck = getSanitizedDeck(draftDeck);
    const res       = await sendGachaAction({action: "SAVE_DECK", deck: cleanDeck});

    if (res) {
        playerDeck  = {...cleanDeck};
        draftDeck   = {...cleanDeck};

        renderDeckModal();
    }
});