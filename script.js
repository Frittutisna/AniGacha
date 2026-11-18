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
    if (r.tier === "SSR" || r.tier === "SR" || r.tier === "S") spawn *= 2;
    if (r.tier === "F") spawn -= 0.00875;
    return { ...r, spawn };
});

const GUARANTEED_B_PLUS = new Set(["SSR", "SR", "S", "A", "B"]);
const GUARANTEED_A_PLUS = new Set(["SSR", "SR", "S", "A"]);
const AUTO_LOCK_TIERS   = new Set(["SSR", "SR", "S"]);

let characterPool       = [];
let characterMap        = new Map();
let inventory           = {};
let lockedCards         = new Set();
let lastResults         = [];
let lastBannerType      = "STANDARD";
let totalPulls          = 0;
let hofPulls            = 0;
let currentPage         = 1;
let totalPages          = 1;
let titleLang           = localStorage.getItem("anigacha_lang") === "EN" ? "EN" : "JP"; // "JP" for Romaji, "EN" for English
let stars               = 0;
let databaseReady       = false;
let lastDailyStarsDate    = null;
let lastFreeSummonDate    = null;
let profilePhoto          = null; // { uniqueKey, tier, x, y, zoom, rotate }
let displayName           = null;
let lastNameChangeJstYear = null;
let discordName           = "Account";

let anilistUsername          = null;
let anilistAnimeIds          = new Set();
let anilistEligibleKeys      = new Set();
let linkedAnilistHistory     = new Set();
let lastAnilistChangeJstYear = null;
let listPulls                = 0;

const SUMMON_COSTS = {
    STANDARD    : 60,
    ERA         : 75,
    FRANCHISE   : 75,
    GENRE       : 75,
    SOURCE      : 75,
    STUDIO      : 75,
    TAG         : 75,
    HOF         : 90,
    LIST        : 105
};

// Spark currency per banner category.
// Note: Spark points carry over across rotations within the same category (e.g. Studio -> Studio),
// but do NOT carry over across different categories (e.g. Studio -> Genre, or Standard -> Hall-of-Fame).
let sparkPoints = {
    STANDARD    : 0,
    ERA         : 0,
    FRANCHISE   : 0,
    GENRE       : 0,
    SOURCE      : 0,
    STUDIO      : 0,
    TAG         : 0,
    HOF         : 0,
    LIST        : 0
};

let activeSparkBanner   = null; // null or banner key ("STANDARD", "ERA", "FRANCHISE", "GENRE", "SOURCE", "STUDIO", "TAG", "HOF", "LIST")

const THEMED_BANNERS = {
    ERA: {
        cardElId        : "banner-card-era",
        pillElId        : "era-banner-pill",
        titleElId       : "era-banner-title",
        pullsElId       : "era-total-pulls",
        buttonElId      : "pull-era-10",
        sparkBtnElId    : "spark-era",
        sparkCountElId  : "spark-count-era",
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
        secondHoverLine : "The first 5 summons will be from anime with this tag",
        possibleLabel   : "Possible Tag:",
        active          : null,
        pulls           : 0
    }
};

const SUPABASE_URL      = "https://djypdxdgyxdisnnemmoc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-VD_p41goDRfdkjmTJMTVQ_J_R4wNbR";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser   = null;
let lastDailyBannersPayload = null;
const sharedUserId = new URLSearchParams(window.location.search).get("share")?.trim() || null;
let isSharedView   = Boolean(sharedUserId);
let viewerAnilistUsername = null;

function getCurrentJstDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function getCurrentJstYear() {
    return getCurrentJstDate().slice(0, 4);
}

function hasYearlyNameChangeAvailable() {
    return lastNameChangeJstYear !== getCurrentJstYear();
}

function hasYearlyAnilistChangeAvailable() {
    return lastAnilistChangeJstYear !== getCurrentJstYear();
}

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
    for (const c of characterPool) {
        if (c.animeId && anilistAnimeIds.has(c.animeId)) {
            anilistEligibleKeys.add(c.uniqueKey);
        }
    }
}

function isFreeDiscordNameVariant(candidate) {
    const trimmed = candidate.trim();
    if (!trimmed) return true; // Empty reverts to Discord name
    return trimmed.toLowerCase() === discordName.trim().toLowerCase();
}

function getRarityBorderClass(tier) {
    const found = RARITIES.find(r => r.tier === tier);
    return found ? found.border : "border-2 border-slate-400";
}

function getRarityBgClass(tier) {
    const found = RARITIES.find(r => r.tier === tier);
    return found ? found.badge.split(" ")[0] : "bg-slate-200 dark:bg-slate-800";
}

function buildPhotoTransformStyle({ x = 0, y = 0, zoom = 1.2, rotate = 0 }) {
    return `transform: translate(${x}%, ${y}%) scale(${zoom}) rotate(${rotate}deg); transform-origin: center center;`;
}

function updateHeaderProfileUI() {
    const frame        = document.getElementById("profile-photo-frame");
    const img          = document.getElementById("header-photo-img");
    const placeholder  = document.getElementById("header-photo-placeholder");
    const usernameEl   = document.getElementById("header-username");
    const anilistWrapper  = document.getElementById("anilist-header-wrapper");
    const modeIndicatorEl = document.getElementById("mode-indicator");

    if (anilistWrapper) {
        anilistWrapper.classList.toggle("hidden", Boolean(viewerAnilistUsername));
    }
    if (modeIndicatorEl) {
        modeIndicatorEl.textContent = currentUser ? "Beta" : "Debug";
    }

    frame.className = `w-8 h-8 rounded-lg overflow-hidden ${getRarityBgClass(profilePhoto?.tier)} ${getRarityBorderClass(profilePhoto?.tier)} flex items-center justify-center shrink-0 group-hover:scale-105 transition`;
    usernameEl.textContent = displayName || discordName;

    const char = profilePhoto?.uniqueKey ? characterMap.get(profilePhoto.uniqueKey) : null;
    if (char && char.imageUrl) {
        img.src = char.imageUrl;
        img.style.cssText = buildPhotoTransformStyle(profilePhoto);
        img.classList.remove("hidden");
        placeholder.classList.add("hidden");
    } else {
        img.classList.add("hidden");
        placeholder.classList.remove("hidden");
    }
}

function applySaveState(data) {
    if (!data) return;

    stars                    = typeof data.stars === "number" ? data.stars : 0;
    lastDailyStarsDate       = data.lastDailyStarsDate || null;
    lastFreeSummonDate       = data.lastFreeSummonDate || null;
    profilePhoto             = data.profilePhoto || null;
    displayName              = data.displayName || null;
    lastNameChangeJstYear    = data.lastNameChangeJstYear || null;
    viewerAnilistUsername    = data.anilistUsername || null;
    linkedAnilistHistory     = new Set(Array.isArray(data.linkedAnilistHistory) ? data.linkedAnilistHistory.map(s => String(s).toLowerCase()) : []);
    lastAnilistChangeJstYear = data.lastAnilistChangeJstYear || null;

    // Update header & stars for the logged-in viewer even while viewing a shared collection
    updateHeaderProfileUI();
    updateStarsUI();

    if (isSharedView) return;

    inventory       = data.inventory && typeof data.inventory === "object" ? data.inventory : {};
    lockedCards     = new Set(Array.isArray(data.lockedCards) ? data.lockedCards : []);
    totalPulls      = typeof data.totalPulls === "number" ? data.totalPulls : 0;
    hofPulls        = typeof data.hofPulls === "number" ? data.hofPulls : 0;
    listPulls       = typeof data.listPulls === "number" ? data.listPulls : 0;
    anilistUsername = viewerAnilistUsername;
    anilistAnimeIds = new Set(Array.isArray(data.anilistAnimeIds) ? data.anilistAnimeIds.map(v => normalizeId(v)).filter(Boolean) : []);
    rebuildAnilistEligibleKeys();

    const anilistInput = document.getElementById("profile-anilist-input");
    if (anilistInput) {
        anilistInput.value = anilistUsername || "";
    }

    if (data.sparkPoints) {
        Object.keys(sparkPoints).forEach(k => {
            sparkPoints[k] = typeof data.sparkPoints[k] === "number" ? data.sparkPoints[k] : 0;
        });
    }

    if (data.themedPulls) {
        ALL_THEMED_KEYS.forEach(k => {
            THEMED_BANNERS[k].pulls = typeof data.themedPulls[k] === "number" ? data.themedPulls[k] : 0;
        });
    }

    if (activeSparkBanner === "LIST" && !anilistUsername) {
        exitSparkMode();
    }

    document.getElementById("unlocked-count").textContent = Object.keys(inventory).length.toLocaleString();

    applyDailyBanners(lastDailyBannersPayload || getClientDailyBanners());

    updateSparkButtonsUI();
    renderInventory();
    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
        renderResults(lastResults, false, lastBannerType);
    }
}

let activeDailyJstDate = null;

function getClientDailyBanners() {
    const jstDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());

    const seedStr = `anigacha-daily-${jstDate}`;
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    let seed = h >>> 0;

    const rng = () => {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const shuffledCats = [...ALL_THEMED_KEYS];
    for (let i = shuffledCats.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffledCats[i], shuffledCats[j]] = [shuffledCats[j], shuffledCats[i]];
    }
    const activeCategories = shuffledCats.slice(0, 2);

    const activeTitles = {};
    for (const cat of activeCategories) {
        const options = THEMED_BANNERS[cat].allOptions || [];
        const chosen = options[Math.floor(rng() * options.length)];
        if (chosen) activeTitles[cat] = chosen.title;
    }

    return { jstDate, activeCategories, activeTitles };
}

function applyDailyBanners(dailyBanners) {
    if (!dailyBanners || !databaseReady) return;
    lastDailyBannersPayload = dailyBanners;
    activeDailyJstDate = dailyBanners.jstDate;

    const isLinked = Boolean(anilistUsername);
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
        const targetTitle = dailyBanners.activeTitles[key];
        const options = banner.allOptions || [];
        const chosen = options.find(opt => opt.title === targetTitle) || options[0];

        if (chosen) {
            banner.active = chosen;
            document.getElementById(banner.titleElId).textContent = chosen.title;

            const otherLabels = options
                .filter(opt => opt !== chosen)
                .slice()
                .sort((a, b) => key === "ERA" ? (a.sortOrder ?? 0) - (b.sortOrder ?? 0) : a.title.localeCompare(b.title))
                .map(opt => opt.hoverLabel || opt.title);

            const catLabel = key[0] + key.slice(1).toLowerCase();
            const pillEl = document.getElementById(banner.pillElId);
            pillEl.setAttribute("data-tooltip-title", `${catLabel}: ${chosen.title}`);
            pillEl.setAttribute("data-tooltip", [
                "First summon is guaranteed to be a B-tier or better",
                banner.secondHoverLine.replace(/^The first/, "First"),
                "Auto-locks sparks and S+ summons",
                "Rotates daily, 00:00 JST",
                "Sparks stay within the same banner type",
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
                "First 5 summons are from your AniList",
                "Auto-locks sparks and S+ summons",
                "Sparks stay within the same banner type"
            ].join("\n"));
            listPillEl.removeAttribute("title");
        } else {
            listCardEl.classList.add("hidden");
        }
    }

    updateStarsUI();
    updateSparkButtonsUI();
}

// --- Guest (Logged-Out) In-Memory Sandbox Helpers ---
function buildClientGlobalBuckets() {
    const buckets = {};
    RARITIES.forEach(r => { buckets[r.tier] = []; });
    for (const c of characterPool) {
        buckets[c.rarity.tier].push(c);
    }
    RARITIES.forEach(r => {
        if (buckets[r.tier].length === 0 && characterPool.length > 0) {
            buckets[r.tier].push(characterPool[0]);
        }
    });
    return buckets;
}

function buildClientTierMapFromKeys(eligibleKeys, globalBuckets) {
    const tierMap = {};
    RARITIES.forEach(r => { tierMap[r.tier] = []; });
    for (const k of eligibleKeys) {
        const c = characterMap.get(k);
        if (c) tierMap[c.rarity.tier].push(c);
    }
    RARITIES.forEach((r, idx) => {
        if (tierMap[r.tier].length > 0) return;
        for (let d = idx + 1; d < RARITIES.length; d++) {
            if (tierMap[RARITIES[d].tier].length > 0) { tierMap[r.tier] = tierMap[RARITIES[d].tier]; return; }
        }
        for (let u = idx - 1; u >= 0; u--) {
            if (tierMap[RARITIES[u].tier].length > 0) { tierMap[r.tier] = tierMap[RARITIES[u].tier]; return; }
        }
        tierMap[r.tier] = globalBuckets[r.tier];
    });
    return tierMap;
}

function selectClientRarityTier(guaranteeTier, customRarities = RARITIES) {
    const allowed = guaranteeTier === "A" ? GUARANTEED_A_PLUS : (guaranteeTier === "B" ? GUARANTEED_B_PLUS : null);

    if (allowed) {
        const eligible = customRarities.filter(r => allowed.has(r.tier));
        const totalWeight = eligible.reduce((sum, r) => sum + r.spawn, 0);
        const rand = Math.random() * totalWeight;
        let cumulative = 0;

        for (const r of eligible) {
            cumulative += r.spawn;
            if (rand < cumulative) return r.tier;
        }
        return guaranteeTier;
    }

    const rand = Math.random();
    let cumulative = 0;
    let selected = customRarities[customRarities.length - 1].tier;
    for (const r of customRarities) {
        cumulative += r.spawn;
        if (rand < cumulative) { selected = r.tier; break; }
    }
    return selected;
}

function handleGuestGachaAction(payload) {
    const action = payload.action;
    const rolledResults = [];

    if (action === "SUMMON") {
        const bannerType = payload.bannerType || "STANDARD";
        const isThemed = ALL_THEMED_KEYS.includes(bannerType);
        const isListBanner = bannerType === "LIST";
        if (isThemed && !THEMED_BANNERS[bannerType]?.active) return null;
        if (isListBanner && (!anilistUsername || anilistEligibleKeys.size === 0)) return null;

        const isHOF = bannerType === "HOF";
        const customRarities = isHOF ? HOF_RARITIES : RARITIES;
        const globalBuckets = buildClientGlobalBuckets();
        const categoryTierMap = isThemed
            ? buildClientTierMapFromKeys(THEMED_BANNERS[bannerType].active.eligibleKeys, globalBuckets)
            : (isListBanner ? buildClientTierMapFromKeys(anilistEligibleKeys, globalBuckets) : null);

        for (let i = 0; i < 10; i++) {
            const guaranteeTier = i === 0 ? (isHOF ? "A" : "B") : null;
            const isCategorySlot = Boolean(categoryTierMap && i < 5);
            const tier = selectClientRarityTier(guaranteeTier, customRarities);
            const pool = isCategorySlot ? categoryTierMap[tier] : globalBuckets[tier];
            const chosen = pool[Math.floor(Math.random() * pool.length)];

            const count = (inventory[chosen.uniqueKey] || 0) + 1;
            inventory[chosen.uniqueKey] = count;

            if (AUTO_LOCK_TIERS.has(tier)) lockedCards.add(chosen.uniqueKey);
            sparkPoints[bannerType] = (sparkPoints[bannerType] || 0) + 1;

            if (isThemed) {
                THEMED_BANNERS[bannerType].pulls++;
            } else if (isListBanner) {
                listPulls++;
            } else if (isHOF) {
                hofPulls++;
            } else {
                totalPulls++;
            }

            rolledResults.push({ uniqueKey: chosen.uniqueKey, occurrenceCount: count });
        }
    } else if (action === "SELL") {
        const key = payload.uniqueKey;
        if (inventory[key] > 0 && !lockedCards.has(key)) {
            delete inventory[key];
        }
    } else if (action === "SELL_ALL") {
        for (const [key, count] of Object.entries(inventory)) {
            if (count > 0 && !lockedCards.has(key)) {
                delete inventory[key];
            }
        }
    } else if (action === "SPARK") {
        const { bannerType, uniqueKey } = payload;
        const char = characterMap.get(uniqueKey);
        if (!char || !isCharacterSparkableInBanner(char, bannerType)) return null;
        if ((sparkPoints[bannerType] || 0) < char.rarity.sparkCost) return null;

        sparkPoints[bannerType] -= char.rarity.sparkCost;
        inventory[uniqueKey] = (inventory[uniqueKey] || 0) + 1;
        lockedCards.add(uniqueKey);
    } else if (action === "TOGGLE_LOCK") {
        const key = payload.uniqueKey;
        if (inventory[key]) {
            if (lockedCards.has(key)) lockedCards.delete(key);
            else lockedCards.add(key);
        }
    }

    document.getElementById("unlocked-count").textContent = Object.keys(inventory).length.toLocaleString();

    updateStarsUI();
    updateSparkButtonsUI();
    renderInventory();

    return { rolledResults };
}

let actionInFlight = false;
let lockInFlight   = false;

function updateLockButtonsUI() {
    document.querySelectorAll(".lock-card-btn").forEach(btn => {
        btn.disabled = lockInFlight;
    });
}

async function handleGuestLinkAnilist(username) {
    const query = `
        query ($userName: String) {
            MediaListCollection(userName: $userName, type: ANIME, status_in: [CURRENT, COMPLETED]) {
                user { name }
                lists { entries { mediaId } }
            }
        }
    `;
    const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ query, variables: { userName: username } })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.errors || !json?.data?.MediaListCollection) {
        alert(json?.errors?.[0]?.message || "Could not fetch AniList user list");
        return null;
    }

    const collection = json.data.MediaListCollection;
    const ids = new Set();
    for (const list of collection.lists || []) {
        for (const entry of list.entries || []) {
            if (entry?.mediaId) ids.add(normalizeId(entry.mediaId));
        }
    }

    anilistUsername = collection.user?.name || username;
    viewerAnilistUsername = anilistUsername;
    anilistAnimeIds = ids;
    rebuildAnilistEligibleKeys();
    applyDailyBanners(lastDailyBannersPayload || getClientDailyBanners());
    updateHeaderProfileUI();
    renderInventory();
    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
        renderResults(lastResults, false, lastBannerType);
    }
    return { ok: true };
}

async function sendGachaAction(payload) {
    if (!currentUser) {
        if (!databaseReady) return null;
        if (payload.action === "LINK_ANILIST") {
            return await handleGuestLinkAnilist(payload.anilistUsername);
        }
        return handleGuestGachaAction(payload);
    }
    if (actionInFlight) return null;
    actionInFlight = true;
    updateStarsUI();
    updateSparkButtonsUI();

    try {
        const { data, error } = await sb.functions.invoke("AniGacha-Japan", {
            body: payload
        });

        if (error || data?.error) {
            let serverMsg = data?.error;
            if (!serverMsg && error?.context && typeof error.context.json === "function") {
                const errBody = await error.context.json().catch(() => null);
                serverMsg = errBody?.error;
            }
            console.error("Server action failed:", serverMsg || error);
            alert(serverMsg || "Action failed. Please try again.");
            return null;
        }

        if (data.dailyBanners) {
            lastDailyBannersPayload = data.dailyBanners;
        }
        if (data.save) {
            applySaveState(data.save);
        } else if (data.dailyBanners) {
            applyDailyBanners(data.dailyBanners);
        }
        return data;
    } finally {
        actionInFlight = false;
        updateStarsUI();
        updateSparkButtonsUI();
    }
}

// Pick 2 themed banners at random to show between the Standard banner and the Premium banner
const ALL_THEMED_KEYS = Object.keys(THEMED_BANNERS);
ALL_THEMED_KEYS.forEach(key => document.getElementById(THEMED_BANNERS[key].cardElId).classList.add("hidden"));

function getItemsPerPage() {
    return window.innerWidth < 640 ? 25 : 50;
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// NEW
function formatPercent(val) {
    const pct   = Math.round(val * 100 * 1000) / 1000;
    const whole = Math.floor(pct);
    const rem   = Math.round((pct - whole) * 1000) / 1000;

    const fractions = {
        0.125: "⅛",
        0.25 : "¼",
        0.375: "⅜",
        0.5  : "½",
        0.625: "⅝",
        0.75 : "¾",
        0.875: "⅞"
    };

    const frac = fractions[rem];
    if (frac) {
        return whole > 0 ? `${whole}${frac}` : frac;
    }
    return `${pct}`;
}

function getAnimeTitle(char) {
    if (titleLang === "EN") {
        return char.animeEnglish || char.animeRomaji || "Unknown Series";
    }
    return char.animeRomaji || char.animeEnglish || "Unknown Series";
}

function updateStarsUI() {
    const isGuest = !currentUser;
    document.getElementById("star-count").textContent = isGuest ? "∞" : stars.toLocaleString();

    const todayJst = activeDailyJstDate || getCurrentJstDate();

    // Daily free 100 stars button [☆]
    const dailyStarsBtn = document.getElementById("daily-stars-btn");
    const canClaimStars = Boolean(currentUser) && lastDailyStarsDate !== todayJst;
    dailyStarsBtn.classList.toggle("hidden", !canClaimStars);

    // Daily free Standard 10-summon
    const hasFreeStandard = isGuest || (Boolean(currentUser) && lastFreeSummonDate !== todayJst);
    const pullStandardBtn = document.getElementById("pull-10");
    pullStandardBtn.textContent = hasFreeStandard ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS.STANDARD}`;
    pullStandardBtn.disabled    = actionInFlight || !databaseReady || (!isGuest && !hasFreeStandard && stars < SUMMON_COSTS.STANDARD);

    const pullHofBtn = document.getElementById("pull-hof-10");
    pullHofBtn.textContent = isGuest ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS.HOF}`;
    pullHofBtn.disabled    = actionInFlight || !databaseReady || (!isGuest && stars < SUMMON_COSTS.HOF);

    const pullListBtn = document.getElementById("pull-list-10");
    if (pullListBtn) {
        pullListBtn.textContent = isGuest ? "Summon: Free" : `Summon: ★ ${SUMMON_COSTS.LIST}`;
        pullListBtn.disabled    = actionInFlight || !databaseReady || !anilistUsername || (!isGuest && stars < SUMMON_COSTS.LIST);
    }

    ALL_THEMED_KEYS.forEach(key => {
        const banner = THEMED_BANNERS[key];
        const btn = document.getElementById(banner.buttonElId);
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

    const th = document.createElement("th");
    th.className = `py-1 px-0.5 font-bold !border-0 ${r.badge}`;
    th.textContent = r.tier;
    tableHead.appendChild(th);

    const tdPool = document.createElement("td");
    tdPool.className = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdPool.textContent = formatPercent(r.dist);
    poolRow.appendChild(tdPool);

    const tdSpawn = document.createElement("td");
    tdSpawn.className = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdSpawn.textContent = formatPercent(r.spawn);
    spawnRow.appendChild(tdSpawn);

    const tdSpark = document.createElement("td");
    tdSpark.className = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdSpark.textContent = r.sparkCost >= 1000 ? `${r.sparkCost / 1000}K` : r.sparkCost;
    sparkRow.appendChild(tdSpark);

    const tdSell = document.createElement("td");
    tdSell.className = "py-1 px-0.5 text-slate-600 dark:text-slate-300";
    tdSell.textContent = r.sellValue;
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
        const m = Math.min(Math.max(Number(rawDate.slice(4, 6)), 1), 12) - 1;
        const d = Math.min(Math.max(Number(rawDate.slice(6, 8)), 1), 31);
        return new Date(y, m, d).getTime();
    }

    if (/^\d{4}$/.test(rawDate)) {
        return new Date(Number(rawDate), 0, 1).getTime();
    }

    const parsed = Date.parse(rawDate);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseRawDateInt(row) {
    const rawDate = getField(row, ["start_date", "release_date", "aired", "date", "premiered", "year", "start_year", "season_year"]);
    if (!rawDate) return null;

    const digits = rawDate.replace(/\D/g, "");
    if (digits.length >= 8) {
        return Number(digits.slice(0, 8));
    }
    if (digits.length === 4) {
        return Number(`${digits}0101`);
    }
    return null;
}

function parseCSVList(rawVal) {
    if (!rawVal) return [];
    return String(rawVal)
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
}

function normalizeId(val) {
    if (!val) return null;
    const str = String(val).trim().replace(/\.0+$/, "");
    return str === "" ? null : str;
}

function resolveRootAnime(animeId, animeMap) {
    if (!animeId) return null;

    let currId = animeId;
    const visited = new Set();

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
        return Math.min(...RARITIES.map(r => r.sparkCost));
    }
    if (bannerKey === "LIST") {
        if (!anilistUsername || anilistEligibleKeys.size === 0) return Infinity;
        let minCost = Infinity;
        for (const key of anilistEligibleKeys) {
            const char = characterMap.get(key);
            if (char && char.rarity.sparkCost < minCost) {
                minCost = char.rarity.sparkCost;
            }
        }
        return minCost;
    }
    const themed = THEMED_BANNERS[bannerKey];
    if (!themed || !themed.active || !themed.active.eligibleKeys || themed.active.eligibleKeys.size === 0) {
        return Infinity;
    }
    let minCost = Infinity;
    for (const key of themed.active.eligibleKeys) {
        const char = characterMap.get(key);
        if (char && char.rarity.sparkCost < minCost) {
            minCost = char.rarity.sparkCost;
        }
    }
    return minCost;
}

function updateSparkButtonsUI() {
    document.getElementById("spark-count-standard").textContent = sparkPoints.STANDARD.toLocaleString();
    document.getElementById("spark-standard").disabled          = actionInFlight || !databaseReady || sparkPoints.STANDARD < getMinSparkCost("STANDARD");

    document.getElementById("spark-count-hof").textContent      = sparkPoints.HOF.toLocaleString();
    document.getElementById("spark-hof").disabled               = actionInFlight || !databaseReady || sparkPoints.HOF < getMinSparkCost("HOF");

    const sparkListCountEl = document.getElementById("spark-count-list");
    const sparkListBtnEl   = document.getElementById("spark-list");
    if (sparkListCountEl && sparkListBtnEl) {
        sparkListCountEl.textContent = (sparkPoints.LIST || 0).toLocaleString();
        sparkListBtnEl.disabled      = actionInFlight || !databaseReady || !anilistUsername || (sparkPoints.LIST || 0) < getMinSparkCost("LIST");
    }

    ALL_THEMED_KEYS.forEach(key => {
        const banner = THEMED_BANNERS[key];
        document.getElementById(banner.sparkCountElId).textContent = sparkPoints[key].toLocaleString();
        document.getElementById(banner.sparkBtnElId).disabled      = actionInFlight || !databaseReady || !banner.active || sparkPoints[key] < getMinSparkCost(key);
    });
}

function getSparkIndicatorText(bannerKey) {
    if (bannerKey === "STANDARD") return "Standard Spark";
    if (bannerKey === "HOF") return "Premium Spark";
    if (bannerKey === "LIST") return `${anilistUsername || "List"} Spark`;
    const themed = THEMED_BANNERS[bannerKey];
    return themed && themed.active ? `${themed.active.title} Spark` : `${bannerKey} Spark`;
}

function isCharacterSparkableInBanner(char, bannerKey) {
    if (!bannerKey) return false;
    if (bannerKey === "STANDARD" || bannerKey === "HOF") return true;
    if (bannerKey === "LIST") return Boolean(anilistUsername && anilistEligibleKeys.has(char.uniqueKey));
    const themed = THEMED_BANNERS[bannerKey];
    if (!themed || !themed.active || !themed.active.eligibleKeys) return false;
    return themed.active.eligibleKeys.has(char.uniqueKey);
}

function enterSparkMode(bannerKey) {
    activeSparkBanner = bannerKey;

    setSortControlState("CHARACTER", "POPULARITY", "DESC");
    clearFilterCheckboxes(["#filter-rarity-group", "#filter-own-group", "#filter-lock-group", "#filter-list-group"]);

    document.getElementById("sell-all-btn").classList.add("hidden");
    document.getElementById("filter-own-section").classList.add("hidden");
    document.getElementById("filter-lock-section").classList.add("hidden");

    const indicator = document.getElementById("spark-mode-indicator");
    const label     = document.getElementById("spark-mode-label");
    label.textContent = getSparkIndicatorText(bannerKey);
    indicator.classList.remove("hidden");

    currentPage = 1;
    renderInventory();

    document.getElementById("inventory-grid").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function exitSparkMode() {
    activeSparkBanner = null;
    document.getElementById("sell-all-btn").classList.remove("hidden");
    document.getElementById("filter-own-section").classList.remove("hidden");
    document.getElementById("filter-lock-section").classList.remove("hidden");
    document.getElementById("spark-mode-indicator").classList.add("hidden");
    currentPage = 1;
    renderInventory();
}

async function sparkCharacter(uniqueKey) {
    if (!activeSparkBanner) return;
    const res = await sendGachaAction({ action: "SPARK", bannerType: activeSparkBanner, uniqueKey });
    if (res && activeSparkBanner) {
        exitSparkMode();
    }
}

function getSellMultiplier(ownedCount) {
    if (ownedCount >= 6) return 4;
    if (ownedCount >= 3) return 3;
    if (ownedCount === 2) return 2;
    return 1;
}

async function toggleCardLock(uniqueKey) {
    if (!inventory[uniqueKey] || lockInFlight) return;

    lockInFlight = true;
    updateLockButtonsUI();

    try {
        if (!currentUser) {
            await sendGachaAction({ action: "TOGGLE_LOCK", uniqueKey });
            if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
                renderResults(lastResults, false, lastBannerType);
            }
            return;
        }

        // 1. Optimistic UI update (0ms response)
        if (lockedCards.has(uniqueKey)) lockedCards.delete(uniqueKey);
        else lockedCards.add(uniqueKey);

        renderInventory();
        if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
            renderResults(lastResults, false, lastBannerType);
        }

        // 2. Sync with server in the background (reverts automatically if server rejects)
        await sendGachaAction({ action: "TOGGLE_LOCK", uniqueKey });
        if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
            renderResults(lastResults, false, lastBannerType);
        }
    } finally {
        lockInFlight = false;
        updateLockButtonsUI();
    }
}

function updateSellAllUI() {
    let totalValue = 0;
    for (const [key, ownedCount] of Object.entries(inventory)) {
        if (ownedCount > 0 && !lockedCards.has(key)) {
            const char = characterMap.get(key);
            if (char) {
                totalValue += char.rarity.sellValue * getSellMultiplier(ownedCount);
            }
        }
    }
    document.getElementById("sell-all-amount").textContent = totalValue.toLocaleString();
    document.getElementById("sell-all-btn").disabled = totalValue <= 0;
}

async function sellCharacter(uniqueKey) {
    const count = inventory[uniqueKey] || 0;
    const char = characterMap.get(uniqueKey);
    if (!char || count <= 0 || lockedCards.has(uniqueKey)) return;

    if (!currentUser) {
        await sendGachaAction({ action: "SELL", uniqueKey });
        return;
    }

    // 1. Optimistic UI update (0ms response)
    stars += char.rarity.sellValue * getSellMultiplier(count);
    delete inventory[uniqueKey];
    document.getElementById("unlocked-count").textContent = Object.keys(inventory).length.toLocaleString();
    updateStarsUI();
    renderInventory();

    // 2. Sync authoritative state with server
    await sendGachaAction({ action: "SELL", uniqueKey });
}

async function sellAllUnlocked() {
    await sendGachaAction({ action: "SELL_ALL" });
    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
        renderResults(lastResults, false, lastBannerType);
    }
}

async function fetchCSV(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url} (HTTP ${response.status})`);

    const csvText = await response.text();

    return new Promise((resolve, reject) => {Papa.parse(csvText, {
        header          : true,
        skipEmptyLines  : true,
        complete        : (results) => resolve(results.data),
        error           : (err)     => reject(err)
    })});
}

async function initDatabase() {
    try {
        const [
            rawAnime,
            rawChars,
            rawEras,
            rawFranchises,
            rawGenres,
            rawSources,
            rawStudios,
            rawTags
        ] = await Promise.all([
            fetchCSV("./dataset/anime.csv"),
            fetchCSV("./dataset/char.csv"),
            fetchCSV("./dataset/era.csv"),
            fetchCSV("./dataset/franchise.csv"),
            fetchCSV("./dataset/genre.csv"),
            fetchCSV("./dataset/source.csv"),
            fetchCSV("./dataset/studio.csv"),
            fetchCSV("./dataset/tag.csv")
        ]);

        const animeMap = new Map();
        rawAnime.forEach(row => {
            const id = normalizeId(getField(row, ["id", "anime_id"]));
            if (!id) return;

            const romaji      = getField(row, ["romaji",  "title_romaji", "title"]);
            const english     = getField(row, ["english", "title_english"]);
            const animeCount  = parseFloat(getField(row, ["count", "favorites", "favourites", "popularity"])) || 0;
            const animeDate   = parseAnimeDate(row);
            const rawDateInt  = parseRawDateInt(row);
            const rootId      = normalizeId(getField(row, ["root_id", "root_anime_id", "root"]));
            const parentId    = normalizeId(getField(row, ["parent_id", "prequel_id", "parent_anime_id", "source_anime_id"]));
            const genres      = new Set(parseCSVList(getField(row, ["genres", "genre"])));
            const tags        = new Set(parseCSVList(getField(row, ["tags", "tag"])));
            const studios     = new Set(parseCSVList(getField(row, ["studios", "studio"])));
            const source      = getField(row, ["source"]);

            animeMap.set(id, { id, romaji, english, animeCount, animeDate, rawDateInt, rootId, parentId, genres, tags, studios, source });
        });

        let chars = rawChars.map((row, idx) => {
            const rawCharId         = getField(row, ["id", "char_id", "character_id"]);
            const uniqueKey         = rawCharId ? `${rawCharId}_${idx}` : String(idx);
            const name              = getField(row, ["name", "full_name", "character_name"]) || `Character #${idx + 1}`;
            const explicitRootId    = normalizeId(getField(row, ["root_anime_id", "root_id"]));
            const normalizedAnimeId = normalizeId(getField(row, ["anime_id"]));
            const directAnimeInfo   = normalizedAnimeId ? animeMap.get(normalizedAnimeId) : null;
            const animeInfo         = resolveRootAnime(explicitRootId || normalizedAnimeId, animeMap);
            const animeRomaji       = animeInfo ? animeInfo.romaji : null;
            const animeEnglish      = animeInfo ? animeInfo.english : null;
            const animeCount        = animeInfo ? animeInfo.animeCount : 0;
            const animeDate         = animeInfo ? animeInfo.animeDate : null;
            const rawDateInt        = animeInfo ? animeInfo.rawDateInt : null;
            const animeYear         = rawDateInt ? Math.floor(rawDateInt / 10000) : null;
            const rootAnimeId       = animeInfo ? animeInfo.id : normalizedAnimeId;
            const genres            = directAnimeInfo ? directAnimeInfo.genres : new Set();
            const tags              = directAnimeInfo ? directAnimeInfo.tags : new Set();
            const studios           = directAnimeInfo ? directAnimeInfo.studios : new Set();
            const source            = directAnimeInfo ? directAnimeInfo.source : null;
            const imgSuffix         = getField(row, ["image", "img", "image_url", "avatar", "picture", "suffix"]);
            const countVal          = parseFloat(getField(row, ["count"])) || 0;
            let imageUrl            = null;

            if (imgSuffix) {imageUrl = imgSuffix.startsWith("http") ? imgSuffix : IMAGE_PREFIX + imgSuffix.replace(/^\/+/, "")}
            return {
                uniqueKey,
                name,
                animeId: normalizedAnimeId,
                rootAnimeId,
                animeRomaji,
                animeEnglish,
                imageUrl,
                count: countVal,
                animeCount,
                animeDate,
                rawDateInt,
                animeYear,
                genres,
                tags,
                studios,
                source
            };
        });

        chars.sort((a, b) => b.count - a.count);
        const total = chars.length;

        chars.forEach((char, i) => {
            const percentile    = i / total;
            let assigned        = RARITIES[RARITIES.length - 1];
            let acc             = 0;

            for (const r of RARITIES) {
                acc += r.dist;

                if (percentile < acc) {
                    assigned = r;
                    break;
                }
            }

            char.rarity = assigned;
        });

        characterPool = chars;
        characterMap  = new Map(chars.map(c => [c.uniqueKey, c]));
        rebuildAnilistEligibleKeys();

        const eraOptions = rawEras.map(row => {
            const title     = getField(row, ["era", "name"]);
            const startRaw  = getField(row, ["start"]);
            const endRaw    = getField(row, ["end"]);
            const startYear = startRaw !== null ? Math.floor(Number(startRaw)) : null;
            const endYear   = endRaw !== null ? Math.floor(Number(endRaw)) : null;
            const hasStart  = startYear !== null && !Number.isNaN(startYear);
            const hasEnd    = endYear !== null && !Number.isNaN(endYear);
            const startDate = hasStart ? Number(`${startYear}0101`) : -Infinity;
            const endDate   = hasEnd ? Number(`${endYear}9999`) : Infinity;

            const matching = chars.filter(c =>
                c.rawDateInt !== null &&
                c.rawDateInt >= startDate &&
                c.rawDateInt <= endDate
            );

            const isUnboundedOrDecade = title === "Pre-2000s" || title === "2000s";
            const hoverLabel = (title && hasStart && hasEnd && !isUnboundedOrDecade)
                ? `${title} (${startYear}-${endYear})`
                : title;
            const sortOrder = hasStart ? startYear : -Infinity;

            return title ? {
                title,
                hoverLabel,
                sortOrder,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);
        THEMED_BANNERS.ERA.allOptions = eraOptions;

        const franchiseOptions = rawFranchises.map(row => {
            const title      = getField(row, ["clean", "franchise", "name"]);
            const relatedIds = new Set(parseCSVList(getField(row, ["related"])).map(normalizeId).filter(Boolean));
            const rootId     = normalizeId(getField(row, ["id"]));
            if (rootId) relatedIds.add(rootId);

            const matching = chars.filter(c =>
                (c.animeId && relatedIds.has(c.animeId)) ||
                (c.rootAnimeId && relatedIds.has(c.rootAnimeId))
            );

            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);
        THEMED_BANNERS.FRANCHISE.allOptions = franchiseOptions;

        const genreOptions = rawGenres.map(row => {
            const title = getField(row, ["genre", "name"]);
            const matching = title ? chars.filter(c => c.genres.has(title)) : [];
            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);
        THEMED_BANNERS.GENRE.allOptions = genreOptions;

        const sourceOptions = rawSources.map(row => {
            const title = getField(row, ["source", "name"]);
            const matching = title ? chars.filter(c => c.source === title) : [];
            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);
        THEMED_BANNERS.SOURCE.allOptions = sourceOptions;

        const studioOptions = rawStudios.map(row => {
            const rawStudio = getField(row, ["studio"]);
            const title     = getField(row, ["clean", "studio", "name"]);
            const matching  = rawStudio ? chars.filter(c => c.studios.has(rawStudio)) : [];
            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);
        THEMED_BANNERS.STUDIO.allOptions = studioOptions;

        const tagOptions = rawTags.map(row => {
            const rawTag   = getField(row, ["tag"]);
            const title    = getField(row, ["clean", "tag", "name"]);
            const matching = rawTag ? chars.filter(c => c.tags.has(rawTag)) : [];
            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);
        THEMED_BANNERS.TAG.allOptions = tagOptions;

        databaseReady = true;
        document.getElementById("pool-count").textContent = chars.length.toLocaleString();

        if (isSharedView) {
            await loadSharedCollection(sharedUserId);
            if (currentUser) {
                await loadCloudSave(currentUser);
            } else {
                updateHeaderProfileUI();
                updateStarsUI();
            }
        } else {
            applyDailyBanners(getClientDailyBanners());
            if (currentUser) {
                await loadCloudSave(currentUser);
            }
            updateHeaderProfileUI();
            updateSparkButtonsUI();
            updateStarsUI();
            renderInventory();
            hintBannerSwipe();
        }
    } catch (err) {
        console.error(err);

        document.getElementById("error-banner").classList.remove("hidden");
        document.getElementById("error-detail").textContent = err.message;
    }
}

async function performSummon(count, bannerType = "STANDARD") {
    // Check if 00:00 JST passed while the user left the browser tab open
    const nowJstDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date());

    if (activeDailyJstDate && nowJstDate !== activeDailyJstDate) {
        if (currentUser) {
            await sendGachaAction({ action: "INIT" });
        } else {
            applyDailyBanners(getClientDailyBanners());
        }
        alert("Daily banners just rotated at 00:00 JST! Please review today's banners before summoning.");
        return;
    }

    const res = await sendGachaAction({ action: "SUMMON", bannerType });
    if (!res) return;

    // Convert the server's returned uniqueKeys back into full character objects for rendering
    const results = res.rolledResults.map(r => ({
        char: characterMap.get(r.uniqueKey),
        occurrenceCount: r.occurrenceCount
    }));

    lastResults    = results;
    lastBannerType = bannerType;
    renderResults(results, true, bannerType);
}

function createCardHTML(char, { duplicateCount = null, animateDelay = 0, extraClass = "", showSparkButton = false, canAffordSpark = false, showSellButton = false } = {}) {
    const r             = char.rarity;
    const safeName      = escapeHTML(char.name);
    const safeAnime     = escapeHTML(getAnimeTitle(char));
    const fullTooltip   = `${safeName}\n${safeAnime}`;
    const listPrefix    = isListCharacter(char) ? "L" : "";
    const dupLevel      = duplicateCount >= 6 ? "3"
                        : duplicateCount >= 3 ? "2"
                        : duplicateCount === 2 ? "1"
                        : "";

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
            <button type="button" data-sell-key="${escapeHTML(char.uniqueKey)}" ${isLocked ? "disabled" : ""}
                class="sell-card-btn w-full py-1 rounded text-[11px] font-bold ${sellBtnColors} disabled:opacity-40 disabled:cursor-not-allowed transition">
                Sell: ★ ${sellTotal}
            </button>
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
                class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-help ${r.badge}">
                ${listPrefix}${r.tier}${dupLevel}
            </span>
            ${lockBadgeHtml}
            </div>
            <div class="px-1.5 py-1 flex-1 flex flex-col justify-center text-center gap-0.5">
            <div class="font-bold text-xs leading-tight line-clamp-1">
                ${safeName}
            </div>
            <div class="text-[10px] opacity-85 leading-tight line-clamp-1">
                ${safeAnime}
            </div>
            </div>
            ${sparkFooterHtml}
            ${sellFooterHtml}
        </div>
        </div>
    `;
}

function renderResults(results, animate = false, bannerType = lastBannerType) {
    const section        = document.getElementById("results-section");
    const grid           = document.getElementById("results-grid");
    const isThemedBanner = Boolean(THEMED_BANNERS[bannerType]) || bannerType === "LIST";

    // Mobile (<640px) hides separators completely, so 3 cards fit cleanly per row (3-3-3-1 layout).
    // Tablet (sm: 640px–1023px) shows 5 cards per row (1 separator on row 1, and 1 separator on row 2 if themed).
    // Desktop (lg: 1024px+) shows all 10 cards + separators on a single row.
    const cardWidthClass = isThemedBanner
        ? "w-[calc((100%-1rem)/3)] sm:w-[calc((100%-3.0625rem)/5)] lg:w-[calc((100%-5.625rem)/10)]"
        : "w-[calc((100%-1rem)/3)] sm:w-[calc((100%-3.0625rem)/5)] lg:w-[calc((100%-5.0625rem)/10)]";

    const separatorHTML = `<div aria-hidden="true" class="hidden sm:block w-px self-stretch bg-slate-300 dark:bg-slate-700 shrink-0"></div>`;

    section.classList.remove("hidden");
    grid.innerHTML = results.map((res, idx) => {
        const cardHTML = createCardHTML(res.char, {
            duplicateCount: res.occurrenceCount > 1 ? res.occurrenceCount : null,
            animateDelay: animate ? idx * 60 : 0,
            extraClass: `${cardWidthClass} shrink-0`
        });

        const needsSeparatorAfter = idx === 0 || (isThemedBanner && idx === 4);
        return needsSeparatorAfter ? `${cardHTML}${separatorHTML}` : cardHTML;
    }).join("");
}

function getCharacterLevel(ownedCount) {
    if (ownedCount >= 6) return 3;
    if (ownedCount >= 3) return 2;
    if (ownedCount === 2) return 1;
    return 0;
}

const RARITY_ORDER = new Map(RARITIES.map((r, idx) => [r.tier, idx]));

function compareHighestRarity(a, b) {
    return (RARITY_ORDER.get(a.rarity.tier) ?? 99) - (RARITY_ORDER.get(b.rarity.tier) ?? 99);
}

function popularityTiebreaker(a, b) {
    return (b.count - a.count) || compareHighestRarity(a, b) || (b.animeCount - a.animeCount);
}

function sortCharacters(list, sortMode) {
    return list.slice().sort((a, b) => {
        switch (sortMode) {
            case "RARITY_ASC":
                return -compareHighestRarity(a, b) || popularityTiebreaker(a, b);
            case "CHAR_COUNT_DESC":
                return popularityTiebreaker(a, b);
            case "CHAR_COUNT_ASC":
                return (a.count - b.count) || popularityTiebreaker(a, b);
            case "LEVEL_DESC": {
                const diff = getCharacterLevel(inventory[b.uniqueKey] || 0) - getCharacterLevel(inventory[a.uniqueKey] || 0);
                return diff || popularityTiebreaker(a, b);
            }
            case "LEVEL_ASC": {
                const diff = getCharacterLevel(inventory[a.uniqueKey] || 0) - getCharacterLevel(inventory[b.uniqueKey] || 0);
                return diff || popularityTiebreaker(a, b);
            }
            case "ANIME_COUNT_DESC":
                return (b.animeCount - a.animeCount) || popularityTiebreaker(a, b);
            case "ANIME_COUNT_ASC":
                return (a.animeCount - b.animeCount) || popularityTiebreaker(a, b);
            case "CHAR_AZ":
                return a.name.localeCompare(b.name) || popularityTiebreaker(a, b);
            case "CHAR_ZA":
                return b.name.localeCompare(a.name) || popularityTiebreaker(a, b);
            case "ANIME_AZ":
                return getAnimeTitle(a).localeCompare(getAnimeTitle(b)) || popularityTiebreaker(a, b);
            case "ANIME_ZA":
                return getAnimeTitle(b).localeCompare(getAnimeTitle(a)) || popularityTiebreaker(a, b);
            case "DATE_NEW":
                if (a.animeDate === null && b.animeDate === null) return popularityTiebreaker(a, b);
                if (a.animeDate === null) return 1;
                if (b.animeDate === null) return -1;
                return (b.animeDate - a.animeDate) || popularityTiebreaker(a, b);
            case "DATE_OLD":
                if (a.animeDate === null && b.animeDate === null) return popularityTiebreaker(a, b);
                if (a.animeDate === null) return 1;
                if (b.animeDate === null) return -1;
                return (a.animeDate - b.animeDate) || popularityTiebreaker(a, b);
            case "RARITY_DESC":
            default:
                return compareHighestRarity(a, b) || popularityTiebreaker(a, b);
        }
    });
}

function parseSearchQuery(rawQuery) {
    const tokens = [];
    // Matches field:value (with optional quotes), field>= / <= / > / < / = value, or bare words/phrases
    const regex = /([a-zA-Z_]+)\s*(:|>=|<=|>|<|=)\s*(?:"([^"]*)"|'([^']*)'|(\S+))|"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;

    while ((match = regex.exec(rawQuery)) !== null) {
        if (match[1]) {
            const field = match[1].toLowerCase();
            const op    = match[2];
            const val   = (match[3] ?? match[4] ?? match[5] ?? "").toLowerCase().trim();
            if (val !== "") {
                tokens.push({ field, op, val });
            }
        } else {
            const term = (match[6] ?? match[7] ?? match[8] ?? "").toLowerCase().trim();
            if (term !== "") {
                tokens.push({ field: null, op: ":", val: term });
            }
        }
    }

    return tokens;
}

function compareNumeric(actual, op, target) {
    if (actual === null || actual === undefined || Number.isNaN(actual)) return false;
    switch (op) {
        case ">":  return actual > target;
        case ">=": return actual >= target;
        case "<":  return actual < target;
        case "<=": return actual <= target;
        case "=":
        case ":":  return actual === target;
        default:   return false;
    }
}

function matchesSearchTokens(char, tokens) {
    if (tokens.length === 0) return true;

    for (const tok of tokens) {
        const { field, op, val } = tok;

        if (!field) {
            const nameMatch    = char.name.toLowerCase().includes(val);
            const romajiMatch  = char.animeRomaji && char.animeRomaji.toLowerCase().includes(val);
            const englishMatch = char.animeEnglish && char.animeEnglish.toLowerCase().includes(val);
            if (!nameMatch && !romajiMatch && !englishMatch) return false;
            continue;
        }

        if (field === "character" || field === "char" || field === "name") {
            if (!char.name.toLowerCase().includes(val)) return false;
        } else if (field === "anime" || field === "series" || field === "title") {
            const numVal = Number(val);
            const isNumericComparison = (op === ">" || op === ">=" || op === "<" || op === "<=" || op === "=") && !Number.isNaN(numVal);
            if (isNumericComparison || (/^\d{4}$/.test(val) && op !== ":")) {
                if (!compareNumeric(char.animeYear, op, numVal)) return false;
            } else {
                const romajiMatch  = char.animeRomaji && char.animeRomaji.toLowerCase().includes(val);
                const englishMatch = char.animeEnglish && char.animeEnglish.toLowerCase().includes(val);
                if (!romajiMatch && !englishMatch) return false;
            }
        } else if (field === "year" || field === "era") {
            const numVal = Number(val);
            if (Number.isNaN(numVal)) return false;
            if (!compareNumeric(char.animeYear, op, numVal)) return false;
        } else if (field === "genre" || field === "genres") {
            const found = Array.from(char.genres).some(g => g.toLowerCase().includes(val));
            if (!found) return false;
        } else if (field === "tag" || field === "tags") {
            const found = Array.from(char.tags).some(t => t.toLowerCase().includes(val));
            if (!found) return false;
        } else if (field === "studio" || field === "studios") {
            const found = Array.from(char.studios).some(s => s.toLowerCase().includes(val));
            if (!found) return false;
        } else if (field === "source") {
            if (!char.source || !char.source.toLowerCase().includes(val)) return false;
        } else if (field === "tier" || field === "rarity") {
            if (char.rarity.tier.toLowerCase() !== val) return false;
        } else if (field === "spark" || field === "cost") {
            const numVal = Number(val);
            if (Number.isNaN(numVal)) return false;
            if (!compareNumeric(char.rarity.sparkCost, op, numVal)) return false;
        } else if (field === "owned" || field === "count") {
            const ownedCount = inventory[char.uniqueKey] || 0;
            const numVal = Number(val);
            if (Number.isNaN(numVal)) return false;
            if (!compareNumeric(ownedCount, op, numVal)) return false;
        } else if (field === "level" || field === "lvl") {
            const charLevel = getCharacterLevel(inventory[char.uniqueKey] || 0);
            const numVal = Number(val);
            if (Number.isNaN(numVal)) return false;
            if (!compareNumeric(charLevel, op, numVal)) return false;
        } else {
            // Fallback: treat unknown field:val as general substring search
            const fallback = `${field}${op}${val}`;
            const nameMatch    = char.name.toLowerCase().includes(fallback);
            const romajiMatch  = char.animeRomaji && char.animeRomaji.toLowerCase().includes(fallback);
            const englishMatch = char.animeEnglish && char.animeEnglish.toLowerCase().includes(fallback);
            if (!nameMatch && !romajiMatch && !englishMatch) return false;
        }
    }

    return true;
}

function renderInventory() {
    updateSellAllUI();

    const grid          = document.getElementById("inventory-grid");
    const paginationEls = document.querySelectorAll(".pagination-controls");
    if (characterPool.length === 0) return;

    const selectedRarities = getCheckedValues("#filter-rarity-group");
    const selectedOwn      = getCheckedValues("#filter-own-group");
    const selectedLock     = getCheckedValues("#filter-lock-group");
    const selectedList     = getCheckedValues("#filter-list-group");
    const sortMode         = getResolvedSortMode();
    const rawQuery         = document.getElementById("search-input").value.trim();
    const searchTokens     = parseSearchQuery(rawQuery);
    const itemsPerPage     = getItemsPerPage();
    const isSparkMode      = activeSparkBanner !== null;
    const availableSpark   = isSparkMode ? sparkPoints[activeSparkBanner] : 0;
    const isAnilistLinked  = Boolean(anilistUsername);

    document.getElementById("filter-list-section")?.classList.toggle("hidden", !isAnilistLinked);
    document.getElementById("filter-status-row")?.classList.toggle("hidden", isSparkMode && !isAnilistLinked);

    let filtered = characterPool.filter(c => {
        const isOwned  = Boolean(inventory[c.uniqueKey]);
        const isLocked = isOwned && lockedCards.has(c.uniqueKey);

        if (isSparkMode) {
            if (!isCharacterSparkableInBanner(c, activeSparkBanner)) return false;
            if (availableSpark < c.rarity.sparkCost)                 return false;
        } else {
            if (selectedOwn.size > 0) {
                const ownMatch = (selectedOwn.has("OWNED") && isOwned) || (selectedOwn.has("UNOWNED") && !isOwned);
                if (!ownMatch) return false;
            }
            if (selectedLock.size > 0) {
                const lockMatch = (selectedLock.has("LOCKED") && isLocked) || (selectedLock.has("UNLOCKED") && isOwned && !isLocked);
                if (!lockMatch) return false;
            }
        }

        if (selectedRarities.size > 0 && !selectedRarities.has(c.rarity.tier)) return false;

        if (isAnilistLinked && selectedList.size > 0) {
            const onList = isListCharacter(c);
            const listMatch = (selectedList.has("IN_LIST") && onList) || (selectedList.has("NOT_IN_LIST") && !onList);
            if (!listMatch) return false;
        }

        if (!matchesSearchTokens(c, searchTokens)) return false;
        return true;
    });

    if (filtered.length === 0) {
        const emptyMsg = isSparkMode
            ? "No affordable sparkable characters match the current filter"
            : "No characters match the current filter";
        grid.innerHTML = `<div class="col-span-full text-center py-8 text-slate-500 text-sm">${emptyMsg}</div>`;
        paginationEls.forEach(el => el.classList.add("hidden"));
        return;
    }

    filtered = sortCharacters(filtered, sortMode);

    totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex   = (currentPage - 1) * itemsPerPage;
    const displaySlice = filtered.slice(startIndex, startIndex + itemsPerPage);

    grid.innerHTML = displaySlice.map(c => {
        const ownedCount = inventory[c.uniqueKey] || 0;
        const canAfford  = isSparkMode && availableSpark >= c.rarity.sparkCost;

        const card = createCardHTML(c, {
            duplicateCount  : ownedCount > 1 ? ownedCount : null,
            showSparkButton : isSparkMode && !isSharedView,
            canAffordSpark  : canAfford,
            showSellButton  : !isSparkMode && !isSharedView && ownedCount > 0
        });

        return ownedCount === 0 && !isSparkMode
            ? `<div class="opacity-35 grayscale hover:grayscale-0 hover:opacity-80 transition">${card}</div>`
            : card;
    }).join("");

    if (totalPages > 1) {
        paginationEls.forEach(el => el.classList.remove("hidden"));
        document.querySelectorAll(".page-input").forEach(el => { el.value = currentPage; el.max = totalPages; });
        document.querySelectorAll(".total-pages").forEach(el => { el.textContent = totalPages; });
        document.querySelectorAll(".first-page").forEach(el => { el.disabled = currentPage <= 1; });
        document.querySelectorAll(".prev-page").forEach(el => { el.disabled = currentPage <= 1; });
        document.querySelectorAll(".next-page").forEach(el => { el.disabled = currentPage >= totalPages; });
        document.querySelectorAll(".last-page").forEach(el => { el.disabled = currentPage >= totalPages; });
    } else {
        paginationEls.forEach(el => el.classList.add("hidden"));
    }
}

function resetPageAndRender() {
    currentPage = 1;
    renderInventory();
}

const themeToggleBtn = document.getElementById("theme-toggle");
themeToggleBtn.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("anigacha_theme", isDark ? "dark" : "light");
});

const langToggleBtn = document.getElementById("lang-toggle");
langToggleBtn.textContent = titleLang;
langToggleBtn.addEventListener("click", () => {
    titleLang = titleLang === "JP" ? "EN" : "JP";
    localStorage.setItem("anigacha_lang", titleLang);
    langToggleBtn.textContent = titleLang;

    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) {
        renderResults(lastResults, false, lastBannerType);
    }
    renderInventory();
});

// --- Sort & Filter Dropdown ---
const SORT_FIELDS_BY_ENTITY = {
    CHARACTER: [
        { value: "RARITY",     label: "Rarity" },
        { value: "POPULARITY", label: "Popularity" },
        { value: "LEVEL",      label: "Level" },
        { value: "NAME",       label: "Name" }
    ],
    ANIME: [
        { value: "POPULARITY", label: "Popularity" },
        { value: "NAME",       label: "Name" },
        { value: "DATE",       label: "Date" }
    ]
};

function getCheckedValues(containerSelector) {
    return new Set(
        Array.from(document.querySelectorAll(`${containerSelector} input[type="checkbox"]:checked`))
            .map(cb => cb.value)
    );
}

function clearFilterCheckboxes(selectors) {
    selectors.forEach(sel => {
        document.querySelectorAll(`${sel} input[type="checkbox"]`).forEach(cb => {
            cb.checked = false;
        });
    });
}

function closeAllCustomSelects(exceptWrapper = null) {
    document.querySelectorAll(".custom-select-wrapper").forEach(wrapper => {
        if (wrapper === exceptWrapper) return;
        wrapper.querySelector(".custom-select-menu")?.classList.add("hidden");
        wrapper.querySelector(".custom-select-chevron")?.classList.remove("rotate-180");
    });
}

function syncCustomSelectUI(wrapper) {
    const select  = wrapper.querySelector("select");
    const labelEl = wrapper.querySelector(".custom-select-label");
    const menu    = wrapper.querySelector(".custom-select-menu");
    if (!select || !labelEl || !menu) return;

    const selectedOpt = select.options[select.selectedIndex];
    labelEl.textContent = selectedOpt ? selectedOpt.textContent : "";

    menu.innerHTML = Array.from(select.options).map(opt => {
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

function initCustomSelects() {
    document.querySelectorAll(".custom-select-wrapper").forEach(wrapper => {
        const select  = wrapper.querySelector("select");
        const trigger = wrapper.querySelector(".custom-select-trigger");
        const menu    = wrapper.querySelector(".custom-select-menu");
        const chevron = wrapper.querySelector(".custom-select-chevron");
        if (!select || !trigger || !menu) return;

        syncCustomSelectUI(wrapper);

        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            const isHidden = menu.classList.contains("hidden");
            closeAllCustomSelects(wrapper);
            menu.classList.toggle("hidden", !isHidden);
            chevron?.classList.toggle("rotate-180", isHidden);
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
            menu.classList.add("hidden");
            chevron?.classList.remove("rotate-180");
        });
    });
}

function syncSortFieldOptions(preferredField = null) {
    const entityEl = document.getElementById("sort-entity");
    const fieldEl  = document.getElementById("sort-field");
    if (!entityEl || !fieldEl) return;

    const currentField = preferredField || fieldEl.value;
    const options      = SORT_FIELDS_BY_ENTITY[entityEl.value] || SORT_FIELDS_BY_ENTITY.CHARACTER;

    fieldEl.innerHTML = options
        .map(o => `<option value="${o.value}">${o.label}</option>`)
        .join("");

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
    const entity = document.getElementById("sort-entity")?.value || "CHARACTER";
    const field  = document.getElementById("sort-field")?.value || "RARITY";
    const dir    = document.getElementById("sort-dir-btn")?.dataset.dir || "DESC";

    if (entity === "CHARACTER") {
        if (field === "RARITY")     return dir === "ASC" ? "RARITY_ASC" : "RARITY_DESC";
        if (field === "POPULARITY") return dir === "ASC" ? "CHAR_COUNT_ASC" : "CHAR_COUNT_DESC";
        if (field === "LEVEL")      return dir === "ASC" ? "LEVEL_ASC" : "LEVEL_DESC";
        if (field === "NAME")       return dir === "ASC" ? "CHAR_ZA" : "CHAR_AZ";
    } else {
        if (field === "POPULARITY") return dir === "ASC" ? "ANIME_COUNT_ASC" : "ANIME_COUNT_DESC";
        if (field === "NAME")       return dir === "ASC" ? "ANIME_ZA" : "ANIME_AZ";
        if (field === "DATE")       return dir === "ASC" ? "DATE_OLD" : "DATE_NEW";
    }
    return "RARITY_DESC";
}

function initSortFilterDropdown() {
    const wrapper = document.getElementById("sort-filter-wrapper");
    const trigger = document.getElementById("sort-filter-trigger");
    const menu    = document.getElementById("sort-filter-menu");
    const chevron = document.getElementById("sort-filter-chevron");
    if (!wrapper || !trigger || !menu) return;

    initCustomSelects();
    syncSortFieldOptions("RARITY");

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllCustomSelects();
        const isHidden = menu.classList.contains("hidden");
        menu.classList.toggle("hidden", !isHidden);
        chevron?.classList.toggle("rotate-180", isHidden);
    });

    menu.addEventListener("click", (e) => {
        if (!e.target.closest(".custom-select-wrapper")) {
            closeAllCustomSelects();
        }
        e.stopPropagation();
    });

    document.getElementById("sort-entity")?.addEventListener("change", () => {
        syncSortFieldOptions();
        resetPageAndRender();
    });

    document.getElementById("sort-field")?.addEventListener("change", resetPageAndRender);

    document.getElementById("sort-dir-btn")?.addEventListener("click", (e) => {
        const btn     = e.currentTarget;
        const nextDir = btn.dataset.dir === "DESC" ? "ASC" : "DESC";
        btn.dataset.dir = nextDir;
        btn.textContent = nextDir === "ASC" ? "▲" : "▼";
        resetPageAndRender();
    });

    menu.addEventListener("change", (e) => {
        if (e.target.matches('input[type="checkbox"]')) {
            resetPageAndRender();
        }
    });

    document.addEventListener("click", () => {
        closeAllCustomSelects();
        menu.classList.add("hidden");
        chevron?.classList.remove("rotate-180");
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAllCustomSelects();
            menu.classList.add("hidden");
            chevron?.classList.remove("rotate-180");
            closeAnilistModal();
            document.getElementById("share-modal")?.classList.add("hidden");
            document.getElementById("photo-modal")?.classList.add("hidden");
        }
    });
}

initSortFilterDropdown();

function initGlobalTooltips() {
    const tooltipEl  = document.getElementById("global-tooltip");
    const headerEl   = document.getElementById("global-tooltip-header");
    const titleEl    = document.getElementById("global-tooltip-title");
    const bodyEl     = document.getElementById("global-tooltip-body");
    const listWrapEl = document.getElementById("global-tooltip-list-wrap");
    const listEl     = document.getElementById("global-tooltip-list");
    if (!tooltipEl) return;

    let activeTarget      = null;
    let longPressTimer    = null;
    let suppressNextClick = false;
    const isTouchDevice   = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;

    function isNonInteractiveTooltipTarget(el) {
        return !el.closest("button, a, input, select, [data-lock-key], [data-sell-key], [data-spark-key]");
    }

    function syncTooltipContent(el) {
        // Promote native title -> data-tooltip so browser default popup never appears
        if (el.hasAttribute("title")) {
            const raw = el.getAttribute("title");
            if (raw) el.setAttribute("data-tooltip", raw);
            el.removeAttribute("title");
        }

        const rawText = el.getAttribute("data-tooltip");
        if (!rawText) return false;

        const customTitle = el.getAttribute("data-tooltip-title");
        const lines       = rawText.split("\n").map(l => l.trim());

        // Blank line separates explanation lines from pill entries (e.g., themed banner rotations)
        const splitIdx  = lines.indexOf("");
        const descLines = (splitIdx >= 0 ? lines.slice(0, splitIdx) : lines).filter(Boolean);
        const listItems = splitIdx >= 0 ? lines.slice(splitIdx + 1).filter(Boolean) : [];

        // Keep explicit line breaks intact without premature wrapping
        const lineClass = "sm:whitespace-nowrap";

        if (customTitle) {
            titleEl.textContent = customTitle;
            headerEl.classList.remove("hidden");
            bodyEl.className = "mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300 space-y-0.5";
            bodyEl.innerHTML = descLines.map(l => `<p class="${lineClass}">${escapeHTML(l)}</p>`).join("");
        } else if (descLines.length > 1) {
            // Two-line tooltips (e.g., Character Name + Anime Title on cards)
            titleEl.textContent = descLines[0];
            headerEl.classList.remove("hidden");
            bodyEl.className = "mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400 space-y-0.5";
            bodyEl.innerHTML = descLines.slice(1).map(l => `<p class="${lineClass}">${escapeHTML(l)}</p>`).join("");
        } else {
            // Single-line compact tooltips (e.g., Lock card, First Page, etc.)
            headerEl.classList.add("hidden");
            bodyEl.className = "text-[11px] font-semibold leading-snug text-slate-800 dark:text-slate-100";
            bodyEl.innerHTML = descLines.map(l => `<p class="${lineClass}">${escapeHTML(l)}</p>`).join("");
        }

        if (listItems.length > 0) {
            listEl.innerHTML = listItems.map(item =>
                `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">${escapeHTML(item)}</span>`
            ).join("");
            listWrapEl.classList.remove("hidden");
        } else {
            listWrapEl.classList.add("hidden");
        }

        return true;
    }

    function positionTooltip(el) {
        const margin   = 8;
        const maxAvail = window.innerWidth - margin * 2;
        const hasList  = !listWrapEl.classList.contains("hidden");

        // Measure width solely from header + explanation lines so pill lists wrap inside that width
        tooltipEl.style.width    = "max-content";
        tooltipEl.style.maxWidth = `${maxAvail}px`;
        if (hasList) listWrapEl.classList.add("hidden");

        const contentW = Math.min(tooltipEl.offsetWidth, maxAvail);

        if (hasList) {
            tooltipEl.style.width = `${contentW}px`;
            listWrapEl.classList.remove("hidden");
        }

        const rect = el.getBoundingClientRect();
        const tipW = tooltipEl.offsetWidth;
        const tipH = tooltipEl.offsetHeight;

        let left = rect.left + rect.width / 2 - tipW / 2;
        left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));

        let top = rect.bottom + 8;
        if (top + tipH > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - tipH - 8);
        }

        tooltipEl.style.left = `${Math.round(left)}px`;
        tooltipEl.style.top  = `${Math.round(top)}px`;
    }

    function showTooltip(el) {
        if (!syncTooltipContent(el)) return;
        activeTarget = el;
        positionTooltip(el);
        tooltipEl.classList.remove("opacity-0");
        tooltipEl.classList.add("opacity-100");
    }

    function hideTooltip() {
        activeTarget = null;
        tooltipEl.classList.remove("opacity-100");
        tooltipEl.classList.add("opacity-0");
    }

    document.addEventListener("mouseover", (e) => {
        if (isTouchDevice()) return;
        const target = e.target.closest("[title], [data-tooltip]");
        if (!target) {
            if (activeTarget) hideTooltip();
            return;
        }
        if (target !== activeTarget) {
            showTooltip(target);
        }
    });

    document.addEventListener("mouseout", (e) => {
        if (isTouchDevice() || !activeTarget) return;
        const next = e.relatedTarget?.closest?.("[title], [data-tooltip]");
        if (next !== activeTarget) {
            hideTooltip();
        }
    });

    document.addEventListener("touchstart", (e) => {
        if (!isTouchDevice()) return;
        const target = e.target.closest("[title], [data-tooltip]");

        if (!target) {
            hideTooltip();
            return;
        }

        if (isNonInteractiveTooltipTarget(target)) {
            if (activeTarget === target) {
                hideTooltip();
            } else {
                showTooltip(target);
            }
            return;
        }

        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            showTooltip(target);
            suppressNextClick = true;
        }, 400);
    }, { passive: true });

    document.addEventListener("touchmove", () => {
        clearTimeout(longPressTimer);
    }, { passive: true });

    document.addEventListener("touchend", () => {
        clearTimeout(longPressTimer);
    });

    document.addEventListener("focusin", (e) => {
        if (isTouchDevice()) return;
        const target = e.target.closest("[title], [data-tooltip]");
        if (target) showTooltip(target);
    });

    document.addEventListener("focusout", () => {
        if (!isTouchDevice()) hideTooltip();
    });

    document.addEventListener("scroll", () => { if (activeTarget) hideTooltip(); }, true);
    document.addEventListener("click", (e) => {
        if (suppressNextClick) {
            e.preventDefault();
            e.stopPropagation();
            suppressNextClick = false;
            return;
        }

        // Refresh tooltip immediately if user clicked a toggle (e.g., Lock -> Unlock)
        if (activeTarget && document.body.contains(activeTarget)) {
            if (!isTouchDevice() || isNonInteractiveTooltipTarget(activeTarget)) {
                syncTooltipContent(activeTarget);
                positionTooltip(activeTarget);
            } else {
                hideTooltip();
            }
        } else {
            hideTooltip();
        }
    }, true);
}

initGlobalTooltips();

let lastIsMobile = window.innerWidth < 640;
window.addEventListener("resize", () => {
    const isMobile = window.innerWidth < 640;
    if (isMobile !== lastIsMobile) {
        lastIsMobile = isMobile;
        renderInventory();
    }
});

document.getElementById("pull-10")          .addEventListener("click",  () => performSummon(10, "STANDARD"));
document.getElementById("pull-era-10")      .addEventListener("click",  () => performSummon(10, "ERA"));
document.getElementById("pull-franchise-10").addEventListener("click",  () => performSummon(10, "FRANCHISE"));
document.getElementById("pull-genre-10")    .addEventListener("click",  () => performSummon(10, "GENRE"));
document.getElementById("pull-source-10")   .addEventListener("click",  () => performSummon(10, "SOURCE"));
document.getElementById("pull-studio-10")   .addEventListener("click",  () => performSummon(10, "STUDIO"));
document.getElementById("pull-tag-10")      .addEventListener("click",  () => performSummon(10, "TAG"));
document.getElementById("pull-hof-10")      .addEventListener("click",  () => performSummon(10, "HOF"));
document.getElementById("pull-list-10")     ?.addEventListener("click", () => performSummon(10, "LIST"));

document.getElementById("spark-standard")       .addEventListener("click",  () => enterSparkMode("STANDARD"));
document.getElementById("spark-era")            .addEventListener("click",  () => enterSparkMode("ERA"));
document.getElementById("spark-franchise")      .addEventListener("click",  () => enterSparkMode("FRANCHISE"));
document.getElementById("spark-genre")          .addEventListener("click",  () => enterSparkMode("GENRE"));
document.getElementById("spark-source")         .addEventListener("click",  () => enterSparkMode("SOURCE"));
document.getElementById("spark-studio")         .addEventListener("click",  () => enterSparkMode("STUDIO"));
document.getElementById("spark-tag")            .addEventListener("click",  () => enterSparkMode("TAG"));
document.getElementById("spark-hof")            .addEventListener("click",  () => enterSparkMode("HOF"));
document.getElementById("spark-list")           ?.addEventListener("click", () => enterSparkMode("LIST"));
document.getElementById("sell-all-btn")         .addEventListener("click",  sellAllUnlocked);
document.getElementById("spark-mode-indicator") .addEventListener("click",  exitSparkMode);

document.getElementById("results-grid").addEventListener("click", (e) => {
    const lockBtn = e.target.closest(".lock-card-btn");
    if (lockBtn && !lockBtn.disabled) {
        const key = lockBtn.getAttribute("data-lock-key");
        if (key) toggleCardLock(key);
    }
});

document.getElementById("inventory-grid").addEventListener("click", (e) => {
    const lockBtn = e.target.closest(".lock-card-btn");
    if (lockBtn && !lockBtn.disabled) {
        const key = lockBtn.getAttribute("data-lock-key");
        if (key) toggleCardLock(key);
        return;
    }

    const sparkBtn = e.target.closest(".spark-card-btn");
    if (sparkBtn && !sparkBtn.disabled) {
        const key = sparkBtn.getAttribute("data-spark-key");
        if (key) sparkCharacter(key);
        return;
    }

    const sellBtn = e.target.closest(".sell-card-btn");
    if (sellBtn && !sellBtn.disabled) {
        const key = sellBtn.getAttribute("data-sell-key");
        if (key) sellCharacter(key);
    }
});

document.getElementById("clear-results")    .addEventListener("click",  () => {document.getElementById("results-section").classList.add("hidden")});

const searchInput    = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search");
let searchDebounceId = null;

searchInput.addEventListener("input", () => {
    clearSearchBtn.classList.toggle("hidden", searchInput.value === "");
    clearTimeout(searchDebounceId);
    searchDebounceId = setTimeout(resetPageAndRender, 250);
});

clearSearchBtn.addEventListener("click", () => {
    clearTimeout(searchDebounceId);
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    searchInput.focus();
    resetPageAndRender();
});

document.querySelectorAll(".first-page").forEach(btn => btn.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage = 1;
        renderInventory();
    }
}));

document.querySelectorAll(".prev-page").forEach(btn => btn.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage--;
        renderInventory();
    }
}));

document.querySelectorAll(".next-page").forEach(btn => btn.addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage++;
        renderInventory();
    }
}));

document.querySelectorAll(".last-page").forEach(btn => btn.addEventListener("click", () => {
    if (currentPage < totalPages) {
        currentPage = totalPages;
        renderInventory();
    }
}));

document.querySelectorAll(".page-input").forEach(input => input.addEventListener("change", (e) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val)) {
        currentPage = Math.min(Math.max(1, val), totalPages);
    }
    renderInventory();
}));

function hintBannerSwipe() {
    const carousel = document.getElementById("banner-carousel");
    if (!carousel || window.innerWidth >= 1024 || carousel.scrollLeft > 0) return;

    let cancelled = false;
    let rafId     = null;

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        carousel.classList.add("snap-x");
    };
    carousel.addEventListener("touchstart", cancel, { once: true, passive: true });

    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const animateScroll = (from, to, duration, onComplete) => {
        const start = performance.now();
        const step = (now) => {
            if (cancelled) return;
            const progress = Math.min((now - start) / duration, 1);
            carousel.scrollLeft = from + (to - from) * easeInOutCubic(progress);
            if (progress < 1) {
                rafId = requestAnimationFrame(step);
            } else if (onComplete) {
                onComplete();
            }
        };
        rafId = requestAnimationFrame(step);
    };

    setTimeout(() => {
        if (cancelled) return;
        carousel.classList.remove("snap-x");

        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        if (maxScroll <= 0) {
            carousel.classList.add("snap-x");
            return;
        }

        // Gently glide all the way to the last banner (1400ms)
        animateScroll(0, maxScroll, 1400, () => {
            // Brief pause at the end before gliding back (300ms)
            setTimeout(() => {
                if (cancelled) return;
                // Gently return to the Standard banner (1400ms)
                animateScroll(maxScroll, 0, 1400, () => {
                    carousel.classList.add("snap-x");
                });
            }, 300);
        });
    }, 350);
}

document.getElementById("login-btn").addEventListener("click", async () => {
    await sb.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
});

document.getElementById("logout-btn").addEventListener("click", async () => {
    if (currentUser) await sb.auth.signOut();
});

document.getElementById("daily-stars-btn").addEventListener("click", async () => {
    if (!currentUser) return;
    const todayJst = getCurrentJstDate();
    if (activeDailyJstDate && todayJst !== activeDailyJstDate) {
        await sendGachaAction({ action: "INIT" });
        return;
    }
    await sendGachaAction({ action: "CLAIM_DAILY_STARS" });
});

const anilistModal      = document.getElementById("anilist-modal");
const anilistModalForm  = document.getElementById("anilist-modal-form");
const anilistModalInput = document.getElementById("anilist-modal-input");
const anilistModalError = document.getElementById("anilist-modal-error");
const submitAnilistBtn  = document.getElementById("submit-anilist-btn");

function closeAnilistModal() {
    anilistModal?.classList.add("hidden");
    if (anilistModalError) anilistModalError.classList.add("hidden");
}

document.getElementById("anilist-header-btn")?.addEventListener("click", () => {
    if (!databaseReady || anilistUsername || !anilistModal) return;
    anilistModalInput.value = "";
    submitAnilistBtn.disabled = true;
    anilistModalError.classList.add("hidden");
    anilistModal.classList.remove("hidden");
    anilistModalInput.focus();
});

anilistModalInput?.addEventListener("input", () => {
    submitAnilistBtn.disabled = anilistModalInput.value.trim() === "";
    anilistModalError.classList.add("hidden");
});

anilistModal?.addEventListener("click", (e) => {
    if (e.target === anilistModal) closeAnilistModal();
});

anilistModalForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const trimmed = anilistModalInput.value.trim();
    if (!trimmed || submitAnilistBtn.disabled) return;

    submitAnilistBtn.disabled = true;
    submitAnilistBtn.textContent = "Linking...";
    anilistModalError.classList.add("hidden");

    const res = await sendGachaAction({ action: "LINK_ANILIST", anilistUsername: trimmed });

    submitAnilistBtn.textContent = "Link";
    submitAnilistBtn.disabled = anilistModalInput.value.trim() === "";

    if (res) {
        closeAnilistModal();
    } else {
        anilistModalError.textContent = "Could not find or fetch that AniList user.";
        anilistModalError.classList.remove("hidden");
    }
});
// --- Profile Photo Editor Modal ---
let draftPhoto = { uniqueKey: null, tier: null, x: 0, y: 0, zoom: 1.2, rotate: 0 };

function snapTargets(val, targets, threshold) {
    for (const target of targets) {
        if (Math.abs(val - target) <= threshold) return target;
    }
    return val;
}

function clampVal(val, min, max, fallback) {
    return Number.isFinite(val) ? Math.min(Math.max(val, min), max) : fallback;
}

function updatePhotoModalPreview() {
    const frame          = document.getElementById("photo-preview-frame");
    const img            = document.getElementById("photo-preview-img");
    const placeholder    = document.getElementById("photo-preview-placeholder");
    const saveBtn        = document.getElementById("save-photo-btn");
    const nameInput      = document.getElementById("profile-name-input");
    const changesEl      = document.getElementById("name-changes-left");
    const anilistIcon    = document.getElementById("profile-anilist-icon");
    const anilistInput   = document.getElementById("profile-anilist-input");
    const unlinkBtn      = document.getElementById("unlink-anilist-btn");
    const anilistChanges = document.getElementById("anilist-changes-left");

    const rawName     = nameInput.value.trim();
    const effective   = rawName || discordName;
    const currentName = displayName || discordName;
    const nameChanged = effective !== currentName;
    const isFreeName  = isFreeDiscordNameVariant(effective);
    const canCustom   = hasYearlyNameChangeAvailable();

    changesEl.textContent = canCustom ? "1" : "0";
    changesEl.className   = canCustom
        ? "text-emerald-600 dark:text-emerald-400 text-left font-bold tabular-nums"
        : "text-slate-400 text-left font-bold tabular-nums";

    const isLinked          = Boolean(anilistUsername);
    const rawAnilist        = anilistInput ? anilistInput.value.trim() : "";
    const anilistChanged    = isLinked && rawAnilist !== "" && rawAnilist !== anilistUsername;
    const isFreeAnilist     = isLinked && rawAnilist !== "" && (
        rawAnilist.toLowerCase() === anilistUsername.toLowerCase() ||
        isFreeAnilistHistoryVariant(rawAnilist)
    );
    const canAnilistChange  = hasYearlyAnilistChangeAvailable();
    const anilistAllowed    = !anilistChanged || isFreeAnilist || canAnilistChange;

    if (anilistIcon && anilistInput && unlinkBtn && anilistChanges) {
        anilistIcon.classList.toggle("hidden", !isLinked);
        anilistInput.classList.toggle("hidden", !isLinked);
        unlinkBtn.classList.toggle("hidden", !isLinked);
        anilistChanges.classList.toggle("hidden", !isLinked);
        anilistChanges.textContent = canAnilistChange ? "1" : "0";
        anilistChanges.className   = `${isLinked ? "" : "hidden "}${canAnilistChange
            ? "text-emerald-600 dark:text-emerald-400 text-left font-bold tabular-nums"
            : "text-slate-400 text-left font-bold tabular-nums"}`;
    }

    document.getElementById("photo-x").value            = draftPhoto.x;
    document.getElementById("photo-y").value            = draftPhoto.y;
    document.getElementById("photo-zoom").value         = draftPhoto.zoom;
    document.getElementById("photo-rotate").value       = draftPhoto.rotate;

    if (document.activeElement?.id !== "photo-x-input")      document.getElementById("photo-x-input").value      = draftPhoto.x;
    if (document.activeElement?.id !== "photo-y-input")      document.getElementById("photo-y-input").value      = draftPhoto.y;
    if (document.activeElement?.id !== "photo-zoom-input")   document.getElementById("photo-zoom-input").value   = draftPhoto.zoom;
    if (document.activeElement?.id !== "photo-rotate-input") document.getElementById("photo-rotate-input").value = draftPhoto.rotate;

    const char = draftPhoto.uniqueKey ? characterMap.get(draftPhoto.uniqueKey) : null;
    const tier = char ? char.rarity.tier : draftPhoto.tier;
    frame.className = `h-0 min-h-full aspect-square rounded-xl overflow-hidden ${getRarityBgClass(tier)} ${getRarityBorderClass(tier)} flex items-center justify-center`;

    if (char && char.imageUrl) {
        img.src = char.imageUrl;
        img.style.cssText = buildPhotoTransformStyle(draftPhoto);
        img.classList.remove("hidden");
        placeholder.classList.add("hidden");
    } else {
        img.classList.add("hidden");
        placeholder.classList.remove("hidden");
    }

    const hasValidPhoto    = Boolean(draftPhoto.uniqueKey && inventory[draftPhoto.uniqueKey] > 0);
    const photoChanged     = hasValidPhoto && (
        !profilePhoto ||
        profilePhoto.uniqueKey !== draftPhoto.uniqueKey ||
        profilePhoto.x !== draftPhoto.x ||
        profilePhoto.y !== draftPhoto.y ||
        profilePhoto.zoom !== draftPhoto.zoom ||
        profilePhoto.rotate !== draftPhoto.rotate
    );
    const nameAllowed      = !nameChanged || isFreeName || canCustom;
    const hasSomethingSave = (hasValidPhoto || !draftPhoto.uniqueKey) && (photoChanged || nameChanged || anilistChanged);

    saveBtn.disabled = !nameAllowed || !anilistAllowed || !hasSomethingSave;
}

function renderPhotoPickerGrid() {
    const grid  = document.getElementById("photo-char-grid");
    const query = document.getElementById("photo-char-search").value.trim().toLowerCase();

    const ownedChars = characterPool.filter(c => {
        if (!(inventory[c.uniqueKey] > 0) || !c.imageUrl) return false;
        if (!query) return true;
        return c.name.toLowerCase().includes(query) ||
               (c.animeRomaji && c.animeRomaji.toLowerCase().includes(query)) ||
               (c.animeEnglish && c.animeEnglish.toLowerCase().includes(query));
    });

    if (ownedChars.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-6 text-xs text-slate-500">No owned characters found</div>`;
        return;
    }

    grid.innerHTML = ownedChars.slice(0, 100).map(c => {
        const selected = draftPhoto.uniqueKey === c.uniqueKey ? "ring-2 ring-indigo-500" : "";
        return `
            <button type="button" data-pick-photo="${escapeHTML(c.uniqueKey)}" title="${escapeHTML(c.name)}"
                class="aspect-square rounded-lg overflow-hidden ${c.rarity.border} ${selected} bg-slate-200 dark:bg-slate-800 hover:scale-105 transition">
                <img src="${c.imageUrl}" alt="${escapeHTML(c.name)}" loading="lazy" class="w-full h-full object-cover object-top"/>
            </button>
        `;
    }).join("");
}

document.getElementById("profile-btn").addEventListener("click", () => {
    if (!currentUser || !databaseReady) return;
    draftPhoto = profilePhoto
        ? { ...profilePhoto }
        : { uniqueKey: null, tier: null, x: 0, y: 0, zoom: 1.2, rotate: 0 };
    const nameInput = document.getElementById("profile-name-input");
    nameInput.value       = displayName || discordName;
    nameInput.placeholder = discordName;

    const anilistInput = document.getElementById("profile-anilist-input");
    if (anilistInput) {
        anilistInput.value = anilistUsername || "";
    }

    document.getElementById("photo-char-search").value = "";
    updatePhotoModalPreview();
    renderPhotoPickerGrid();
    document.getElementById("photo-modal").classList.remove("hidden");
});

document.getElementById("profile-name-input").addEventListener("input", updatePhotoModalPreview);
document.getElementById("profile-anilist-input")?.addEventListener("input", updatePhotoModalPreview);

document.getElementById("unlink-anilist-btn")?.addEventListener("click", async () => {
    if (!currentUser || !anilistUsername) return;
    const res = await sendGachaAction({ action: "UNLINK_ANILIST" });
    if (res) {
        updatePhotoModalPreview();
    }
});

document.getElementById("photo-modal").addEventListener("click", (e) => {
    if (e.target.id === "photo-modal") {
        document.getElementById("photo-modal").classList.add("hidden");
    }
});

document.getElementById("photo-char-search").addEventListener("input", renderPhotoPickerGrid);

document.getElementById("photo-char-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick-photo]");
    if (!btn) return;
    const key  = btn.getAttribute("data-pick-photo");
    const char = characterMap.get(key);
    if (!char) return;
    draftPhoto.uniqueKey = key;
    draftPhoto.tier      = char.rarity.tier;
    updatePhotoModalPreview();
    renderPhotoPickerGrid();
});

// Slider listeners with magnetic snap at 0 (for X/Y) and -90, 0, +90 (for Rotate)
document.getElementById("photo-x").addEventListener("input", (e) => {
    draftPhoto.x = snapTargets(Number(e.target.value), [0], 6);
    updatePhotoModalPreview();
});
document.getElementById("photo-y").addEventListener("input", (e) => {
    draftPhoto.y = snapTargets(Number(e.target.value), [0], 6);
    updatePhotoModalPreview();
});
document.getElementById("photo-zoom").addEventListener("input", (e) => {
    draftPhoto.zoom = Number(e.target.value);
    updatePhotoModalPreview();
});
document.getElementById("photo-rotate").addEventListener("input", (e) => {
    draftPhoto.rotate = snapTargets(Number(e.target.value), [-90, 0, 90], 8);
    updatePhotoModalPreview();
});

// Direct numeric input listeners (exact values allowed, clamped on blur/change)
document.getElementById("photo-x-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;
    draftPhoto.x = clampVal(Number(raw), -100, 100, 0);
    updatePhotoModalPreview();
});
document.getElementById("photo-x-input").addEventListener("change", (e) => {
    draftPhoto.x = clampVal(Number(e.target.value), -100, 100, 0);
    e.target.value = draftPhoto.x;
    updatePhotoModalPreview();
});

document.getElementById("photo-y-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;
    draftPhoto.y = clampVal(Number(raw), -100, 100, 0);
    updatePhotoModalPreview();
});
document.getElementById("photo-y-input").addEventListener("change", (e) => {
    draftPhoto.y = clampVal(Number(e.target.value), -100, 100, 0);
    e.target.value = draftPhoto.y;
    updatePhotoModalPreview();
});

document.getElementById("photo-zoom-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "") return;
    draftPhoto.zoom = clampVal(Number(raw), 1, 3, 1.2);
    updatePhotoModalPreview();
});
document.getElementById("photo-zoom-input").addEventListener("change", (e) => {
    draftPhoto.zoom = clampVal(Number(e.target.value), 1, 3, 1.2);
    e.target.value = draftPhoto.zoom;
    updatePhotoModalPreview();
});

document.getElementById("photo-rotate-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;
    draftPhoto.rotate = clampVal(Number(raw), -180, 180, 0);
    updatePhotoModalPreview();
});
document.getElementById("photo-rotate-input").addEventListener("change", (e) => {
    draftPhoto.rotate = clampVal(Number(e.target.value), -180, 180, 0);
    e.target.value = draftPhoto.rotate;
    updatePhotoModalPreview();
});

document.getElementById("reset-photo-transform").addEventListener("click", () => {
    draftPhoto.x      = 0;
    draftPhoto.y      = 0;
    draftPhoto.zoom   = 1.2;
    draftPhoto.rotate = 0;
    updatePhotoModalPreview();
});

document.getElementById("save-photo-btn").addEventListener("click", async () => {
    const rawName     = document.getElementById("profile-name-input").value.trim();
    const effective   = rawName || discordName;
    const currentName = displayName || discordName;
    const nameChanged = effective !== currentName;

    if (nameChanged && !isFreeDiscordNameVariant(effective) && !hasYearlyNameChangeAvailable()) {
        alert("You have already used your custom name change this year (resets Jan 1 JST).");
        return;
    }

    const rawAnilist     = document.getElementById("profile-anilist-input")?.value.trim() || "";
    const anilistChanged = Boolean(anilistUsername && rawAnilist && rawAnilist !== anilistUsername);
    const isFreeAnilist  = Boolean(anilistUsername && rawAnilist && (
        rawAnilist.toLowerCase() === anilistUsername.toLowerCase() ||
        isFreeAnilistHistoryVariant(rawAnilist)
    ));

    if (anilistChanged && !isFreeAnilist && !hasYearlyAnilistChangeAvailable()) {
        alert("You have already used your AniList account change this year (resets Jan 1 JST).");
        return;
    }

    const payload = {
        action: "SET_PROFILE",
        displayName: effective,
        discordName
    };

    if (anilistChanged) {
        payload.anilistUsername = rawAnilist;
    }

    if (draftPhoto.uniqueKey && inventory[draftPhoto.uniqueKey] > 0) {
        payload.photo = {
            uniqueKey: draftPhoto.uniqueKey,
            x: draftPhoto.x,
            y: draftPhoto.y,
            zoom: draftPhoto.zoom,
            rotate: draftPhoto.rotate
        };
    }

    const res = await sendGachaAction(payload);
    if (res) {
        document.getElementById("photo-modal").classList.add("hidden");
    }
});

async function loadSharedCollection(targetUserId) {
    const { data, error } = await sb.functions.invoke("AniGacha-Japan", {
        body: { action: "GET_SHARED_PROFILE", userId: targetUserId }
    });

    if (error || !data?.profile) {
        alert("Could not load shared collection. The link may be invalid.");
        window.location.href = window.location.origin + window.location.pathname;
        return;
    }

    const profile = data.profile;
    inventory       = profile.inventory || {};
    lockedCards     = new Set(profile.lockedCards || []);
    anilistUsername = profile.anilistUsername || null;
    anilistAnimeIds = new Set((profile.anilistAnimeIds || []).map(v => normalizeId(v)).filter(Boolean));
    rebuildAnilistEligibleKeys();

    // Hide rates table, summon cards, and sell-all button (leave top header intact)
    const topSection = document.getElementById("gacha-top-section");
    topSection.classList.add("hidden");
    topSection.classList.remove("flex", "lg:grid");
    document.getElementById("sell-all-btn").classList.add("hidden");

    // Populate Shared Profile Banner
    const sharedBanner = document.getElementById("shared-view-banner");
    sharedBanner.classList.remove("hidden");
    document.getElementById("shared-username").textContent = profile.displayName || "Player";

    const anilistLink = document.getElementById("shared-anilist-link");
    if (anilistUsername) {
        anilistLink.textContent = `AniList: ${anilistUsername}`;
        anilistLink.href = `https://anilist.co/user/${encodeURIComponent(anilistUsername)}`;
        anilistLink.classList.remove("hidden");
    }

    const frame       = document.getElementById("shared-photo-frame");
    const img         = document.getElementById("shared-photo-img");
    const placeholder = document.getElementById("shared-photo-placeholder");
    const photo       = profile.profilePhoto;
    frame.className   = `w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl overflow-hidden ${getRarityBgClass(photo?.tier)} ${getRarityBorderClass(photo?.tier)} flex items-center justify-center shrink-0`;

    const char = photo?.uniqueKey ? characterMap.get(photo.uniqueKey) : null;
    if (char && char.imageUrl) {
        img.src = char.imageUrl;
        img.style.cssText = buildPhotoTransformStyle(photo);
        img.classList.remove("hidden");
        placeholder.classList.add("hidden");
    }

    document.getElementById("unlocked-count").textContent = Object.keys(inventory).length.toLocaleString();
    renderInventory();
}

document.getElementById("exit-shared-btn")?.addEventListener("click", () => {
    window.location.href = window.location.origin + window.location.pathname;
});

const shareModal = document.getElementById("share-modal");

document.getElementById("share-collection-btn")?.addEventListener("click", async () => {
    if (!currentUser || !shareModal) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(currentUser.id)}`;
    try {
        await navigator.clipboard.writeText(shareUrl);
        shareModal.classList.remove("hidden");
    } catch {
        prompt("Copy your collection share link:", shareUrl);
    }
});

shareModal?.addEventListener("click", (e) => {
    if (e.target === shareModal) shareModal.classList.add("hidden");
});

async function loadCloudSave(user) {
    currentUser = user;
    discordName = user.user_metadata?.full_name || user.user_metadata?.name || "Account";
    document.getElementById("header-username").textContent = displayName || discordName;
    document.getElementById("header-logged-out").classList.add("hidden");
    document.getElementById("header-logged-in").classList.remove("hidden");
    document.getElementById("share-collection-btn").classList.remove("hidden");
    document.getElementById("logout-btn").classList.remove("hidden");

    await sendGachaAction({ action: "INIT", discordName });
}
sb.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
        if (databaseReady) {
            loadCloudSave(session.user);
        } else {
            currentUser = session.user;
        }
    } else {
        currentUser = null;
        activeDailyJstDate = null;
        document.getElementById("header-logged-in").classList.add("hidden");
        document.getElementById("header-logged-out").classList.remove("hidden");
        document.getElementById("share-collection-btn").classList.add("hidden");
        document.getElementById("logout-btn").classList.add("hidden");
        document.getElementById("photo-modal").classList.add("hidden");

        if (isSharedView) {
            viewerAnilistUsername = null;
            displayName = null;
            profilePhoto = null;
            updateHeaderProfileUI();
            updateStarsUI();
            return;
        }

        document.getElementById("results-section").classList.add("hidden");
        if (activeSparkBanner) exitSparkMode();

        applySaveState({
            stars: 0,
            inventory: {},
            lockedCards: [],
            sparkPoints: { STANDARD: 0, ERA: 0, FRANCHISE: 0, GENRE: 0, SOURCE: 0, STUDIO: 0, TAG: 0, HOF: 0, LIST: 0 },
            totalPulls: 0,
            hofPulls: 0,
            listPulls: 0,
            themedPulls: { ERA: 0, FRANCHISE: 0, GENRE: 0, SOURCE: 0, STUDIO: 0, TAG: 0 },
            lastDailyStarsDate: null,
            lastFreeSummonDate: null,
            profilePhoto: null,
            displayName: null,
            lastNameChangeJstYear: null,
            anilistUsername: null,
            anilistAnimeIds: [],
            linkedAnilistHistory: [],
            lastAnilistChangeJstYear: null
        });

        if (databaseReady) {
            applyDailyBanners(getClientDailyBanners());
        }
    }
});

initDatabase();