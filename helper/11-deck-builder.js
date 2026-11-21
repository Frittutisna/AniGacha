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

function updateDeckHeaderAndTabs() {
    const totalFilled = Object.keys(draftDeck).length;
    document.getElementById("deck-filled-count").textContent    = totalFilled;
    document.getElementById("deck-save-btn").disabled           = actionInFlight || !isDeckDirty();

    document.querySelectorAll(".deck-suit-tab").forEach(btn => {
        const suit      = btn.getAttribute("data-deck-suit");
        const isActive  = suit === activeDeckSuit;
        let suitCount   = 0;

        for (const rank of DECK_RANKS) {
            if (draftDeck[`${suit}:${rank}`]) suitCount++;
        }

        const countEl = btn.querySelector(".deck-suit-count");
        if (countEl) countEl.textContent = `${suitCount}/14`;

        btn.className = isActive
            ? "deck-suit-tab py-1.5 px-2 rounded-lg border border-indigo-500 bg-indigo-600/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition"
            : "deck-suit-tab py-1.5 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition";
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

        if (char) {
            const imgHtml = char.imageUrl
                ? `<img src="${char.imageUrl}" alt="${escapeHTML(char.name)}" class="w-full h-full object-cover object-top" />`
                : `<div class="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">No Image</div>`;

            return `
                <button type="button" data-deck-slot="${slotId}"
                    title="${escapeHTML(`${getDeckRankFullName(rank)} of ${activeDeckSuit}: ${char.name}`)}"
                    class="rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${char.rarity.border} ${ringClass} flex flex-col text-left transition hover:-translate-y-0.5">
                    <div class="relative aspect-[3/4] w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        ${imgHtml}
                        <span class="absolute top-1 left-1 px-1 py-0.5 rounded text-[10px] font-bold ${suitStyle.badge}">
                            ${escapeHTML(rankLabel)}
                        </span>
                        <span class="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold ${char.rarity.badge}">
                            ${char.rarity.tier}
                        </span>
                    </div>
                    <div class="px-1 py-1 text-[10px] font-bold leading-tight truncate text-center ${char.rarity.badge} !border-0">
                        ${escapeHTML(char.name)}
                    </div>
                </button>
            `;
        }

        return `
            <button type="button" data-deck-slot="${slotId}"
                title="${escapeHTML(`Empty ${getDeckRankFullName(rank)} of ${activeDeckSuit} slot`)}"
                class="rounded-lg border-2 border-dashed ${isSelected ? "border-indigo-500 bg-indigo-500/10" : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-400 dark:hover:border-slate-600"} flex flex-col justify-between p-1.5 transition">
                <div class="aspect-[3/4] w-full flex flex-col items-center justify-center gap-1">
                    <span class="px-1.5 py-0.5 rounded text-xs font-bold ${suitStyle.badge}">
                        ${escapeHTML(rankLabel)}
                    </span>
                    <span class="text-[10px] font-semibold text-slate-400">+ Assign</span>
                </div>
                <div class="text-[10px] font-semibold text-slate-400 text-center truncate">Empty</div>
            </button>
        `;
    }).join("");
}

function renderDeckPicker() {
    const panel         = document.getElementById("deck-picker-panel");
    const grid          = document.getElementById("deck-picker-grid");
    const slotLabel     = document.getElementById("deck-picker-slot-label");
    const unassignBtn   = document.getElementById("deck-unassign-slot-btn");
    const query         = document.getElementById("deck-picker-search").value.trim().toLowerCase();

    if (!selectedDeckSlot) {
        panel.classList.add("hidden");
        return;
    }

    const [suit, rank]  = selectedDeckSlot.split(":");
    const suitStyle     = getDeckSuitStyle(suit);
    const currentKey    = draftDeck[selectedDeckSlot] || null;

    panel.classList.remove("hidden");
    slotLabel.textContent = `${getDeckRankFullName(rank)} of ${suit} (${rank} ${suitStyle.symbol})`;
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
        grid.innerHTML = `<div class="col-span-full text-center py-4 text-xs text-slate-500">No owned characters with ${escapeHTML(getDeckRankFullName(rank))} of ${escapeHTML(suit)}</div>`;
        return;
    }

    grid.innerHTML = eligible.map(c => {
        const isCurrent = currentKey === c.uniqueKey;
        const imgHtml   = c.imageUrl
            ? `<img src="${c.imageUrl}" alt="${escapeHTML(c.name)}" loading="lazy" class="w-full h-full object-cover object-top" />`
            : `<div class="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">No Image</div>`;

        return `
            <button type="button" data-deck-pick="${escapeHTML(c.uniqueKey)}"
                title="${escapeHTML(`${c.name} — ${getAnimeTitle(c)}`)}"
                class="rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${c.rarity.border} ${isCurrent ? "ring-2 ring-indigo-500" : ""} flex flex-col text-left hover:scale-[1.02] transition">
                <div class="relative aspect-[3/4] w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    ${imgHtml}
                    <span class="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold ${c.rarity.badge}">
                        ${c.rarity.tier}
                    </span>
                </div>
                <div class="px-1 py-0.5 text-[10px] font-bold truncate text-center ${c.rarity.badge} !border-0">
                    ${escapeHTML(c.name)}
                </div>
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
document.getElementById("deck-close-btn")?.addEventListener("click", () => document.getElementById("deck-modal")?.classList.add("hidden"));
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