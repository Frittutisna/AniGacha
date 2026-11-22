const IMAGE_PREFIX = "https://s4.anilist.co/file/anilistcdn/character/";

const RARITIES = [{
    tier        : "SSR",
    color       : "White",
    dist        : 0.005,
    spawn       : 0.00125,
    sparkCost   : 5000,
    sellValue   : 256,
    border      : "border-2 border-slate-300 dark:border-white",
    badge       : "bg-white text-black font-black border border-slate-300 dark:border-transparent",
    text        : "text-slate-900 dark:text-white font-black"
}, {
    tier        : "SR",
    color       : "Violet",
    dist        : 0.01,
    spawn       : 0.0025,
    sparkCost   : 2500,
    sellValue   : 128,
    border      : "border-2 border-violet-500",
    badge       : "bg-violet-600 text-white",
    text        : "text-violet-600 dark:text-violet-400"
}, {
    tier        : "S",
    color       : "Indigo",
    dist        : 0.02,
    spawn       : 0.005,
    sparkCost   : 1000,
    sellValue   : 64,
    border      : "border-2 border-indigo-500",
    badge       : "bg-indigo-600 text-white",
    text        : "text-indigo-600 dark:text-indigo-400"
}, {
    tier        : "A",
    color       : "Blue",
    dist        : 0.04,
    spawn       : 0.02,
    sparkCost   : 500,
    sellValue   : 32,
    border      : "border-2 border-blue-500",
    badge       : "bg-blue-600 text-white",
    text        : "text-blue-600 dark:text-blue-400"
}, {
    tier        : "B",
    color       : "Green",
    dist        : 0.06,
    spawn       : 0.04,
    sparkCost   : 250,
    sellValue   : 16,
    border      : "border-2 border-emerald-500",
    badge       : "bg-emerald-600 text-white",
    text        : "text-emerald-600 dark:text-emerald-400"
}, {
    tier        : "C",
    color       : "Yellow",
    dist        : 0.10,
    spawn       : 0.08,
    sparkCost   : 100,
    sellValue   : 8,
    border      : "border-2 border-yellow-400",
    badge       : "bg-yellow-500 text-slate-950",
    text        : "text-yellow-600 dark:text-yellow-400"
}, {
    tier        : "D",
    color       : "Orange",
    dist        : 0.16,
    spawn       : 0.16,
    sparkCost   : 50,
    sellValue   : 4,
    border      : "border-2 border-orange-500",
    badge       : "bg-orange-600 text-white",
    text        : "text-orange-600 dark:text-orange-400"
}, {
    tier        : "E",
    color       : "Red",
    dist        : 0.25,
    spawn       : 0.32,
    sparkCost   : 25,
    sellValue   : 2,
    border      : "border-2 border-red-600",
    badge       : "bg-red-600 text-white",
    text        : "text-red-600 dark:text-red-400"
}, {
    tier        : "F",
    color       : "Black",
    dist        : 0.355,
    spawn       : 0.37125,
    sparkCost   : 10,
    sellValue   : 1,
    border      : "border-2 border-black",
    badge       : "bg-black text-white border border-slate-700",
    text        : "text-slate-700 dark:text-slate-300"
}];

const HOF_RARITIES = RARITIES.map(r => {
    let spawn = r.spawn;

    if (r.tier === "SSR" || r.tier === "SR" || r.tier === "S")  spawn *= 2;
    if (r.tier === "F")                                         spawn -= 0.00875;

    return {...r, spawn};
});

const GUARANTEED_B_PLUS         = new Set(["SSR", "SR", "S", "A", "B"]);
const GUARANTEED_A_PLUS         = new Set(["SSR", "SR", "S", "A"]);
const AUTO_LOCK_TIERS           = new Set(["SSR", "SR", "S"]);
const FIFTY_FIFTY_TIERS         = new Set(["SSR", "SR", "S"]);
const DECK_SUITS                = ["Spades", "Hearts", "Diamonds", "Clubs"];
const DECK_RANKS                = ["R", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
let characterPool               = [];
let characterMap                = new Map();
let inventory                   = {};
let lockedCards                 = new Set();
let lastResults                 = [];
let lastBannerType              = "STANDARD";
let totalPulls                  = 0;
let hofPulls                    = 0;
let currentPage                 = 1;
let totalPages                  = 1;
let titleLang                   = localStorage.getItem("anigacha_lang") === "EN" ? "EN" : "JP"; // "JP" for Romaji, "EN" for English
let stars                       = 0;
let databaseReady               = false;
let lastDailyStarsDate          = null;
let lastFreeSummonDate          = null;
let profilePhoto                = null;
let displayName                 = null;
let lastNameChangeJstYear       = null;
let discordName                 = "Account";
let anilistUsername             = null;
let anilistAnimeIds             = new Set();
let anilistEligibleKeys         = new Set();
let linkedAnilistHistory        = new Set();
let lastAnilistChangeJstYear    = null;
let listPulls                   = 0;
let playerDeck                  = {};

const SUMMON_COSTS = {
    STANDARD    : 80,
    ERA         : 100,
    FRANCHISE   : 100,
    GENRE       : 100,
    SOURCE      : 100,
    STUDIO      : 100,
    TAG         : 100,
    HOF         : 140,
    LIST        : 120
};

let sparkPoints = {
    STANDARD    : 0,
    THEMED      : 0,
    HOF         : 0,
    LIST        : 0
};

let fiftyFifty = {
    STANDARD    : null,
    HOF         : null,
    LIST        : null,
    THEMED      : {}
};

let activeSparkBanner       = null;
let activeFiftyFiftyBanner  = null;
let preFiftyFiftyViewState  = null;

const THEMED_BANNERS = {
    ERA: {
        cardElId        : "banner-card-era",
        pillElId        : "era-banner-pill",
        titleElId       : "era-banner-title",
        pullsElId       : "era-total-pulls",
        buttonElId      : "pull-era-10",
        sparkBtnElId    : "spark-era",
        sparkCountElId  : "spark-count-era",
        fiftyBtnElId    : "fifty-era",
        fiftyLabelElId  : "fifty-label-era",
        secondHoverLine : "The first 5 summons will be from this era",
        possibleLabel   : "Possible Era:",
        active          : null,
        pulls           : 0
    },

    FRANCHISE: {
        cardElId        : "banner-card-franchise",
        pillElId        : "franchise-banner-pill",
        titleElId       : "franchise-banner-title",
        pullsElId       : "franchise-total-pulls",
        buttonElId      : "pull-franchise-10",
        sparkBtnElId    : "spark-franchise",
        sparkCountElId  : "spark-count-franchise",
        fiftyBtnElId    : "fifty-franchise",
        fiftyLabelElId  : "fifty-label-franchise",
        secondHoverLine : "The first 5 summons will be from this franchise",
        possibleLabel   : "Possible Franchise:",
        active          : null,
        pulls           : 0
    },

    GENRE: {
        cardElId        : "banner-card-genre",
        pillElId        : "genre-banner-pill",
        titleElId       : "genre-banner-title",
        pullsElId       : "genre-total-pulls",
        buttonElId      : "pull-genre-10",
        sparkBtnElId    : "spark-genre",
        sparkCountElId  : "spark-count-genre",
        fiftyBtnElId    : "fifty-genre",
        fiftyLabelElId  : "fifty-label-genre",
        secondHoverLine : "The first 5 summons will be from anime with this genre",
        possibleLabel   : "Possible Genre:",
        active          : null,
        pulls           : 0
    },

    SOURCE: {
        cardElId        : "banner-card-source",
        pillElId        : "source-banner-pill",
        titleElId       : "source-banner-title",
        pullsElId       : "source-total-pulls",
        buttonElId      : "pull-source-10",
        sparkBtnElId    : "spark-source",
        sparkCountElId  : "spark-count-source",
        fiftyBtnElId    : "fifty-source",
        fiftyLabelElId  : "fifty-label-source",
        secondHoverLine : "The first 5 summons will be from this source",
        possibleLabel   : "Possible Source:",
        active          : null,
        pulls           : 0
    },

    STUDIO: {
        cardElId        : "banner-card-studio",
        pillElId        : "studio-banner-pill",
        titleElId       : "studio-banner-title",
        pullsElId       : "studio-total-pulls",
        buttonElId      : "pull-studio-10",
        sparkBtnElId    : "spark-studio",
        sparkCountElId  : "spark-count-studio",
        fiftyBtnElId    : "fifty-studio",
        fiftyLabelElId  : "fifty-label-studio",
        secondHoverLine : "The first 5 summons will be from this studio",
        possibleLabel   : "Possible Studio:",
        active          : null,
        pulls           : 0
    },

    TAG: {
        cardElId        : "banner-card-tag",
        pillElId        : "tag-banner-pill",
        titleElId       : "tag-banner-title",
        pullsElId       : "tag-total-pulls",
        buttonElId      : "pull-tag-10",
        sparkBtnElId    : "spark-tag",
        sparkCountElId  : "spark-count-tag",
        fiftyBtnElId    : "fifty-tag",
        fiftyLabelElId  : "fifty-label-tag",
        secondHoverLine : "The first 5 summons will be from anime with this tag",
        possibleLabel   : "Possible Tag:",
        active          : null,
        pulls           : 0
    }
};

const SUPABASE_URL          = "https://djypdxdgyxdisnnemmoc.supabase.co";
const SUPABASE_ANON_KEY     = "sb_publishable_-VD_p41goDRfdkjmTJMTVQ_J_R4wNbR";
const sb                    = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const sharedUserId          = new URLSearchParams(window.location.search).get("share")?.trim() || null;
let currentUser             = null;
let lastDailyBannersPayload = null;
let isSharedView            = Boolean(sharedUserId);
let viewerAnilistUsername   = null;

function getCurrentJstDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function getCurrentJstYear                  () {return getCurrentJstDate().slice(0, 4)}
function hasYearlyNameChangeAvailable       () {return lastNameChangeJstYear    !== getCurrentJstYear()}
function hasYearlyAnilistChangeAvailable    () {return lastAnilistChangeJstYear !== getCurrentJstYear()}

function isFreeAnilistHistoryVariant(candidate) {
    const trimmed = candidate.trim().toLowerCase();
    if (!trimmed) return false;

    return linkedAnilistHistory.has(trimmed);
}

function isListCharacter(char) {
    if (!anilistUsername || anilistAnimeIds.size === 0) return false;
    return Boolean(char.animeId && anilistAnimeIds.has(String(char.animeId)));
}

function rebuildAnilistEligibleKeys() {
    anilistEligibleKeys = new Set();
    if (!anilistUsername || anilistAnimeIds.size === 0) return;
    for (const c of characterPool) {if (c.animeId && anilistAnimeIds.has(c.animeId)) anilistEligibleKeys.add(c.uniqueKey)}
}

function isFreeDiscordNameVariant(candidate) {
    const trimmed = candidate.trim();
    if (!trimmed) return true;
    return trimmed.toLowerCase() === discordName.trim().toLowerCase();
}

function getRarityBorderClass(tier) {
    const found = RARITIES.find(r => r.tier === tier);
    return found ? found.border : "border-2 border-slate-400";
}

const DECK_SUIT_STYLES = {
    Spades      : {symbol: "♠", badge: "bg-violet-600 text-white"},
    Hearts      : {symbol: "♥", badge: "bg-indigo-600 text-white"},
    Diamonds    : {symbol: "♦", badge: "bg-blue-600 text-white"},
    Clubs       : {symbol: "♣", badge: "bg-emerald-600 text-white"}
};

const DECK_RANK_NAMES = {
    R       : "Joker",
    A       : "Ace",
    K       : "King",
    Q       : "Queen",
    J       : "Jack",
    "10"    : "10",
    "9"     : "9",
    "8"     : "8",
    "7"     : "7",
    "6"     : "6",
    "5"     : "5",
    "4"     : "4",
    "3"     : "3",
    "2"     : "2"
};

function getDeckRankFullName    (rank) {return DECK_RANK_NAMES  [rank] || rank || "2"}
function getDeckSuitStyle       (suit) {return DECK_SUIT_STYLES [suit] || DECK_SUIT_STYLES.Spades}

function getRarityBgClass(tier) {
    const found = RARITIES.find(r => r.tier === tier);
    return found ? found.badge.split(" ")[0] : "bg-slate-200 dark:bg-slate-800";
}

function buildPhotoTransformStyle({x = 0, y = 0, zoom = 1, rotate = 0}) {return `transform: translate(${x}%, ${y}%) scale(${zoom}) rotate(${rotate}deg); transform-origin: center center;`}

function updateHeaderProfileUI() {
    const frame             = document.getElementById("profile-photo-frame");
    const img               = document.getElementById("header-photo-img");
    const placeholder       = document.getElementById("header-photo-placeholder");
    const usernameEl        = document.getElementById("header-username");
    const anilistWrapper    = document.getElementById("anilist-header-wrapper");

    if (anilistWrapper)     anilistWrapper.classList.toggle("hidden", Boolean(viewerAnilistUsername));

    frame.className         = `w-8 h-8 rounded-lg overflow-hidden ${getRarityBgClass(profilePhoto?.tier)} ${getRarityBorderClass(profilePhoto?.tier)} flex items-center justify-center shrink-0 group-hover:scale-105 transition`;
    usernameEl.textContent  = displayName || discordName;

    const char = profilePhoto?.uniqueKey ? characterMap.get(profilePhoto.uniqueKey) : null;

    if (char && char.imageUrl) {
        img.src             = char.imageUrl;
        img.style.cssText   = buildPhotoTransformStyle(profilePhoto);

        img         .classList.remove   ("hidden");
        placeholder .classList.add      ("hidden");
    } else {
        img         .classList.add      ("hidden");
        placeholder .classList.remove   ("hidden");
    }
}

function applySaveState(data) {
    if (!data) return;

    stars                       = typeof data.stars === "number" ? data.stars : 0;
    lastDailyStarsDate          = data.lastDailyStarsDate || null;
    lastFreeSummonDate          = data.lastFreeSummonDate || null;
    profilePhoto                = data.profilePhoto || null;
    displayName                 = data.displayName || null;
    lastNameChangeJstYear       = data.lastNameChangeJstYear || null;
    viewerAnilistUsername       = data.anilistUsername || null;
    linkedAnilistHistory        = new Set(Array.isArray(data.linkedAnilistHistory) ? data.linkedAnilistHistory.map(s => String(s).toLowerCase()) : []);
    lastAnilistChangeJstYear    = data.lastAnilistChangeJstYear || null;

    updateHeaderProfileUI   ();
    updateStarsUI           ();

    if (typeof aniQuizDaily !== "undefined") {
        aniQuizDaily = data.quizDaily || null;
        if (typeof aniQuizRenderMissions === "function") aniQuizRenderMissions();
    }

    if (isSharedView) return;

    inventory                   = data.inventory && typeof data.inventory === "object" ? data.inventory : {};
    const shouldDefaultOwned    = Boolean(currentUser);

    document.querySelectorAll('#filter-own-group input[type="checkbox"]').forEach(cb => {cb.checked = shouldDefaultOwned && cb.value === "OWNED"});

    lockedCards     = new Set(Array.isArray(data.lockedCards) ? data.lockedCards : []);
    totalPulls      = typeof data.totalPulls === "number" ? data.totalPulls : 0;
    hofPulls        = typeof data.hofPulls === "number" ? data.hofPulls : 0;
    listPulls       = typeof data.listPulls === "number" ? data.listPulls : 0;
    playerDeck      = data.deck && typeof data.deck === "object" && !Array.isArray(data.deck) ? {...data.deck} : {};
    anilistUsername = viewerAnilistUsername;
    anilistAnimeIds = new Set(Array.isArray(data.anilistAnimeIds) ? data.anilistAnimeIds.map(v => normalizeId(v)).filter(Boolean) : []);

    rebuildAnilistEligibleKeys();

    const anilistInput = document.getElementById("profile-anilist-input");
    if (anilistInput) anilistInput.value = anilistUsername || "";

    if (data.sparkPoints) {
        Object.keys(sparkPoints)    .forEach(k => {sparkPoints[k] = typeof data.sparkPoints[k] === "number" ? data.sparkPoints[k] : 0});
        ALL_THEMED_KEYS             .forEach(k => {if (typeof data.sparkPoints[k] === "number") sparkPoints.THEMED += data.sparkPoints[k]});
    }

    const incomingFifty = data.fiftyFifty || {};

    fiftyFifty = {
        STANDARD    : incomingFifty.STANDARD    || null,
        HOF         : incomingFifty.HOF         || null,
        LIST        : incomingFifty.LIST        || null,
        THEMED      : incomingFifty.THEMED      || null
    };

    if (data.themedPulls)                                       ALL_THEMED_KEYS.forEach(k => {THEMED_BANNERS[k].pulls = typeof data.themedPulls[k] === "number" ? data.themedPulls[k] : 0})
    if (activeSparkBanner === "LIST" && !anilistUsername)       exitSparkMode()
    if (activeFiftyFiftyBanner === "LIST" && !anilistUsername)  exitFiftyFiftyMode()

    if (typeof casinoBjState !== "undefined") {
        const bj = data.blackjack;

        if (bj && Array.isArray(bj.playerCards) && Array.isArray(bj.dealerCards)) {
            const upCard = bj.dealerCards[0];

            casinoBjState = {
                status      : "ACTIVE",
                bet         : bj.bet,
                payout      : 0,
                playerCards : bj.playerCards,
                dealerCards : [upCard, null],
                playerScore : typeof bj.playerScore === "number" ? bj.playerScore : evaluateBlackjackHand(bj.playerCards),
                dealerScore : typeof bj.dealerScore === "number" ? bj.dealerScore : evaluateBlackjackHand([upCard])
            };
        } else if (!currentUser || (bj === null && (typeof casinoBusy === "undefined" || !casinoBusy))) casinoBjState = null;

        if (typeof renderBlackjackUI === "function") renderBlackjackUI();
    }

    applyDailyBanners           (lastDailyBannersPayload || getClientDailyBanners());
    updateSparkButtonsUI        ();
    updateFiftyFiftyButtonsUI   ();
    renderInventory             ();

    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) renderResults(lastResults, false, lastBannerType);
}

let activeDailyJstDate = null;

function getClientDailyBanners() {
    const jstDate = new Intl.DateTimeFormat("en-CA", {
        timeZone    : "Asia/Tokyo",
        year        : "numeric",
        month       : "2-digit",
        day         : "2-digit"
    }).format(new Date());

    const seedStr   = `anigacha-daily-${jstDate}`;
    let h           = 1779033703 ^ seedStr.length;

    for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }

    let seed = h >>> 0;

    const rng = () => {
        let t   =   (seed += 0x6D2B79F5);
        t       =   Math.imul(t ^ (t >>> 15), t | 1);
        t       ^=  t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const shuffledCats = [...ALL_THEMED_KEYS];

    for (let i = shuffledCats.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffledCats[i], shuffledCats[j]] = [shuffledCats[j], shuffledCats[i]];
    }

    const activeCategories  = shuffledCats.slice(0, 2);
    const activeTitles      = {};

    for (const cat of activeCategories) {
        const options   = THEMED_BANNERS[cat].allOptions || [];
        const chosen    = options[Math.floor(rng() * options.length)];

        if (chosen) activeTitles[cat] = chosen.title;
    }

    return {jstDate, activeCategories, activeTitles};
}

function applyDailyBanners(dailyBanners) {
    if (!dailyBanners || !databaseReady) return;

    lastDailyBannersPayload = dailyBanners;
    activeDailyJstDate      = dailyBanners.jstDate;
    const isLinked          = Boolean(anilistUsername);

    const visibleCategories = isLinked
        ? dailyBanners.activeCategories.slice(0, 1)
        : dailyBanners.activeCategories;

    const activeSet = new Set(visibleCategories);

    ALL_THEMED_KEYS.forEach(key => {
        const banner = THEMED_BANNERS[key];
        const cardEl = document.getElementById(banner.cardElId);

        if (!activeSet.has(key)) {
            cardEl.classList.add("hidden");
            banner.active = null;
            return;
        }

        cardEl.classList.remove("hidden");

        const targetTitle   = dailyBanners.activeTitles[key];
        const options       = banner.allOptions || [];
        const chosen        = options.find(opt => opt.title === targetTitle) || options[0];

        if (chosen) {
            banner.active = chosen;
            document.getElementById(banner.titleElId).textContent = chosen.title;

            const otherLabels = options
                .filter (opt    => opt !== chosen)
                .slice  ()
                .sort   ((a, b) => key === "ERA" ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) : a.title.localeCompare(b.title))
                .map    (opt    => opt.hoverLabel || opt.title);

            const catLabel  = key[0] + key.slice(1).toLowerCase();
            const pillEl    = document.getElementById(banner.pillElId);

            pillEl.setAttribute("data-tooltip-title", `${catLabel}: ${chosen.title}`);

            pillEl.setAttribute("data-tooltip", [
                "First summon is guaranteed to be a B-tier or better",
                banner.secondHoverLine.replace(/^The first/, "First"),
                "Auto-locks sparks and S+ summons",
                "Rotates 00:00 JST",
                "Sparks are pooled across all themed banners",
                "",
                ...otherLabels
            ].join("\n"));

            pillEl.removeAttribute("title");
        }
    });

    const listCardEl = document.getElementById("banner-card-list");

    if (listCardEl) {
        if (isLinked) {
            listCardEl.classList.remove("hidden");
            document.getElementById("list-banner-title").textContent = anilistUsername;

            const listPillEl = document.getElementById("list-banner-pill");
            listPillEl.setAttribute("data-tooltip-title", `List: ${anilistUsername}`);

            listPillEl.setAttribute("data-tooltip", [
                "First summon is guaranteed to be a B-tier or better",
                "All 10 summons are from your AniList",
                "Auto-locks sparks and S+ summons",
                "Sparks stay in this banner"
            ].join("\n"));

            listPillEl.removeAttribute  ("title");
        } else listCardEl.classList.add ("hidden");
    }

    if (!fiftyFifty.THEMED || typeof fiftyFifty.THEMED !== "object") fiftyFifty.THEMED = {}
    for (const key of ALL_THEMED_KEYS) if (fiftyFifty.THEMED?.[key]?.date !== activeDailyJstDate) delete fiftyFifty.THEMED[key];

    updateStarsUI               ();
    updateSparkButtonsUI        ();
    updateFiftyFiftyButtonsUI   ();
}