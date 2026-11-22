let casinoBjState       = null;
let casinoGuestState    = null;
let casinoBusy          = false;

const NAV_ICONS = {
    HOME    : '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    QUIZ    : '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    CASINO  : '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/>'
};

const NAV_LABELS = {
    HOME    : "Home",
    QUIZ    : "Quiz",
    CASINO  : "Casino"
};

function syncHeaderNavButtons(currentPage) {
    const pairs = {
        HOME    : ["QUIZ", "CASINO"],
        QUIZ    : ["HOME", "CASINO"],
        CASINO  : ["HOME", "QUIZ"]
    };

    const [firstTarget, secondTarget] = pairs[currentPage] || pairs.HOME;

    const btn1  = document.getElementById("page-nav-btn");
    const icon1 = document.getElementById("page-nav-icon");
    const btn2  = document.getElementById("casino-nav-btn");
    const icon2 = document.getElementById("casino-nav-icon");

    if (btn1) {
        btn1.dataset.targetPage = firstTarget;
        btn1.setAttribute("aria-label", NAV_LABELS[firstTarget]);

        btn1.title = NAV_LABELS[firstTarget];
        btn1.removeAttribute("data-tooltip");
    }

    if (icon1) icon1.innerHTML = NAV_ICONS[firstTarget];

    if (btn2) {
        btn2.dataset.targetPage = secondTarget;
        btn2.setAttribute("aria-label", NAV_LABELS[secondTarget]);

        btn2.title = NAV_LABELS[secondTarget];
        btn2.removeAttribute("data-tooltip");
    }

    if (icon2) icon2.innerHTML = NAV_ICONS[secondTarget];
}

function switchHeaderPage(targetPage) {
    const mainPage      = document.getElementById("main-page");
    const quizPage      = document.getElementById("quiz-page");
    const casinoPage    = document.getElementById("casino-page");
    const leavingQuiz   = !quizPage.classList.contains("hidden") && targetPage !== "QUIZ";

    if (leavingQuiz && typeof aniQuizRun !== "undefined" && aniQuizRun && !document.getElementById("quiz-active").classList.contains("hidden")) {
        aniQuizEndToHome = (targetPage === "HOME");
        quizEndModal?.classList.remove("hidden");
        document.getElementById("quiz-end-confirm")?.focus();

        return;
    }

    mainPage    .classList.toggle("hidden", targetPage !== "HOME");
    quizPage    .classList.toggle("hidden", targetPage !== "QUIZ");
    casinoPage  .classList.toggle("hidden", targetPage !== "CASINO");

    syncHeaderNavButtons(targetPage);

    if (targetPage === "QUIZ") {
        if (typeof aniQuizRenderMissions        === "function") aniQuizRenderMissions           ();
        if (typeof aniQuizUpdateSettingsPreview === "function") aniQuizUpdateSettingsPreview    ();
        if (typeof loadAniQuizData              === "function") loadAniQuizData                 ();
    } else if (targetPage === "CASINO") {
        if (currentUser && stars > 0) {
            const betInput = document.getElementById("bj-bet-input");
            if (Number(betInput.value) > stars) betInput.value = stars;
        }

        renderBlackjackUI();
    }

    window.scrollTo({top: 0, behavior: "instant"});
}

function closeCasinoPage() {switchHeaderPage("HOME")}

function evaluateBlackjackHand(cards) {
    let total   = 0;
    let aces    = 0;

    for (const slotId of cards) {
        if (!slotId) continue;
        const rank = slotId.split(":")[1];

        if      (rank === "R")                                  total   += 0;
        else if (rank === "A")                                  {total  += 11; aces++}
        else if (rank === "K" || rank === "Q" || rank === "J")  total   += 10;
        else                                                    total   += Number(rank) || 0;
    }

    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }

    return total;
}

function renderCasinoCardHTML(slotId) {
    if (!slotId) return `
        <div class="w-24 sm:w-28 rounded-lg overflow-hidden bg-slate-800 border-2 border-slate-600 text-white flex flex-col select-none shrink-0">
            <div class="relative aspect-[3/4] w-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
                <span class="text-2xl font-black text-slate-400">?</span>
            </div>
            <div class="p-1 text-center bg-slate-900">
                <div class="font-bold text-xs leading-tight text-slate-400">Hidden</div>
            </div>
        </div>
    `;

    const [suit, rank]  = slotId.split(":");
    const suitStyle     = getDeckSuitStyle(suit);
    const rankLabel     = `${rank} ${suitStyle.symbol}`;
    const fullRankSuit  = `${getDeckRankFullName(rank)} of ${suit}`;
    const cleanDeck     = typeof getSanitizedDeck === "function" ? getSanitizedDeck(playerDeck) : playerDeck;
    const assignedKey   = cleanDeck?.[slotId] || null;
    const char          = assignedKey ? characterMap.get(assignedKey) : null;

    if (char) {
        const r             = char.rarity;
        const safeName      = escapeHTML(char.name);
        const listPrefix    = isListCharacter(char) ? "L" : "";
        const dupCount      = inventory[char.uniqueKey] || 1;
        const dupLevel      = dupCount >= 6 ? "3" : dupCount >= 3 ? "2" : dupCount === 2 ? "1" : "";
        const isLocked      = lockedCards.has(char.uniqueKey);

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

        const imgHtml = char.imageUrl
            ? `<img src="${char.imageUrl}" alt="${safeName}" loading="lazy"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                class="w-full h-full object-cover object-top" />
               <div style="display:none" class="w-full h-full bg-slate-200 dark:bg-slate-800 items-center justify-center text-slate-500 dark:text-slate-400 p-2 text-center">
                   <span class="text-sm font-bold leading-[1.05]">No<br>Image</span>
               </div>`
            : `<div class="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 p-2 text-center">
                   <span class="text-sm font-bold leading-[1.05]">No<br>Image</span>
               </div>`;

        return `
            <div title="${escapeHTML(`${fullRankSuit}\n${char.name}\n${getAnimeTitle(char)}`)}"
                class="w-24 sm:w-28 rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${r.border} flex flex-col text-left shrink-0">
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
                        <div class="font-bold text-xs leading-tight line-clamp-1">${safeName}</div>
                    </div>
                </div>
            </div>
        `;
    }

    const emptyStyle = DECK_EMPTY_CARD_STYLES[suit] || DECK_EMPTY_CARD_STYLES.Spades;

    return `
        <div class="w-24 sm:w-28 rounded-lg overflow-hidden ${emptyStyle.cardBg} ${emptyStyle.border} text-white flex flex-col text-left shrink-0">
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
                    <div class="font-bold text-[11px] leading-tight line-clamp-1">${escapeHTML(fullRankSuit)}</div>
                </div>
            </div>
        </div>
    `;
}

function renderBlackjackUI() {
    const dealerWrap    = document.getElementById("bj-dealer-cards");
    const playerWrap    = document.getElementById("bj-player-cards");
    const dealerScoreEl = document.getElementById("bj-dealer-score");
    const playerScoreEl = document.getElementById("bj-player-score");
    const statusBanner  = document.getElementById("bj-status-banner");
    const actionRow     = document.getElementById("bj-action-controls");
    const betControls   = document.getElementById("bj-bet-controls");
    const betInput      = document.getElementById("bj-bet-input");
    const dealBtn       = document.getElementById("bj-deal-btn");
    const hitBtn        = document.getElementById("bj-hit-btn");
    const standBtn      = document.getElementById("bj-stand-btn");
    const isGuest       = !currentUser;
    betInput.disabled   = isGuest || casinoBusy || casinoBjState?.status === "ACTIVE";

    if (isGuest) betInput.value = 0;

    if (!casinoBjState) {
        dealerWrap      .innerHTML   = `<span class="text-xs text-slate-400">Place a bet and press Deal</span>`;
        playerWrap      .innerHTML   = "";
        dealerScoreEl   .textContent = "—";
        playerScoreEl   .textContent = "—";

        statusBanner    .classList  .add    ("hidden");
        actionRow       .classList  .add    ("hidden");
        betControls     .classList  .remove ("opacity-50", "pointer-events-none");

        dealBtn.disabled = casinoBusy || !databaseReady || (!isGuest && stars < 1);
        return;
    }

    const {status, bet, payout, playerCards, dealerCards, playerScore, dealerScore} = casinoBjState;
    const isActive                                                                  = status === "ACTIVE";

    dealerWrap      .innerHTML      = dealerCards.map(renderCasinoCardHTML).join("");
    playerWrap      .innerHTML      = playerCards.map(renderCasinoCardHTML).join("");
    dealerScoreEl   .textContent    = isActive ? `${dealerScore} + ?` : `${dealerScore}`;
    playerScoreEl   .textContent    = `${playerScore}`;

    actionRow.classList.toggle("hidden", !isActive);

    hitBtn      .disabled = casinoBusy || !isActive;
    standBtn    .disabled = casinoBusy || !isActive;

    betControls.classList.toggle("opacity-50",          isActive);
    betControls.classList.toggle("pointer-events-none", isActive);

    dealBtn.disabled = casinoBusy || isActive || (!isGuest && stars < 1);

    if (isActive) statusBanner.classList.add("hidden");
    else {
        const profit    = payout - bet;
        const winCls    = "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
        const pushCls   = "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300";
        const lossCls   = "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300";

        const statusMap = {
            BLACKJACK           : {text: `Blackjack: Won ★ ${profit        .toLocaleString()}`,    cls: winCls},
            WIN                 : {text: `You Win: Won ★ ${profit          .toLocaleString()}`,    cls: winCls},
            DEALER_BUST         : {text: `Dealer Busts: Won ★ ${profit     .toLocaleString()}`,    cls: winCls},
            PUSH                : {text: `Push: Won ★ 0`,                                          cls: pushCls},
            BUST                : {text: `Bust: Loss ★ ${bet               .toLocaleString()}`,    cls: lossCls},
            DEALER_BLACKJACK    : {text: `Dealer Blackjack: Loss ★ ${bet   .toLocaleString()}`,    cls: lossCls},
            LOSE                : {text: `Dealer Wins: Loss ★ ${bet        .toLocaleString()}`,    cls: lossCls}
        };

        const info                  = statusMap[status] || statusMap.LOSE;
        statusBanner.textContent    = info.text;
        statusBanner.className      = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${info.cls}`;
    }
}

function handleGuestBlackjack(subAction) {
    if (subAction === "DEAL") {
        const shoe = [];
        for (const s of DECK_SUITS) {for (const r of DECK_RANKS) shoe.push(`${s}:${r}`)}

        for (let i = shoe.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
        }

        const playerCards = [shoe.pop(), shoe.pop()];
        const dealerCards = [shoe.pop(), shoe.pop()];
        const playerScore = evaluateBlackjackHand(playerCards);
        const dealerScore = evaluateBlackjackHand(dealerCards);

        let status = "ACTIVE";

        if      (playerScore === 21 && dealerScore === 21)  status = "PUSH";
        else if (playerScore === 21)                        status = "BLACKJACK";
        else if (dealerScore === 21)                        status = "DEALER_BLACKJACK";

        casinoGuestState = status === "ACTIVE" ? {shoe, playerCards, dealerCards} : null;

        return {
            status,
            bet         : 0,
            payout      : 0,
            playerCards,
            dealerCards : status === "ACTIVE" ? [dealerCards[0], null] : dealerCards,
            playerScore,
            dealerScore : status === "ACTIVE" ? evaluateBlackjackHand([dealerCards[0]]) : dealerScore
        };
    }

    if (!casinoGuestState) return null;

    if (subAction === "HIT") {
        casinoGuestState.playerCards.push(casinoGuestState.shoe.pop());
        const playerScore = evaluateBlackjackHand(casinoGuestState.playerCards);

        if (playerScore > 21) {
            const res = {
                status      : "BUST",
                bet         : 0,
                payout      : 0,
                playerCards : casinoGuestState.playerCards,
                dealerCards : casinoGuestState.dealerCards,
                playerScore,
                dealerScore : evaluateBlackjackHand(casinoGuestState.dealerCards)
            };

            casinoGuestState = null;
            return res;
        }

        return {
            status      : "ACTIVE",
            bet         : 0,
            payout      : 0,
            playerCards : casinoGuestState.playerCards,
            dealerCards : [casinoGuestState.dealerCards[0], null],
            playerScore,
            dealerScore : evaluateBlackjackHand([casinoGuestState.dealerCards[0]])
        };
    }

    if (subAction === "STAND") {
        while (evaluateBlackjackHand(casinoGuestState.dealerCards) < 17 && casinoGuestState.shoe.length > 0) casinoGuestState.dealerCards.push(casinoGuestState.shoe.pop());

        const playerScore = evaluateBlackjackHand(casinoGuestState.playerCards);
        const dealerScore = evaluateBlackjackHand(casinoGuestState.dealerCards);

        let status = "LOSE";

        if      (dealerScore >      21)             status = "DEALER_BUST";
        else if (playerScore >      dealerScore)    status = "WIN";
        else if (playerScore ===    dealerScore)    status = "PUSH";

        const res = {
            status,
            bet         : 0,
            payout      : 0,
            playerCards : casinoGuestState.playerCards,
            dealerCards : casinoGuestState.dealerCards,
            playerScore,
            dealerScore
        };

        casinoGuestState = null;
        return res;
    }

    return null;
}

const casinoSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runBlackjackAction(subAction) {
    if (casinoBusy || !databaseReady) return;

    const betInput  = document.getElementById("bj-bet-input");
    const bet       = Math.max(1, Math.floor(Number(betInput.value) || 1));

    if (subAction === "DEAL" && currentUser) {
        if (stars < bet) {
            alert("Not enough stars");
            return;
        }

        betInput.value = bet;
    }

    casinoBusy = true;
    renderBlackjackUI();

    try {
        let nextGame = null;

        if (!currentUser) nextGame = handleGuestBlackjack(subAction);
        else {
            const payload   = subAction === "DEAL" ? {action: "CASINO_BLACKJACK", subAction: "DEAL", bet} : {action: "CASINO_BLACKJACK", subAction};
            const res       = await sendGachaAction(payload);

            if (res?.game) nextGame = res.game;
        }

        if (nextGame && subAction === "STAND" && Array.isArray(nextGame.dealerCards) && nextGame.dealerCards.length >= 2) {for (let i = 2; i <= nextGame.dealerCards.length; i++) {
                await casinoSleep(2500);
                if (i === nextGame.dealerCards.length) break;
                const shownCards = nextGame.dealerCards.slice(0, i);

                casinoBjState = {
                    ...nextGame,
                    status      : "ACTIVE",
                    dealerCards : shownCards,
                    dealerScore : evaluateBlackjackHand(shownCards)
                };

                renderBlackjackUI();
        }}

        if (nextGame) casinoBjState = nextGame;
    } finally {
        casinoBusy = false;
        renderBlackjackUI();
    }
}

syncHeaderNavButtons("HOME");

(() => {
    const select    = document.getElementById("casino-game-select");
    const wrapper   = select?.closest(".custom-select-wrapper");
    const trigger   = wrapper?.querySelector(".custom-select-trigger");

    if (!select || !trigger) return;

    let longest = "";
    for (const opt of select.options) {if (opt.text.length > longest.length) longest = opt.text}

    const sizer         = document.createElement("span");
    sizer.className     = "invisible h-0 overflow-hidden block whitespace-nowrap text-sm font-bold";
    sizer.textContent   = longest;

    trigger.appendChild         (sizer);
    trigger.classList.remove    ("flex", "items-center", "justify-between");
    trigger.classList.add       ("block");
})();

document.getElementById("casino-nav-btn")?.addEventListener("click", () => {
    const targetPage = document.getElementById("casino-nav-btn").dataset.targetPage || "CASINO";
    switchHeaderPage(targetPage);
});

document.getElementById("casino-game-select")?.addEventListener("change", (e) => {
    const val           = e.target.value;
    const isBlackjack   = val === "BLACKJACK";
    const labels        = {
        SYNERGY     : "Synergy Showdown",
        ROULETTE    : "Roulette",
        FX          : "Leveraged FX"
    };

    document.getElementById("bj-rules-pill")?.          classList.toggle("hidden", !isBlackjack);
    document.getElementById("bj-bet-controls")?.        classList.toggle("hidden", !isBlackjack);
    document.getElementById("casino-blackjack-board")?. classList.toggle("hidden", !isBlackjack);
    document.getElementById("casino-coming-soon")?.     classList.toggle("hidden", isBlackjack);

    if (!isBlackjack)   document.getElementById("casino-coming-soon-title").textContent = `${labels[val] || val}: Coming Soon`;
    else                renderBlackjackUI();
});

document.getElementById("bj-deal-btn")?.    addEventListener("click", () => runBlackjackAction("DEAL"));
document.getElementById("bj-hit-btn")?.     addEventListener("click", () => runBlackjackAction("HIT"));
document.getElementById("bj-stand-btn")?.   addEventListener("click", () => runBlackjackAction("STAND"));