let casinoBjState           = null;
let casinoGuestState        = null;
let casinoBusy              = false;
let casinoRlSelectedBet     = {type: "COLOR", value: "RED"};
let casinoRlLastSpin        = null;
let casinoRlWheelBuilt      = false;
let casinoRlWheelAngle      = 0;
let casinoRlBallAngle       = 0;
let casinoRlAnimRafId       = 0;
let casinoFxPair            = "USD/JPY";
let casinoFxLeverage        = 100;
let casinoFxRun             = null;
let casinoFxTimerId         = 0;
let casinoSynState          = null;
let casinoSynSelectedKey    = null;
let casinoSynGuestState     = null;

const NAV_ICONS = {
    HOME    : '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    QUIZ    : '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    CASINO  : '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/>',
    TABI    : '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>'
};

const NAV_LABELS = {
    HOME    : "Home",
    QUIZ    : "Quiz",
    CASINO  : "Casino",
    TABI    : "Tabi"
};

const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROULETTE_WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const FX_PAIR_META = {
    "USD/JPY": {decimals: 3, desc: "Macro drifts, sudden liquidity sweep wicks/reversals"},
    "AUD/JPY": {decimals: 3, desc: "Smooth risk-on momentum, abrupt risk-off drops"},
    "GBP/JPY": {decimals: 3, desc: "Extreme volatility, massive wicks against high leverage"},
    "EUR/CHF": {decimals: 5, desc: "Deceptively tight range, abruptly de-peg/surge/bleed"},
    "ZAR/JPY": {decimals: 4, desc: "Positive swap yield on Longs, bleeds value over time"},
    "TRY/JPY": {decimals: 4, desc: "Carry yield on Longs, chaotic slides, violent spikes"}
};

const SYNERGY_DEALER_FACTOR   = 2;
const SYNERGY_SWAP_STEP       = 5;
const CASINO_DAILY_BET_CAP    = 1000;

function getCasinoClientJstDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone    : "Asia/Tokyo",
        year        : "numeric",
        month       : "2-digit",
        day         : "2-digit"
    }).format(new Date());
}

function getRemainingDailyCasinoBet(gameKey) {
    if (!currentUser) return CASINO_DAILY_BET_CAP;

    const jstDate = activeDailyJstDate || getCasinoClientJstDate();
    if (!casinoDailyBet || casinoDailyBet.date !== jstDate) return CASINO_DAILY_BET_CAP;

    const used = Math.max(0, Math.floor(Number(casinoDailyBet[gameKey]) || 0));
    return Math.max(0, CASINO_DAILY_BET_CAP - used);
}

const SYNERGY_TIER_ORDER = {
    SSR : 9,
    SR  : 8,
    S   : 7,
    A   : 6,
    B   : 5,
    C   : 4,
    D   : 3,
    E   : 2,
    F   : 1
};

function syncHeaderNavButtons(currentPage) {
    const triples = {
        HOME    : ["QUIZ", "CASINO",    "TABI"],
        QUIZ    : ["HOME", "CASINO",    "TABI"],
        CASINO  : ["HOME", "QUIZ",      "TABI"],
        TABI    : ["HOME", "QUIZ",      "CASINO"]
    };

    const [firstTarget, secondTarget, thirdTarget] = triples[currentPage] || triples.HOME;

    const slots = [
        {btn: document.getElementById("page-nav-btn"),      icon: document.getElementById("page-nav-icon"),     target: firstTarget},
        {btn: document.getElementById("casino-nav-btn"),    icon: document.getElementById("casino-nav-icon"),   target: secondTarget},
        {btn: document.getElementById("tabi-nav-btn"),      icon: document.getElementById("tabi-nav-icon"),     target: thirdTarget}
    ];

    for (const {btn, icon, target} of slots) {
        if (btn) {
            btn.dataset.targetPage = target;
            btn.setAttribute("aria-label", NAV_LABELS[target]);

            btn.title = NAV_LABELS[target];
            btn.removeAttribute("data-tooltip");
        }

        if (icon) icon.innerHTML = NAV_ICONS[target];
    }
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

    mainPage    .classList.toggle("hidden", targetPage !== "HOME");
    quizPage    .classList.toggle("hidden", targetPage !== "QUIZ");
    casinoPage  .classList.toggle("hidden", targetPage !== "CASINO");
    tabiPage?.   classList.toggle("hidden", targetPage !== "TABI");

    syncHeaderNavButtons(targetPage);

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
    } else if (targetPage === "TABI" && typeof tabiOnPageOpen === "function") tabiOnPageOpen()

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
    betInput.disabled   = casinoBusy || casinoBjState?.status === "ACTIVE";

    if (isGuest) {
        const clamped = Math.min(1000, Math.max(1, Math.floor(Number(betInput.value) || 10)));
        if (String(clamped) !== betInput.value) betInput.value = clamped;
    }

    if (!casinoBjState) {
        dealerWrap      .innerHTML   = `<span class="text-sm text-slate-500">Place a bet and press Deal</span>`;
        playerWrap      .innerHTML   = "";
        dealerScoreEl   .textContent = "—";
        playerScoreEl   .textContent = "—";

        statusBanner    .classList  .add    ("hidden");
        actionRow       .classList  .add    ("hidden");
        actionRow       .classList  .remove ("grid");
        betControls     .classList  .remove ("opacity-50", "pointer-events-none");

        const remBj = getRemainingDailyCasinoBet("BLACKJACK");
        dealBtn.disabled = casinoBusy || !databaseReady || (!isGuest && (stars < 1 || remBj < 1));

        return;
    }

    const {status, bet, payout, playerCards, dealerCards, playerScore, dealerScore} = casinoBjState;
    const isActive                                                                  = status === "ACTIVE";

    dealerWrap      .innerHTML      = dealerCards.map(renderCasinoCardHTML).join("");
    playerWrap      .innerHTML      = playerCards.map(renderCasinoCardHTML).join("");
    dealerScoreEl   .textContent    = isActive ? `${dealerScore}+?` : `${dealerScore}`;
    playerScoreEl   .textContent    = `${playerScore}`;

    actionRow.classList.toggle("hidden",    !isActive);
    actionRow.classList.toggle("grid",      isActive);

    hitBtn      .disabled = casinoBusy || !isActive;
    standBtn    .disabled = casinoBusy || !isActive;

    betControls.classList.toggle("opacity-50",          isActive);
    betControls.classList.toggle("pointer-events-none", isActive);

    const remBj = getRemainingDailyCasinoBet("BLACKJACK");
    dealBtn.disabled = casinoBusy || isActive || (!isGuest && (stars < 1 || remBj < 1));

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
            BUST                : {text: `Bust: Lost ★ ${bet               .toLocaleString()}`,    cls: lossCls},
            DEALER_BLACKJACK    : {text: `Dealer Blackjack: Lost ★ ${bet   .toLocaleString()}`,    cls: lossCls},
            LOSE                : {text: `Dealer Wins: Lost ★ ${bet        .toLocaleString()}`,    cls: lossCls}
        };

        const info                  = statusMap[status] || statusMap.LOSE;
        statusBanner.textContent    = info.text;
        statusBanner.className      = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${info.cls}`;
    }
}

function handleGuestBlackjack(subAction, bet = 10) {
    const fakeBet = Math.min(1000, Math.max(1, Math.floor(Number(bet) || 10)));

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
        let payout = 0;

        if      (playerScore === 21 && dealerScore === 21)  {status = "PUSH";               payout = fakeBet}
        else if (playerScore === 21)                        {status = "BLACKJACK";          payout = Math.floor(fakeBet * 2.5)}
        else if (dealerScore === 21)                        {status = "DEALER_BLACKJACK";   payout = 0}

        casinoGuestState = status === "ACTIVE" ? {bet: fakeBet, shoe, playerCards, dealerCards} : null;

        return {
            status,
            bet         : fakeBet,
            payout,
            playerCards,
            dealerCards : status === "ACTIVE" ? [dealerCards[0], null]                  : dealerCards,
            playerScore,
            dealerScore : status === "ACTIVE" ? evaluateBlackjackHand([dealerCards[0]]) : dealerScore
        };
    }

    if (!casinoGuestState) return null;
    const activeBet = casinoGuestState.bet || fakeBet;

    if (subAction === "HIT") {
        casinoGuestState.playerCards.push(casinoGuestState.shoe.pop());
        const playerScore = evaluateBlackjackHand(casinoGuestState.playerCards);

        if (playerScore > 21) {
            const res = {
                status      : "BUST",
                bet         : activeBet,
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
            bet         : activeBet,
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
        let payout = 0;

        if      (dealerScore >      21)             {status = "DEALER_BUST";    payout = activeBet * 2}
        else if (playerScore >      dealerScore)    {status = "WIN";            payout = activeBet * 2}
        else if (playerScore ===    dealerScore)    {status = "PUSH";           payout = activeBet}

        const res = {
            status,
            bet         : activeBet,
            payout,
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
    const rawBet    = Math.floor(Number(betInput.value) || 1);
    const bet       = currentUser ? Math.max(1, rawBet) : Math.min(1000, Math.max(1, rawBet));

    if (subAction === "DEAL") {
        if (currentUser) {
            const remBj = getRemainingDailyCasinoBet("BLACKJACK");

            if (remBj < 1) {
                alert("Reached daily bet limit");
                return;
            }

            if (bet > remBj) {
                alert(`Exceeds daily bet limit (${remBj.toLocaleString()} Stars remaining)`);
                return;
            }

            if (stars < bet) {
                alert("Not enough stars");
                return;
            }
        }

        betInput.value = bet;
    }

    casinoBusy = true;
    renderBlackjackUI();

    try {
        let nextGame = null;

        if (!currentUser) nextGame = handleGuestBlackjack(subAction, bet);
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

document.getElementById("tabi-nav-btn")?.addEventListener("click", () => {
    const targetPage = document.getElementById("tabi-nav-btn").dataset.targetPage || "TABI";
    switchHeaderPage(targetPage);
});

const CASINO_RULES_TEXT = {
    BLACKJACK   : "Uses your Deck Collection/basic cards for empty slots\nJokers are worth 0 and never bust\nDealer stands on ≥17s\n2-card Blackjack pays 3:2",
    SYNERGY     : `Requires ≥56 cards\nPlayer draws 7 cards; can swap for other cards\nAim for hand synergy: same studio, franchise, era, etc.\nSwap cost increases by ${SYNERGY_SWAP_STEP}; deducts from hand synergy\nDealer draws 14 cards; scores from top 10\n7 mirrors pre-swap hand rarity-level\n7 random to highest pre-swap rarity\nHigher synergy wins 1:1; dealer wins ties`,
    ROULETTE    : "Single-zero European wheel (0-36)\nRed/Black: 18 pockets, pays 1:1\nGreen/Numbers (1-6): 1 pocket, pays 35:1",
    FX          : "Compressed 5-minute FX chart (60 5-second candles)\nBlue = Bullish, Red = Bearish\nLoss-cut triggers at ≤15% equity\nTake-Profit auto-closes at 4x margin\nAdditional orders in a session must match your initial direction\nSettle anytime before 05:00 or hold until market close"
};

function getOwnedCollectionKeys() {
    if (!databaseReady || !characterPool) return [];
    return characterPool.filter(c => (inventory?.[c.uniqueKey] || 0) > 0).map(c => c.uniqueKey);
}

function shuffleArrayCopy(arr) {
    const copy = [...arr];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function getClientHandSynergy(keys = [], levelMap = null, maxSlots = 7) {
    const chars     = (keys || []).map(k => characterMap?.get(k)).filter(Boolean);
    const getLevel  = levelMap ? (c) => (levelMap[c.uniqueKey] ?? 0) : null;

    if (typeof computeHandSynergy === "function") return computeHandSynergy(chars, getLevel, maxSlots).score;
    return chars.slice(0, maxSlots).reduce((sum, c) => sum + (SYNERGY_RARITY_POINTS?.[c.rarity?.tier] || 1), 0);
}

function renderSynergyCardHTML(uniqueKey, {selectable = false, selected = false, hidden = false, isDealer = false, dealerLevel = 0} = {}) {
    if (hidden || !uniqueKey) return `
        <div class="w-full rounded-lg overflow-hidden bg-slate-800 border-2 border-slate-600 text-white flex flex-col select-none">
            <div class="relative aspect-[3/4] w-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
                <span class="text-xl font-black text-slate-400">?</span>
            </div>
            <div class="p-1 text-center bg-slate-900">
                <div class="font-bold text-[11px] leading-tight text-slate-400">Hidden</div>
            </div>
        </div>
    `;

    const char = characterMap?.get(uniqueKey);
    if (!char) return "";

    const r             = char.rarity;
    const safeName      = escapeHTML(char.name);
    const listPrefix    = !isDealer && isListCharacter(char) ? "L" : "";
    const dupCount      = inventory?.[char.uniqueKey] || 1;
    const dupLevel      = isDealer ? (dealerLevel > 0 ? String(dealerLevel) : "") : (dupCount >= 6 ? "3" : dupCount >= 3 ? "2" : dupCount === 2 ? "1" : "");
    const isLocked      = lockedCards?.has(char.uniqueKey);
    const suit          = char.deckSuit || "Spades";
    const rank          = char.deckRank || "2";
    const suitStyle     = getDeckSuitStyle(suit);
    const rankLabel     = `${rank} ${suitStyle.symbol}`;
    const fullRankSuit  = `${getDeckRankFullName(rank)} of ${suit}`;
    const ringCls       = selected ? "ring-2 ring-indigo-500 -translate-y-0.5" : "";
    const cursorCls     = selectable ? "cursor-pointer hover:-translate-y-0.5 transition" : "";
    const tag           = selectable ? "button" : "div";
    const typeAttr      = selectable ? 'type="button"' : "";

    const lockBadgeHtml = isDealer ? "" : `
        <span aria-hidden="true"
            class="pointer-events-none absolute top-1 right-1 w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded ${r.badge}">
            ${isLocked
                ? `<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                   </svg>`
                : `<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
                   </svg>`}
        </span>`;

    const imgHtml = char.imageUrl
        ? `<img src="${char.imageUrl}" alt="${safeName}" loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            class="w-full h-full object-cover object-top" />
           <div style="display:none" class="w-full h-full bg-slate-200 dark:bg-slate-800 items-center justify-center text-slate-500 dark:text-slate-400 p-1 text-center">
               <span class="text-xs font-bold leading-[1.05]">No<br>Image</span>
           </div>`
        : `<div class="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 p-1 text-center">
               <span class="text-xs font-bold leading-[1.05]">No<br>Image</span>
           </div>`;

    return `
        <${tag} ${typeAttr} ${selectable ? `data-syn-hand-key="${escapeHTML(char.uniqueKey)}"` : ""}
            title="${escapeHTML(`${fullRankSuit}\n${char.name}\n${getAnimeTitle(char)}`)}"
            class="w-full rounded-lg overflow-hidden bg-white dark:bg-slate-900 ${r.border} ${ringCls} ${cursorCls} flex flex-col text-left">
            <div class="${r.badge} !border-0 overflow-hidden flex flex-col w-full h-full">
                <div class="relative aspect-[3/4] w-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    ${imgHtml}
                    <span class="absolute top-1 left-1 px-1 py-0.5 rounded text-[10px] font-bold ${suitStyle.badge}">
                        ${escapeHTML(rankLabel)}
                    </span>
                    ${lockBadgeHtml}
                    <span class="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[10px] font-bold ${r.badge}">
                        ${listPrefix}${r.tier}${dupLevel}
                    </span>
                </div>
                <div class="p-1 flex-1 flex flex-col justify-center text-center">
                    <div class="font-bold text-[11px] leading-tight line-clamp-1">${safeName}</div>
                </div>
            </div>
        </${tag}>
    `;
}

function renderSynergyUI() {
    const dealerWrap    = document.getElementById("syn-dealer-cards");
    const playerWrap    = document.getElementById("syn-player-cards");
    const dealerScoreEl = document.getElementById("syn-dealer-score");
    const synScoreEl    = document.getElementById("syn-player-synergy");
    const swapCostEl    = document.getElementById("syn-swap-cost-total");
    const netScoreEl    = document.getElementById("syn-player-net");
    const statusBanner  = document.getElementById("syn-status-banner");
    const actionRow     = document.getElementById("syn-action-controls");
    const betControls   = document.getElementById("syn-bet-controls");
    const betInput      = document.getElementById("syn-bet-input");
    const startBtn      = document.getElementById("syn-start-btn");
    const swapBtn       = document.getElementById("syn-swap-btn");
    const finishBtn     = document.getElementById("syn-finish-btn");

    if (!dealerWrap || !playerWrap || !betInput || !startBtn) return;

    const isGuest       = !currentUser;
    const ownedKeys     = getOwnedCollectionKeys();
    const hasMinCards   = ownedKeys.length >= 56;
    const isActive      = casinoSynState?.status === "ACTIVE";
    betInput.disabled   = casinoBusy || isActive;

    if (isGuest) {
        const clamped = Math.min(1000, Math.max(1, Math.floor(Number(betInput.value) || 10)));
        if (String(clamped) !== betInput.value) betInput.value = clamped;
    }

    if (!casinoSynState) {
        dealerWrap      .className      = "flex flex-wrap justify-center gap-2 min-h-[8.5rem] items-center";
        playerWrap      .className      = "flex flex-wrap justify-center gap-2 min-h-[8.5rem] items-center";
        dealerWrap      .innerHTML      = `<span class="text-sm text-slate-500">Place a bet and press Deal</span>`;
        playerWrap      .innerHTML      = "";
        dealerScoreEl   .textContent    = "—";
        synScoreEl      .textContent    = "—";
        swapCostEl      .textContent    = "0";
        netScoreEl      .textContent    = "—";

        statusBanner?.  classList.add       ("hidden");
        actionRow?.     classList.add       ("hidden");
        actionRow?.     classList.remove    ("grid");
        betControls?.   classList.remove    ("opacity-50", "pointer-events-none");

        const remSyn = getRemainingDailyCasinoBet("SYNERGY");
        startBtn.disabled = casinoBusy || !databaseReady || !hasMinCards || (!isGuest && (stars < 1 || remSyn < 1));

        return;
    }

    dealerWrap.className = "grid grid-cols-4 sm:grid-cols-7 gap-1.5 min-h-[8.5rem] items-center";
    playerWrap.className = "grid grid-cols-4 sm:grid-cols-7 gap-1.5 min-h-[8.5rem] items-center";

    const {
        status,
        bet,
        payout,
        playerHand              = [],
        dealerHand              = [],
        dealerLevels            = {},
        revealedDealerIndices   = null,
        revealing               = false,
        playerSynergy           = 0,
        swapCount               = 0,
        totalSwapCost           = 0,
        playerNetSynergy        = 0,
        dealerSynergy           = null
    } = casinoSynState;

    const nextSwapCost  = (swapCount + 1) * SYNERGY_SWAP_STEP;
    const canSwapPool   = ownedKeys.length > playerHand.length;

    if (isActive && casinoSynSelectedKey && !playerHand.includes(casinoSynSelectedKey)) casinoSynSelectedKey = null;
    const revealedSet = Array.isArray(revealedDealerIndices) ? new Set(revealedDealerIndices) : new Set(dealerHand.map((_, idx) => idx));

    dealerWrap.innerHTML = isActive
        ? Array.from({length: Math.max(14, dealerHand.length || 14)}, () => renderSynergyCardHTML(null, {hidden: true, isDealer: true})).join("")
        : dealerHand.map((k, idx) => renderSynergyCardHTML(revealedSet.has(idx) ? k : null, {
            hidden      : !revealedSet.has(idx),
            isDealer    : true,
            dealerLevel : dealerLevels[k] ?? 0
        })).join("");

    playerWrap.innerHTML = playerHand.map(k => renderSynergyCardHTML(k, {
        selectable  : isActive && !casinoBusy,
        selected    : isActive && casinoSynSelectedKey === k,
        isDealer    : false
    })).join("");

    if (isActive || dealerSynergy == null) dealerScoreEl.textContent = "?";
    else if (revealing || revealedSet.size < dealerHand.length) {
        const revealedKeys      = dealerHand.filter((_, idx) => revealedSet.has(idx));
        const partialSynergy    = getClientHandSynergy(revealedKeys, dealerLevels, 10);

        dealerScoreEl.textContent       = `${partialSynergy .toLocaleString()}+?`;
    } else dealerScoreEl.textContent    = `${dealerSynergy  .toLocaleString()}`;

    synScoreEl.textContent = `${playerSynergy       .toLocaleString()}`;
    swapCostEl.textContent = `${totalSwapCost       .toLocaleString()}`;
    netScoreEl.textContent = `${playerNetSynergy    .toLocaleString()}`;

    actionRow?.classList.toggle("hidden",   !isActive);
    actionRow?.classList.toggle("grid",     isActive);

    if (swapBtn) {
        swapBtn.textContent = `Swap: ${nextSwapCost}`;
        swapBtn.disabled    = casinoBusy || !isActive || !casinoSynSelectedKey || !canSwapPool;
    }

    if (finishBtn) finishBtn.disabled = casinoBusy || !isActive;

    betControls?.classList.toggle("opacity-50",             isActive);
    betControls?.classList.toggle("pointer-events-none",    isActive);

    const remSyn = getRemainingDailyCasinoBet("SYNERGY");
    startBtn.disabled = casinoBusy || isActive || !hasMinCards || (!isGuest && (stars < 1 || remSyn < 1));

    if (isActive || revealing) statusBanner?.classList.add("hidden");
    else if (statusBanner) {
        const profit    = payout - bet;
        const winCls    = "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
        const lossCls   = "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300";
        const isWin     = status === "WIN";

        statusBanner.textContent = isWin
            ? `You Win ${playerNetSynergy.toLocaleString()}-${Number(dealerSynergy).toLocaleString()}: Won ★ ${profit.toLocaleString()}`
            : `Dealer Wins ${Number(dealerSynergy).toLocaleString()}-${playerNetSynergy.toLocaleString()}: Lost ★ ${bet.toLocaleString()}`;

        statusBanner.className = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${isWin ? winCls : lossCls}`;
    }
}

function sortHandByRarity(keys = [], levelMap = null) {return [...keys].sort((a, b) => {
    const ta = SYNERGY_TIER_ORDER[characterMap?.get(a)?.rarity?.tier] || 0;
    const tb = SYNERGY_TIER_ORDER[characterMap?.get(b)?.rarity?.tier] || 0;

    if (tb !== ta) return tb - ta;

    const la = levelMap ? (levelMap[a] ?? 0) : getCharacterLevel(inventory?.[a] || 1);
    const lb = levelMap ? (levelMap[b] ?? 0) : getCharacterLevel(inventory?.[b] || 1);

    return lb - la;
})}

function buildGuestDealerHand(playerHand = []) {
    const globalKeys    = (characterPool || []).map(c => c.uniqueKey).filter(Boolean);
    const byTier        = new Map();

    for (const c of (characterPool || [])) {
        if (!c?.uniqueKey) continue;

        const t = c.rarity?.tier || "F";
        if (!byTier.has(t)) byTier.set(t, []);
        byTier.get(t).push(c.uniqueKey);
    }

    const picked        = [];
    const used          = new Set();
    const dealerLevels  = {};

    for (const pKey of playerHand) {
        const pChar         = characterMap?.get(pKey);
        const tier          = pChar?.rarity?.tier || "F";
        const mirroredLevel = getCharacterLevel(inventory?.[pKey] || 1);
        const candidates    = shuffleArrayCopy(byTier.get(tier) || globalKeys);
        const chosen        = candidates.find(k => !used.has(k)) || candidates[0];

        if (chosen) {
            picked          .push   (chosen);
            used            .add    (chosen);

            dealerLevels[chosen] = mirroredLevel;
        }
    }

    const maxPlayerRank = Math.max(...playerHand.map    (k => SYNERGY_TIER_ORDER    [characterMap?.get(k)?.rarity?.tier] || 1));
    const eligiblePool  = globalKeys.filter             (k => (SYNERGY_TIER_ORDER   [characterMap?.get(k)?.rarity?.tier] || 1) <= maxPlayerRank);

    for (const k of shuffleArrayCopy(eligiblePool)) {
        if (picked.length >= 14) break;

        if (!used.has(k)) {
            picked          .push   (k);
            used            .add    (k);

            dealerLevels[k] = 0;
        }
    }

    return {
        dealerHand      : sortHandByRarity(picked.slice(0, 14), dealerLevels),
        dealerLevels,
        dealerPoolSize  : globalKeys.length
    };
}

function handleGuestSynergy(subAction, bet = 10) {
    const ownedKeys = getOwnedCollectionKeys();
    const fakeBet   = Math.min(1000, Math.max(1, Math.floor(Number(bet) || 10)));

    if (subAction === "START") {
        if (ownedKeys.length < 56) return null;

        const playerHand                                    = sortHandByRarity      (shuffleArrayCopy(ownedKeys).slice(0, 7));
        const {dealerHand, dealerLevels, dealerPoolSize}    = buildGuestDealerHand  (playerHand);
        const playerSynergy                                 = getClientHandSynergy  (playerHand);

        casinoSynGuestState = {
            bet             : fakeBet,
            playerHand,
            dealerHand,
            dealerLevels,
            dealerPoolSize,
            swapCount       : 0,
            totalSwapCost   : 0
        };

        casinoSynSelectedKey = null;

        return {
            status              : "ACTIVE",
            bet                 : fakeBet,
            payout              : 0,
            playerHand,
            dealerHand          : [],
            dealerPoolSize,
            playerSynergy,
            swapCount           : 0,
            totalSwapCost       : 0,
            playerNetSynergy    : playerSynergy,
            dealerSynergy       : null
        };
    }

    if (!casinoSynGuestState) return null;
    const activeBet = casinoSynGuestState.bet || fakeBet;

    if (subAction === "SWAP") {
        const idx = casinoSynGuestState.playerHand.indexOf(casinoSynSelectedKey);
        if (idx === -1) return null;

        const inHandSet = new Set(casinoSynGuestState.playerHand);
        const pool      = ownedKeys.filter(k => !inHandSet.has(k));

        if (!pool.length) return null;

        const replacement   = pool[Math.floor(Math.random() * pool.length)];
        const cost          = (casinoSynGuestState.swapCount + 1) * SYNERGY_SWAP_STEP;

        casinoSynGuestState.playerHand[idx] =   replacement;
        casinoSynGuestState.playerHand      =   sortHandByRarity(casinoSynGuestState.playerHand);
        casinoSynGuestState.swapCount       +=  1;
        casinoSynGuestState.totalSwapCost   +=  cost;
        casinoSynSelectedKey                =   replacement;
        const playerSynergy                 =   getClientHandSynergy(casinoSynGuestState.playerHand);

        return {
            status              : "ACTIVE",
            bet                 : activeBet,
            payout              : 0,
            playerHand          : [...casinoSynGuestState.playerHand],
            dealerHand          : [],
            dealerPoolSize      : casinoSynGuestState.dealerPoolSize,
            playerSynergy,
            swapCount           : casinoSynGuestState.swapCount,
            totalSwapCost       : casinoSynGuestState.totalSwapCost,
            playerNetSynergy    : playerSynergy - casinoSynGuestState.totalSwapCost,
            dealerSynergy       : null
        };
    }

    if (subAction === "FINISH") {
        const playerSynergy     = getClientHandSynergy(casinoSynGuestState.playerHand, null, 7);
        const playerNetSynergy  = playerSynergy - casinoSynGuestState.totalSwapCost;
        const dealerSynergy     = getClientHandSynergy(casinoSynGuestState.dealerHand, casinoSynGuestState.dealerLevels, 10);
        const won               = playerNetSynergy > dealerSynergy;
        const payout            = won ? activeBet * 2 : 0;

        const res = {
            status          : won ? "WIN" : "LOSE",
            bet             : activeBet,
            payout,
            playerHand      : [...casinoSynGuestState.playerHand],
            dealerHand      : [...casinoSynGuestState.dealerHand],
            dealerLevels    : {...casinoSynGuestState.dealerLevels},
            dealerPoolSize  : casinoSynGuestState.dealerPoolSize,
            playerSynergy,
            swapCount       : casinoSynGuestState.swapCount,
            totalSwapCost   : casinoSynGuestState.totalSwapCost,
            playerNetSynergy,
            dealerSynergy
        };

        casinoSynGuestState     = null;
        casinoSynSelectedKey    = null;

        return res;
    }

    return null;
}

async function runSynergyAction(subAction) {
    if (casinoBusy || !databaseReady) return;

    const betInput  = document.getElementById("syn-bet-input");
    const rawBet    = Math.floor(Number(betInput?.value) || 1);
    const bet       = currentUser ? Math.max(1, rawBet) : Math.min(1000, Math.max(1, rawBet));

    if (subAction === "START") {
        if (getOwnedCollectionKeys().length < 56) {
            alert("You need at least 56 cards in your collection to play Synergy");
            return;
        }

        if (currentUser) {
            const remSyn = getRemainingDailyCasinoBet("SYNERGY");

            if (remSyn < 1) {
                alert("Reached daily bet limit");
                return;
            }

            if (bet > remSyn) {
                alert(`Exceeds daily bet limit (${remSyn.toLocaleString()} Stars remaining)`);
                return;
            }

            if (stars < bet) {
                alert("Not enough stars");
                return;
            }
        }

        if (betInput) betInput.value = bet;
    }

    casinoBusy = true;
    renderSynergyUI();

    try {
        let nextGame = null;

        if (!currentUser) nextGame = handleGuestSynergy(subAction, bet);
        else {
            const payload = subAction === "START"
                ? {action: "CASINO_SYNERGY", subAction: "START", bet}
                : subAction === "SWAP"
                    ? {action: "CASINO_SYNERGY", subAction: "SWAP", removeKey: casinoSynSelectedKey}
                    : {action: "CASINO_SYNERGY", subAction: "FINISH"};

            const res = await sendGachaAction(payload);
            if (res?.game) nextGame = res.game;
        }

        if (nextGame) {
            if (subAction === "FINISH" && Array.isArray(nextGame.dealerHand) && nextGame.dealerHand.length > 0) {
                const totalCards    = nextGame.dealerHand.length;
                const bottomStart   = Math.max(0, totalCards - 7);
                const revealed      = new Set();

                for (let i = bottomStart; i < totalCards; i++) revealed.add(i);

                casinoSynState = {
                    ...nextGame,
                    status                  : "REVEALING",
                    revealing               : true,
                    revealedDealerIndices   : Array.from(revealed)
                };

                renderSynergyUI();

                for (let idx = totalCards - 1; idx >= 0; idx--) {
                    if (revealed.has(idx)) continue;
                    await casinoSleep(1000);
                    revealed.add(idx);

                    casinoSynState = {
                        ...nextGame,
                        status                  : "REVEALING",
                        revealing               : idx > 0,
                        revealedDealerIndices   : Array.from(revealed)
                    };

                    renderSynergyUI();
                }

                casinoSynState = {
                    ...nextGame,
                    revealing               : false,
                    revealedDealerIndices   : Array.from({length: totalCards}, (_, i) => i)
                };
            } else casinoSynState = nextGame;
        }
    } finally {
        casinoBusy = false;
        renderSynergyUI();
    }
}

function ensureRouletteWheelBuilt() {
    if (casinoRlWheelBuilt) return;

    const svg = document.getElementById("rl-wheel-svg");
    if (!svg) return;

    const sliceDeg  = 360 / ROULETTE_WHEEL_ORDER.length;
    const outerR    = 99;
    const innerR    = 48;
    const labelR    = 83;
    const parts     = [];

    ROULETTE_WHEEL_ORDER.forEach((num, idx) => {
        const startDeg  = idx * sliceDeg - sliceDeg / 2 - 90;
        const endDeg    = startDeg + sliceDeg;
        const startRad  = (startDeg * Math.PI) / 180;
        const endRad    = (endDeg   * Math.PI) / 180;

        const x1 = (outerR * Math.cos(startRad)).toFixed(3);
        const y1 = (outerR * Math.sin(startRad)).toFixed(3);
        const x2 = (outerR * Math.cos(endRad))  .toFixed(3);
        const y2 = (outerR * Math.sin(endRad))  .toFixed(3);
        const x3 = (innerR * Math.cos(endRad))  .toFixed(3);
        const y3 = (innerR * Math.sin(endRad))  .toFixed(3);
        const x4 = (innerR * Math.cos(startRad)).toFixed(3);
        const y4 = (innerR * Math.sin(startRad)).toFixed(3);

        const fill      = num === 0 ? "#059669" : (ROULETTE_RED_NUMBERS.has(num) ? "#e11d48" : "#0f172a");
        const midDeg    = idx * sliceDeg;
        const midRad    = ((midDeg - 90) * Math.PI) / 180;
        const lx        = (labelR * Math.cos(midRad)).toFixed(3);
        const ly        = (labelR * Math.sin(midRad)).toFixed(3);

        parts.push(
            `<path d="M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z" fill="${fill}" stroke="#334155" stroke-width="0.6"/>`,
            `<text x="${lx}" y="${ly}" fill="#ffffff" font-size="7.2" font-weight="800" text-anchor="middle" dominant-baseline="central" transform="rotate(${midDeg} ${lx} ${ly})">${num}</text>`
        );
    });

    svg.innerHTML       = parts.join("");
    casinoRlWheelBuilt  = true;
}

function setRouletteWheelPose(wheelDeg, ballDeg, ballTopPx) {
    const wheelEl   = document.getElementById("rl-wheel");
    const armEl     = document.getElementById("rl-ball-arm");
    const ballEl    = document.getElementById("rl-ball");

    if (wheelEl)    wheelEl.style.transform = `rotate(${wheelDeg}deg)`;
    if (armEl)      armEl.style.transform   = `rotate(${ballDeg}deg)`;
    if (ballEl)     ballEl.style.top        = `${ballTopPx}px`;
}

function animateRouletteSpin(targetPocket) {
    cancelAnimationFrame(casinoRlAnimRafId);

    const container         = document.getElementById("rl-wheel")?.parentElement;
    const size              = container ? container.offsetWidth : 288;
    const trackTop          = Math.round(size * 0.045);
    const pocketTop         = Math.round(size * 0.195);
    const pocketIdx         = Math.max(0, ROULETTE_WHEEL_ORDER.indexOf(targetPocket));
    const sliceDeg          = 360 / ROULETTE_WHEEL_ORDER.length;
    const pocketOffsetDeg   = pocketIdx * sliceDeg;
    const startWheel        = casinoRlWheelAngle;
    const startBall         = casinoRlBallAngle;
    const endWheel          = startWheel + 1440 + Math.random() * 360;
    const normalizedWheel   = ((endWheel % 360) + 360) % 360;
    const finalPocketAngle  = (normalizedWheel + pocketOffsetDeg) % 360;
    const baseTargetBall    = startBall - 2160;
    const currentMod        = ((baseTargetBall % 360) + 360) % 360;

    let delta = finalPocketAngle - currentMod;
    if (delta > 0) delta -= 360;

    const endBall       = baseTargetBall + delta;
    const duration      = 3400;
    const dropStart     = 0.52;
    const settleStart   = 0.78;
    const startTime     = performance.now();

    return new Promise((resolve) => {
        const step = (now) => {
            const t         = Math.min(1, (now - startTime) / duration);
            const wheelEase = 1 - Math.pow(1 - t, 3.2);
            const curWheel  = startWheel + (endWheel - startWheel) * wheelEase;

            let curBall, curTop;

            if (t < dropStart) {
                const p             = t / dropStart;
                const ease          = 1 - Math.pow(1 - p, 1.35);
                curBall             = startBall + (endBall - startBall) * (ease * 0.78);
                curTop              = trackTop;
            } else if (t < settleStart) {
                const p             = (t - dropStart) / (settleStart - dropStart);
                const dropEase      = 1 - Math.pow(1 - p, 2);
                const bounce        = Math.abs(Math.sin(p * Math.PI * 2.5)) * (1 - p) * 11;
                curBall             = startBall + (endBall - startBall) * (0.78 + dropEase * 0.19);
                curTop              = trackTop + (pocketTop - trackTop) * dropEase - bounce;
            } else {
                const p             = (t - settleStart) / (1 - settleStart);
                const settleEase    = 1 - Math.pow(1 - p, 2.5);
                const capturedBall  = (curWheel + pocketOffsetDeg);
                const preCapture    = startBall + (endBall - startBall) * 0.97;
                const diff          = ((capturedBall - preCapture + 540) % 360) - 180;

                curBall = preCapture + diff * settleEase;
                curTop  = pocketTop;
            }

            setRouletteWheelPose(curWheel, curBall, curTop);

            if (t < 1) casinoRlAnimRafId = requestAnimationFrame(step);
            else {
                casinoRlWheelAngle  = ((endWheel % 360) + 360) % 360;
                casinoRlBallAngle   = (casinoRlWheelAngle + pocketOffsetDeg) % 360;

                setRouletteWheelPose    (casinoRlWheelAngle, casinoRlBallAngle, pocketTop);
                resolve                 ();
            }
        };

        casinoRlAnimRafId = requestAnimationFrame(step);
    });
}

let casinoRlGridBuilt = false;

function ensureRouletteNumberGridBuilt() {
    if (casinoRlGridBuilt) return;

    const grid = document.getElementById("rl-number-grid");
    if (!grid) return;

    const buttons = [];

    for (let num = 1; num <= 36; num++) {
        const bgClass = ROULETTE_RED_NUMBERS.has(num) ? "bg-[#e11d48]" : "bg-[#0f172a]";
        buttons.push(`<button type="button" data-rl-number="${num}" class="rl-number-btn py-1.5 rounded-lg ${bgClass} hover:opacity-90 text-white text-xs sm:text-sm font-bold tabular-nums transition">${num}</button>`);
    }

    grid.innerHTML      = buttons.join("");
    casinoRlGridBuilt   = true;
}

function renderRouletteUI() {
    ensureRouletteWheelBuilt        ();
    ensureRouletteNumberGridBuilt   ();

    const betInput      = document.getElementById("rl-bet-input");
    const spinBtn       = document.getElementById("rl-spin-btn");
    const readoutEl     = document.getElementById("rl-center-readout");
    const pocketNumEl   = document.getElementById("rl-pocket-number");
    const pocketColEl   = document.getElementById("rl-pocket-color");
    const statusBanner  = document.getElementById("rl-status-banner");
    const isGuest       = !currentUser;

    if (!betInput || !spinBtn) return;
    betInput.disabled = casinoBusy;

    const remRl = getRemainingDailyCasinoBet("ROULETTE");
    spinBtn.disabled = casinoBusy || !databaseReady || (!isGuest && (stars < 1 || remRl < 1));

    if (isGuest) {
        const clamped = Math.min(1000, Math.max(1, Math.floor(Number(betInput.value) || 10)));
        if (String(clamped) !== betInput.value) betInput.value = clamped;
    }

    document.querySelectorAll(".rl-color-btn").forEach(btn => {
        const isSelected    = casinoRlSelectedBet.type === "COLOR" && btn.dataset.rlColor === casinoRlSelectedBet.value;
        btn.disabled        = casinoBusy;

        btn.classList.toggle("opacity-55", !isSelected);
    });

    document.querySelectorAll(".rl-number-btn").forEach(btn => {
        const isSelected    = casinoRlSelectedBet.type === "NUMBER" && Number(btn.dataset.rlNumber) === casinoRlSelectedBet.value;
        btn.disabled        = casinoBusy;

        btn.classList.toggle("opacity-55", !isSelected);
    });

    const colorStyles = {
        RED     : "bg-[#e11d48] text-white",
        BLACK   : "bg-[#0f172a] text-white",
        GREEN   : "bg-[#059669] text-white"
    };

    const colorLabels = {
        RED     : "Red",
        BLACK   : "Black",
        GREEN   : "Green"
    };

    if (!casinoRlLastSpin || casinoRlLastSpin.spinning) {
        readoutEl?.     classList.add("hidden");
        statusBanner?.  classList.add("hidden");
    } else {
        const {pocket, resultColor, bet, payout, won}   = casinoRlLastSpin;
        const label                                     = colorLabels[resultColor] || resultColor;

        if (readoutEl) {
            readoutEl.className         = `absolute w-24 h-24 sm:w-28 sm:h-28 rounded-full flex flex-col items-center justify-center pointer-events-none transition-all ${colorStyles[resultColor] || ""}`;
            pocketNumEl.textContent     = pocket;
            pocketColEl.textContent     = label;
        }

        const profit    = payout - bet;
        const winCls    = "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
        const lossCls   = "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300";

        if (statusBanner) {
            statusBanner.textContent = won
                ? `${pocket}-${label}: Won ★ ${profit  .toLocaleString()}`
                : `${pocket}-${label}: Lost ★ ${bet    .toLocaleString()}`;

            statusBanner.className = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${won ? winCls : lossCls}`;
        }
    }
}

async function runRouletteSpin() {
    if (casinoBusy || !databaseReady) return;

    const betInput  = document.getElementById("rl-bet-input");
    const rawBet    = Math.floor(Number(betInput.value) || 1);
    const bet       = currentUser ? Math.max(1, rawBet) : Math.min(1000, Math.max(1, rawBet));

    if (currentUser) {
        const remRl = getRemainingDailyCasinoBet("ROULETTE");

        if (remRl < 1) {
            alert("Reached daily bet limit");
            return;
        }

        if (bet > remRl) {
            alert(`Exceeds daily bet limit (${remRl.toLocaleString()} Stars remaining)`);
            return;
        }

        if (stars < bet) {
            alert("Not enough stars");
            return;
        }
    }

    betInput.value      = bet;
    casinoBusy          = true;
    casinoRlLastSpin    = {spinning: true};

    renderRouletteUI();

    try {
        let spinResult = null;

        if (!currentUser) {
            const pocket        = Math.floor(Math.random() * 37);
            const resultColor   = pocket === 0 ? "GREEN" : (ROULETTE_RED_NUMBERS.has(pocket) ? "RED" : "BLACK");
            const isNumberBet   = casinoRlSelectedBet.type === "NUMBER";
            const won           = isNumberBet ? pocket === casinoRlSelectedBet.value : resultColor === casinoRlSelectedBet.value;
            const payout        = won ? ((isNumberBet || casinoRlSelectedBet.value === "GREEN") ? bet * 36 : bet * 2) : 0;

            spinResult = {
                pocket,
                resultColor,
                betColor    : isNumberBet ? null : casinoRlSelectedBet.value,
                betNumber   : isNumberBet ? casinoRlSelectedBet.value : null,
                bet,
                payout,
                won
            };
        } else {
            const payload   = casinoRlSelectedBet.type === "NUMBER" ? {action: "CASINO_ROULETTE", bet, number: casinoRlSelectedBet.value} : {action: "CASINO_ROULETTE", bet, color: casinoRlSelectedBet.value};
            const res       = await sendGachaAction(payload);

            if (res?.spin) spinResult = res.spin;
        }

        if (spinResult) {
            await animateRouletteSpin(spinResult.pocket);
            casinoRlLastSpin = spinResult;
        } else casinoRlLastSpin = null;
    } finally {
        casinoBusy = false;
        renderRouletteUI();
    }
}

function generateClientFxPath(pair, side = "LONG") {
    const configs = {
        "USD/JPY": {base: 154.200,  vol: 0.00024, drift:  0.000000, jumpProb: 0.020, jumpScale: 0.0022, swapLong: -0.0003, swapShort: -0.0003, spread: 0.00016},
        "AUD/JPY": {base: 100.400,  vol: 0.00033, drift:  0.000000, jumpProb: 0.018, jumpScale: 0.0030, swapLong:  0.0001, swapShort: -0.0006, spread: 0.00020},
        "GBP/JPY": {base: 195.800,  vol: 0.00056, drift:  0.000000, jumpProb: 0.032, jumpScale: 0.0044, swapLong: -0.0004, swapShort: -0.0004, spread: 0.00030},
        "EUR/CHF": {base: 0.94200,  vol: 0.00008, drift:  0.000000, jumpProb: 0.012, jumpScale: 0.0040, swapLong: -0.0004, swapShort: -0.0004, spread: 0.00018},
        "ZAR/JPY": {base: 8.4500,   vol: 0.00036, drift: -0.000012, jumpProb: 0.020, jumpScale: 0.0028, swapLong:  0.0012, swapShort: -0.0020, spread: 0.00032},
        "TRY/JPY": {base: 4.3800,   vol: 0.00052, drift: -0.000018, jumpProb: 0.028, jumpScale: 0.0042, swapLong:  0.0018, swapShort: -0.0028, spread: 0.00045}
    };

    const cfg       = configs[pair] || configs["USD/JPY"];
    const randn     = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
    const dir       = side === "LONG" ? 1 : -1;
    const candles   = [];
    let price       = cfg.base * (1 + dir * cfg.spread);
    let regime      = 0;

    for (let cIdx = 0; cIdx < 60; cIdx++) {
        const open  = price;
        const ticks = [];
        let high    = open;
        let low     = open;
        let close   = open;

        for (let t = 0; t < 5; t++) {
            if (Math.random() < 0.05) regime = (Math.random() - 0.50) * cfg.vol * 1.6;
            let ret = cfg.drift + regime + randn() * cfg.vol;

            if (Math.random() < cfg.jumpProb) {
                const jumpDir   =   Math.random() < 0.50 ? -1 : 1;
                ret             +=  jumpDir * cfg.jumpScale * (0.65 + Math.random() * 0.95);
            }

            close = Math.max(cfg.base * 0.4, close * (1 + ret));

            if (close > high) high = close;
            if (close < low)  low  = close;

            ticks.push({high, low, close});
        }

        candles.push({open, high, low, close, ticks});
        price = close;
    }

    return {candles, swapLong: cfg.swapLong, swapShort: cfg.swapShort, spread: cfg.spread};
}

function getVisibleFxCandles(candles, secIdx) {
    const clampedSec    = Math.min(299, Math.max(0, secIdx));
    const candleIdx     = Math.floor(clampedSec / 5);
    const subIdx        = clampedSec % 5;
    const visible       = [];

    for (let i = 0; i < candleIdx; i++) visible.push(candles[i]);

    const cur       = candles[candleIdx];
    const subTick   = cur.ticks?.[subIdx] || cur;
    let liveHigh    = cur.open;
    let liveLow     = cur.open;

    for (let s = 0; s <= subIdx; s++) {
        const pt = cur.ticks?.[s] || cur;

        if (pt.high > liveHigh) liveHigh = pt.high;
        if (pt.low  < liveLow)  liveLow  = pt.low;
    }

    visible.push({
        open    : cur.open,
        high    : liveHigh,
        low     : liveLow,
        close   : subTick.close
    });

    return visible;
}

function calcFxPortfolioState(run, secIdx) {
    const visible   = getVisibleFxCandles(run.candles, secIdx);
    const price     = visible[visible.length - 1].close;
    const elapsed   = secIdx + 1;
    let totalMargin = 0;
    let totalPnl    = 0;
    let totalSwap   = 0;

    for (const pos of run.positions) {
        const dir       = pos.side === "LONG" ? 1 : -1;
        const swapRate  = pos.side === "LONG" ? run.swapLong : run.swapShort;
        const move      = ((price - pos.entryPrice) / pos.entryPrice) * dir;
        const posPnl    = pos.bet * pos.leverage * move;
        const posSwap   = pos.bet * swapRate * Math.max(0, elapsed - pos.openSec);

        totalMargin += pos.bet;
        totalPnl    += posPnl;
        totalSwap   += posSwap;
    }

    const swapTotal     = Math.round(totalSwap);
    const rawEquity     = totalMargin + totalPnl + swapTotal;
    const marginCut     = totalMargin * 0.15;
    const takeProfit    = totalMargin * 4;
    let weightedEntry   = 0;
    let weightedLiq     = 0;

    if (totalMargin > 0) {for (const pos of run.positions) {
            const dir       =   pos.side === "LONG" ? 1 : -1;
            const liqPrice  =   pos.entryPrice * (1 - dir * (0.85 / pos.leverage));
            const w         =   pos.bet / totalMargin;
            weightedEntry   +=  pos.entryPrice * w;
            weightedLiq     +=  liqPrice * w;
    }}

    return {
        price,
        totalMargin,
        swapTotal,
        weightedEntry,
        weightedLiq,
        equity          : Math.min(takeProfit, Math.max(0, Math.round(rawEquity))),
        liquidated      : totalMargin > 0 && rawEquity <= marginCut,
        takeProfitHit   : totalMargin > 0 && rawEquity >= takeProfit
    };
}

function renderForexChart(candles, entryPrice, liqPrice, _) {
    const svg = document.getElementById("fx-chart-svg");
    if (!svg) return;

    if (!candles || candles.length === 0) {
        svg.innerHTML = "";
        return;
    }

    let minP = Infinity;
    let maxP = -Infinity;

    for (const c of candles) {
        if (c.low   < minP) minP = c.low;
        if (c.high  > maxP) maxP = c.high;
    }

    if (entryPrice != null) {
        minP = Math.min(minP, entryPrice);
        maxP = Math.max(maxP, entryPrice);
    }

    const pad = (maxP - minP) * 0.12 || maxP * 0.002;

    minP -= pad;
    maxP += pad;

    const W     = 600;
    const H     = 240;
    const toY   = (p) => (H - ((p - minP) / (maxP - minP)) * H).toFixed(2);
    const slotW = W / 60;
    const bodyW = Math.max(4, slotW * 0.62);
    const parts = [];

    for (let g = 1; g <= 3; g++) {
        const gy = ((H / 4) * g).toFixed(1);
        parts.push(`<line x1="0" y1="${gy}" x2="${W}" y2="${gy}" stroke="#1e293b" stroke-width="1"/>`);
    }

    if (entryPrice != null) {
        const ey = toY(entryPrice);
        parts.push(`<line x1="0" y1="${ey}" x2="${W}" y2="${ey}" stroke="#facc15" stroke-width="1.2" stroke-dasharray="4 3"/>`);
    }

    if (liqPrice != null && liqPrice >= minP && liqPrice <= maxP) {
        const ly = toY(liqPrice);
        parts.push(`<line x1="0" y1="${ly}" x2="${W}" y2="${ly}" stroke="#f43f5e" stroke-width="1.2" stroke-dasharray="2 2"/>`);
    }

    candles.forEach((c, i) => {
        const isPos = c.close >= c.open;
        const color = isPos ? "#3b82f6" : "#ef4444";
        const cx    = (i + 0.5) * slotW;
        const yHigh = toY(c.high);
        const yLow  = toY(c.low);
        const yTop  = toY(Math.max(c.open, c.close));
        const yBot  = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(1.5, Number(yBot) - Number(yTop));

        parts.push(
            `<line x1="${cx.toFixed(2)}" y1="${yHigh}" x2="${cx.toFixed(2)}" y2="${yLow}" stroke="${color}" stroke-width="1.2"/>`,
            `<rect x="${(cx - bodyW / 2).toFixed(2)}" y="${yTop}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" fill="${color}"/>`
        );
    });

    svg.innerHTML = parts.join("");
}

function renderForexUI() {
    const meta          = FX_PAIR_META[casinoFxPair] || FX_PAIR_META["USD/JPY"];
    const isGuest       = !currentUser;
    const isRunning     = Boolean(casinoFxRun && !casinoFxRun.done);
    const betInput      = document.getElementById("fx-bet-input");
    const closeBtn      = document.getElementById("fx-close-btn");
    const longBtn       = document.getElementById("fx-long-btn");
    const shortBtn      = document.getElementById("fx-short-btn");
    const overlay       = document.getElementById("fx-chart-overlay");
    const banner        = document.getElementById("fx-status-banner");
    const activeSide    = isRunning ? casinoFxRun.positions[0]?.side : null;

    if (!betInput) return;
    betInput.disabled = casinoBusy;

    const remFx = getRemainingDailyCasinoBet("FX");

    longBtn     .disabled = casinoBusy || !databaseReady || (!isGuest && (stars < 1 || remFx < 1)) || activeSide === "SHORT";
    shortBtn    .disabled = casinoBusy || !databaseReady || (!isGuest && (stars < 1 || remFx < 1)) || activeSide === "LONG";

    if (isGuest) {
        const clamped = Math.min(1000, Math.max(1, Math.floor(Number(betInput.value) || 10)));
        if (String(clamped) !== betInput.value) betInput.value = clamped;
    }

    closeBtn.classList.toggle("hidden", !isRunning);
    closeBtn.disabled = casinoBusy || !isRunning;

    document.querySelectorAll(".fx-pair-btn").forEach(btn => {
        const active = btn.dataset.fxPair === casinoFxPair;
        btn.disabled = casinoBusy || isRunning;

        btn.className = `fx-pair-btn py-1.5 px-2 rounded-lg border text-left transition ${active
            ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
            : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 opacity-75 hover:opacity-100"
        }`;
    });

    document.querySelectorAll(".fx-lev-btn").forEach(btn => {
        const active = Number(btn.dataset.fxLev) === casinoFxLeverage;
        btn.disabled = casinoBusy;

        btn.className = `fx-lev-btn py-1.5 rounded-lg border text-xs font-bold tabular-nums transition ${active
            ? "border-indigo-500 bg-indigo-600 text-white"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        }`;
    });

    document.getElementById("fx-pair-title")    .textContent = casinoFxPair;
    document.getElementById("fx-pair-desc")     .textContent = meta.desc;

    if (!casinoFxRun) {
        document.getElementById("fx-current-price") .textContent = "—";
        document.getElementById("fx-timer-label")   .textContent = "05:00";
        document.getElementById("fx-equity-label")  .textContent = "—";
        document.getElementById("fx-swap-label")    .textContent = "★ 0";
        document.getElementById("fx-liq-price")     .textContent = "—";
        document.getElementById("fx-pos-count")     .textContent = "0";

        overlay?.   classList.remove    ("hidden");
        banner?.    classList.add       ("hidden");

        renderForexChart([], null, null, "LONG");
        return;
    }

    overlay?.classList.add("hidden");

    const shownCandles  = getVisibleFxCandles(casinoFxRun.candles, casinoFxRun.sec);
    const remainingSec  = Math.max(0, 299 - casinoFxRun.sec);
    const mm            = String(Math.floor(remainingSec / 60)).padStart(2, "0");
    const ss            = String(remainingSec % 60).padStart(2, "0");

    document.getElementById("fx-current-price") .textContent = casinoFxRun.currentPrice.toFixed(meta.decimals);
    document.getElementById("fx-timer-label")   .textContent = `${mm}:${ss}`;
    document.getElementById("fx-equity-label")  .textContent = `★ ${casinoFxRun.equity.toLocaleString()}`;
    document.getElementById("fx-swap-label")    .textContent = `★ ${casinoFxRun.swapTotal >= 0 ? "+" : ""}${casinoFxRun.swapTotal}`;
    document.getElementById("fx-liq-price")     .textContent = casinoFxRun.liqPrice ? casinoFxRun.liqPrice.toFixed(meta.decimals) : "—";
    document.getElementById("fx-pos-count")     .textContent = String(casinoFxRun.positions.length);

    renderForexChart(shownCandles, casinoFxRun.entryPrice, casinoFxRun.liqPrice, "LONG");

    if (!casinoFxRun.done) banner?.classList.add("hidden");
    else if (banner) {
        const profit    = casinoFxRun.payout - casinoFxRun.totalMargin;
        const winCls    = "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
        const lossCls   = "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300";

        if (casinoFxRun.liquidated) {
            banner.textContent  = `Margin Call: Lost ★ ${casinoFxRun.totalMargin.toLocaleString()}`;
            banner.className    = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${lossCls}`;
        } else if (profit >= 0) {
            banner.textContent  = `Closed: Won ★ ${profit.toLocaleString()}`;
            banner.className    = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${winCls}`;
        } else {
            banner.textContent  = `Closed: Lost ★ ${Math.abs(profit).toLocaleString()}`;
            banner.className    = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${lossCls}`;
        }
    }
}

async function settleForexPosition(secIdx) {
    clearInterval(casinoFxTimerId);
    casinoFxTimerId = 0;

    if (!casinoFxRun || casinoFxRun.done) return;

    const clampedSec            = Math.min(299, Math.max(0, secIdx));
    const state                 = calcFxPortfolioState(casinoFxRun, clampedSec);
    casinoFxRun.sec             = clampedSec;
    casinoFxRun.currentPrice    = state.price;
    casinoFxRun.equity          = state.liquidated ? 0 : state.equity;
    casinoFxRun.swapTotal       = state.swapTotal;
    casinoFxRun.liquidated      = state.liquidated;
    casinoFxRun.payout          = state.liquidated ? 0 : state.equity;
    casinoFxRun.done            = true;

    if (currentUser && casinoFxRun.sessionId) {
        casinoBusy = true;
        renderForexUI();

        try {
            const res = await sendGachaAction({
                action      : "CASINO_FX",
                subAction   : "SETTLE",
                sessionId   : casinoFxRun.sessionId,
                closeSec    : clampedSec
            });

            if (res?.result) {
                casinoFxRun.payout      = res.result.payout;
                casinoFxRun.liquidated  = res.result.liquidated;
                casinoFxRun.swapTotal   = res.result.swapTotal;
            }
        } finally {casinoBusy = false}
    }

    renderForexUI();
}

function startFxSecondLoop() {
    clearInterval(casinoFxTimerId);

    casinoFxTimerId = setInterval(() => {
        if (!casinoFxRun || casinoFxRun.done) {
            clearInterval(casinoFxTimerId);
            return;
        }

        const nextSec = casinoFxRun.sec + 1;

        if (nextSec > 299) {
            settleForexPosition(299);
            return;
        }

        const state                 = calcFxPortfolioState(casinoFxRun, nextSec);
        casinoFxRun.sec             = nextSec;
        casinoFxRun.currentPrice    = state.price;
        casinoFxRun.equity          = state.equity;
        casinoFxRun.swapTotal       = state.swapTotal;
        casinoFxRun.entryPrice      = state.weightedEntry;
        casinoFxRun.liqPrice        = state.weightedLiq;

        if (state.liquidated || state.takeProfitHit) settleForexPosition(nextSec);
        else renderForexUI();
    }, 1000);
}

async function placeForexOrder(side) {
    if (casinoBusy || !databaseReady) return;

    const betInput  = document.getElementById("fx-bet-input");
    const rawBet    = Math.floor(Number(betInput.value) || 1);
    const bet       = currentUser ? Math.max(1, rawBet) : Math.min(1000, Math.max(1, rawBet));

    if (currentUser) {
        const remFx = getRemainingDailyCasinoBet("FX");

        if (remFx < 1) {
            alert("Reached daily bet limit");
            return;
        }

        if (bet > remFx) {
            alert(`Exceeds daily bet limit (${remFx.toLocaleString()} Stars remaining)`);
            return;
        }

        if (stars < bet) {
            alert("Not enough stars");
            return;
        }
    }

    betInput.value = bet;

    casinoBusy = true;
    renderForexUI();

    try {
        if (!casinoFxRun || casinoFxRun.done) {
            if (!currentUser) {
                const sim       = generateClientFxPath(casinoFxPair, side);
                const openPrice = sim.candles[0].open;

                casinoFxRun = {
                    sessionId       : null,
                    pair            : casinoFxPair,
                    candles         : sim.candles,
                    swapLong        : sim.swapLong,
                    swapShort       : sim.swapShort,
                    spread          : sim.spread,
                    sec             : 0,
                    currentPrice    : openPrice,
                    positions       : [{side, leverage: casinoFxLeverage, bet, entryPrice: openPrice, openSec: 0}],
                    totalMargin     : bet,
                    entryPrice      : openPrice,
                    liqPrice        : openPrice * (1 - (side === "LONG" ? 1 : -1) * (0.85 / casinoFxLeverage)),
                    equity          : bet,
                    swapTotal       : 0,
                    payout          : 0,
                    liquidated      : false,
                    done            : false
                };
            } else {
                const res = await sendGachaAction({
                    action      : "CASINO_FX",
                    subAction   : "OPEN",
                    pair        : casinoFxPair,
                    side,
                    leverage    : casinoFxLeverage,
                    bet
                });

                if (!res?.session) return;

                const s         = res.session;
                const openPrice = s.candles[0].open;

                casinoFxRun = {
                    sessionId       : s.sessionId,
                    pair            : s.pair,
                    candles         : s.candles,
                    swapLong        : s.swapLong,
                    swapShort       : s.swapShort,
                    spread          : s.spread,
                    sec             : 0,
                    currentPrice    : openPrice,
                    positions       : s.positions,
                    totalMargin     : s.totalMargin,
                    entryPrice      : openPrice,
                    liqPrice        : openPrice * (1 - (side === "LONG" ? 1 : -1) * (0.85 / casinoFxLeverage)),
                    equity          : s.totalMargin,
                    swapTotal       : 0,
                    payout          : 0,
                    liquidated      : false,
                    done            : false
                };
            }

            const initState         = calcFxPortfolioState(casinoFxRun, 0);
            casinoFxRun.equity      = initState.equity;
            casinoFxRun.swapTotal   = initState.swapTotal;
            casinoFxRun.entryPrice  = initState.weightedEntry;
            casinoFxRun.liqPrice    = initState.weightedLiq;

            if (initState.liquidated) {
                await settleForexPosition(0);
                return;
            }

            startFxSecondLoop();
        } else {
            const curSec = casinoFxRun.sec;

            if (!currentUser) {
                const dir = side === "LONG" ? 1 : -1;

                casinoFxRun.positions.push({
                    side,
                    leverage    : casinoFxLeverage,
                    bet,
                    entryPrice  : casinoFxRun.currentPrice * (1 + dir * (casinoFxRun.spread || 0)),
                    openSec     : curSec
                });

                casinoFxRun.totalMargin = (casinoFxRun.totalMargin || 0) + bet;
            } else {
                const res = await sendGachaAction({
                    action      : "CASINO_FX",
                    subAction   : "ADD",
                    sessionId   : casinoFxRun.sessionId,
                    side,
                    leverage    : casinoFxLeverage,
                    bet,
                    atSec       : curSec
                });

                if (!res?.session) return;

                casinoFxRun.positions   = res.session.positions;
                casinoFxRun.totalMargin = res.session.totalMargin;
            }

            const nextState         = calcFxPortfolioState(casinoFxRun, curSec);
            casinoFxRun.equity      = nextState.equity;
            casinoFxRun.swapTotal   = nextState.swapTotal;
            casinoFxRun.entryPrice  = nextState.weightedEntry;
            casinoFxRun.liqPrice    = nextState.weightedLiq;

            if (nextState.liquidated) await settleForexPosition(curSec);
        }
    } finally {
        casinoBusy = false;
        renderForexUI();
    }
}

document.getElementById("casino-game-select")?.addEventListener("change", (e) => {
    const val           = e.target.value;
    const isBlackjack   = val === "BLACKJACK";
    const isSynergy     = val === "SYNERGY";
    const isRoulette    = val === "ROULETTE";
    const isFx          = val === "FX";
    const hasRules      = Boolean(CASINO_RULES_TEXT[val]);

    const labels = {
        SYNERGY     : "Synergy",
        ROULETTE    : "Roulette",
        FX          : "Forex"
    };

    const rulesPill = document.getElementById("casino-rules-pill");

    if (rulesPill) {
        rulesPill.classList.toggle("hidden", !hasRules);

        if (hasRules) {
            rulesPill.setAttribute      ("data-tooltip", CASINO_RULES_TEXT[val]);
            rulesPill.removeAttribute   ("title");
        }
    }

    document.getElementById("bj-bet-controls")?.        classList.toggle("hidden", !isBlackjack);
    document.getElementById("casino-blackjack-board")?. classList.toggle("hidden", !isBlackjack);

    if (!isBlackjack) {
        const actionControls = document.getElementById("bj-action-controls");

        actionControls?.classList.add       ("hidden");
        actionControls?.classList.remove    ("grid");
    }

    document.getElementById("rl-bet-controls")?.        classList.toggle("hidden", !isRoulette);
    document.getElementById("casino-roulette-board")?.  classList.toggle("hidden", !isRoulette);
    document.getElementById("fx-bet-controls")?.        classList.toggle("hidden", !isFx);
    document.getElementById("casino-fx-board")?.        classList.toggle("hidden", !isFx);
    document.getElementById("syn-bet-controls")?.       classList.toggle("hidden", !isSynergy);
    document.getElementById("casino-synergy-board")?.   classList.toggle("hidden", !isSynergy);
    document.getElementById("casino-coming-soon")?.     classList.toggle("hidden", isBlackjack || isSynergy || isRoulette || isFx);

    if      (isBlackjack)   renderBlackjackUI       ();
    else if (isSynergy)     renderSynergyUI         ();
    else if (isRoulette)    renderRouletteUI        ();
    else if (isFx)          renderForexUI           ();
    else                    document.getElementById ("casino-coming-soon-title").textContent = `${labels[val] || val}: Coming Soon`;
});

document.getElementById("bj-deal-btn")?.    addEventListener("click", () => runBlackjackAction("DEAL"));
document.getElementById("bj-hit-btn")?.     addEventListener("click", () => runBlackjackAction("HIT"));
document.getElementById("bj-stand-btn")?.   addEventListener("click", () => runBlackjackAction("STAND"));

document.querySelectorAll(".rl-color-btn").forEach(btn => {btn.addEventListener("click", () => {
    if (casinoBusy) return;

    casinoRlSelectedBet = {type: "COLOR", value: btn.dataset.rlColor};
    renderRouletteUI();
})});

document.getElementById("rl-number-grid")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".rl-number-btn");
    if (!btn || casinoBusy) return;

    casinoRlSelectedBet = {type: "NUMBER", value: Number(btn.dataset.rlNumber)};
    renderRouletteUI();
});

document.getElementById("rl-spin-btn")?.addEventListener("click", runRouletteSpin);

document.querySelectorAll(".fx-pair-btn").forEach(btn => {btn.addEventListener("click", () => {
    if (casinoBusy || (casinoFxRun && !casinoFxRun.done)) return;
    casinoFxPair = btn.dataset.fxPair;
    renderForexUI();
})});

document.querySelectorAll(".fx-lev-btn").forEach(btn => {btn.addEventListener("click", () => {
        if (casinoBusy || (casinoFxRun && !casinoFxRun.done)) return;
        casinoFxLeverage = Number(btn.dataset.fxLev);
        renderForexUI();
})});

document.getElementById("fx-long-btn")?.    addEventListener("click", () => placeForexOrder("LONG"));
document.getElementById("fx-short-btn")?.   addEventListener("click", () => placeForexOrder("SHORT"));
document.getElementById("fx-close-btn")?.   addEventListener("click", () => {if (casinoFxRun && !casinoFxRun.done) settleForexPosition(casinoFxRun.sec)});

document.getElementById("syn-start-btn")?.  addEventListener("click", () => runSynergyAction("START"));
document.getElementById("syn-swap-btn")?.   addEventListener("click", () => runSynergyAction("SWAP"));
document.getElementById("syn-finish-btn")?. addEventListener("click", () => runSynergyAction("FINISH"));

document.getElementById("syn-player-cards")?.addEventListener("click", (e) => {
    if (casinoBusy || casinoSynState?.status !== "ACTIVE") return;

    const cardBtn = e.target.closest("[data-syn-hand-key]");
    if (!cardBtn) return;

    const key = cardBtn.getAttribute("data-syn-hand-key");
    casinoSynSelectedKey = casinoSynSelectedKey === key ? null : key;

    renderSynergyUI();
});