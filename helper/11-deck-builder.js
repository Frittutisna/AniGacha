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
    Spades      : {cardBg: "bg-violet-600",  border: "border-2 border-violet-500",  footerBg: "bg-violet-700/80"},
    Hearts      : {cardBg: "bg-indigo-600",  border: "border-2 border-indigo-500",  footerBg: "bg-indigo-700/80"},
    Diamonds    : {cardBg: "bg-blue-600",    border: "border-2 border-blue-500",    footerBg: "bg-blue-700/80"},
    Clubs       : {cardBg: "bg-emerald-600", border: "border-2 border-emerald-500", footerBg: "bg-emerald-700/80"}
};

const DECK_PIP_COORDS = {
    "2" : [[50, 30], [50, 70]],
    "3" : [[50, 26], [50, 50], [50, 74]],
    "4" : [[35, 30], [65, 30], [35, 70], [65, 70]],
    "5" : [[35, 30], [65, 30], [50, 50], [35, 70], [65, 70]],
    "6" : [[35, 27], [65, 27], [35, 50], [65, 50], [35, 73], [65, 73]],
    "7" : [[35, 27], [65, 27], [50, 38.5], [35, 50], [65, 50], [35, 73], [65, 73]],
    "8" : [[35, 27], [65, 27], [50, 38.5], [35, 50], [65, 50], [50, 61.5], [35, 73], [65, 73]],
    "9" : [[35, 24], [65, 24], [35, 41], [65, 41], [50, 50], [35, 59], [65, 59], [35, 76], [65, 76]],
    "10": [[35, 24], [65, 24], [50, 32.5], [35, 41], [65, 41], [35, 59], [65, 59], [50, 67.5], [35, 76], [65, 76]]
};

function renderPlayingCardCenter(rank, symbol) {
    if (rank === "A") {
        return `<span class="text-5xl sm:text-6xl leading-none text-white/95">${symbol}</span>`;
    }
    if (rank === "R" || rank === "K" || rank === "Q" || rank === "J") {
        return `<span class="text-5xl sm:text-6xl font-extrabold leading-none text-white/95">${rank}</span>`;
    }

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

function updateDeckHeaderAndTabs() {
    const totalFilled = Object.keys(draftDeck).length;
    document.getElementById("deck-clear-btn").disabled  = totalFilled === 0;
    document.getElementById("deck-save-btn").disabled   = actionInFlight || !isDeckDirty();

    document.querySelectorAll(".deck-suit-tab").forEach(btn => {
        const suit      = btn.getAttribute("data-deck-suit");
        const isActive  = suit === activeDeckSuit;
        const bgClass   = DECK_SUIT_TAB_BG[suit] || DECK_SUIT_TAB_BG.Spades;
        let suitCount   = 0;

        for (const rank of DECK_RANKS) {
            if (draftDeck[`${suit}:${rank}`]) suitCount++;
        }

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
        const isSelected    = selectedDeckSlot === slotId;
        const ringClass     = isSelected ? "ring-2 ring-indigo-500" : "";
        const rankLabel     = `${rank} ${suitStyle.symbol}`;
        const fullRankSuit  = `${getDeckRankFullName(rank)} of ${activeDeckSuit}`;

        if (char) {
            const r                 = char.rarity;
            const safeName          = escapeHTML(char.name);
            const safeAnime         = escapeHTML(getAnimeTitle(char));
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
                        <div class="p-1 flex-1 flex flex-col justify-center text-center gap-0.5">
                            <div class="font-bold text-xs leading-tight line-clamp-1">
                                ${safeName}
                            </div>
                            <div class="text-[10px] leading-tight line-clamp-1">
                                ${safeAnime}
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
                    <div class="p-1 flex-1 flex flex-col justify-center text-center gap-0.5 ${emptyStyle.footerBg} text-white">
                        <div class="font-bold text-xs leading-tight line-clamp-1">
                            None
                        </div>
                        <div class="text-[10px] leading-tight line-clamp-1 text-white/90">
                            ${escapeHTML(fullRankSuit)}
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

    if (!selectedDeckSlot) {
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
               (c.animeRomaji  && c.animeRomaji.toLowerCase().includes(query)) ||
               (c.animeEnglish && c.animeEnglish.toLowerCase().includes(query));
    });

    if (eligible.length === 0) {
        grid.innerHTML = `<div class="col-span-full h-full flex items-center justify-center text-xs text-slate-500">No ${escapeHTML(getDeckRankFullName(rank))} of ${escapeHTML(suit)}</div>`;
        return;
    }

    grid.innerHTML = eligible.map(c => {
        const selected  = currentKey === c.uniqueKey ? "ring-2 ring-indigo-500" : "";
        const imgHtml   = c.imageUrl
            ? `<img src="${c.imageUrl}" alt="${escapeHTML(c.name)}" loading="lazy" class="w-full h-full object-cover object-top"/>`
            : `<div class="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500 p-1 text-center">No Image</div>`;

        return `
            <button type="button" data-deck-pick="${escapeHTML(c.uniqueKey)}" title="${escapeHTML(`${c.name}\n${getAnimeTitle(c)}`)}"
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
    if (!databaseReady || isSharedView) return;

    draftDeck           = getSanitizedDeck(playerDeck);
    activeDeckSuit      = "Spades";
    selectedDeckSlot    = "Spades:R";

    document.getElementById("deck-picker-search").value = "";
    renderDeckModal();
    document.getElementById("deck-modal").classList.remove("hidden");
}

function autoFillDeck() {
    const next      = {...draftDeck};
    const usedKeys  = new Set(Object.values(next));

    for (const suit of DECK_SUITS) {
        for (const rank of DECK_RANKS) {
            const slotId = `${suit}:${rank}`;
            if (next[slotId]) continue;

            const match = characterPool.find(c =>
                (inventory[c.uniqueKey] > 0) &&
                c.deckSuit === suit &&
                c.deckRank === rank &&
                !usedKeys.has(c.uniqueKey)
            );

            if (match) {
                usedKeys.add(match.uniqueKey);
                next[slotId] = match.uniqueKey;
            }
        }
    }

    draftDeck = next;
    renderDeckModal();
}

document.getElementById("deck-builder-btn")?.addEventListener("click", openDeckModal);
document.getElementById("deck-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "deck-modal") document.getElementById("deck-modal").classList.add("hidden");
});

document.getElementById("deck-suit-tabs")?.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-deck-suit]");
    if (!tab) return;

    activeDeckSuit      = tab.getAttribute("data-deck-suit");
    const currentRank   = selectedDeckSlot ? selectedDeckSlot.split(":")[1] : "R";
    selectedDeckSlot    = `${activeDeckSuit}:${currentRank}`;

    renderDeckModal();
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
    if (draftDeck[selectedDeckSlot] === key) delete draftDeck[selectedDeckSlot];
    else draftDeck[selectedDeckSlot] = key;

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