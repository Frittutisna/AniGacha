import {serve}          from "std/http/server.ts";
import {createClient}   from "@supabase/supabase-js";

const corsHeaders = {
    "Access-Control-Allow-Origin"   :  "*",
    "Access-Control-Allow-Headers"  : "authorization, x-client-info, apikey, content-type",
};

const RARITIES = [
    {tier: "SSR",   spawn: 0.00125, sparkCost: 5000,    sellValue: 256},
    {tier: "SR",    spawn: 0.00250, sparkCost: 2500,    sellValue: 128},
    {tier: "S",     spawn: 0.00500, sparkCost: 1000,    sellValue: 64},
    {tier: "A",     spawn: 0.02000, sparkCost: 500,     sellValue: 32},
    {tier: "B",     spawn: 0.04000, sparkCost: 250,     sellValue: 16},
    {tier: "C",     spawn: 0.08000, sparkCost: 100,     sellValue: 8},
    {tier: "D",     spawn: 0.16000, sparkCost: 50,      sellValue: 4},
    {tier: "E",     spawn: 0.32000, sparkCost: 25,      sellValue: 2},
    {tier: "F",     spawn: 0.37125, sparkCost: 10,      sellValue: 1},
];

const HOF_RARITIES = RARITIES.map(r => {
    let spawn = r.spawn;

    if (r.tier === "SSR" || r.tier === "SR" || r.tier === "S")  spawn *= 2;
    if (r.tier === "F")                                         spawn -= 0.00875;

    return {...r, spawn};
});

const COSTS = {
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

const GUARANTEED_B_PLUS = new Set(["SSR", "SR", "S", "A", "B"]);
const GUARANTEED_A_PLUS = new Set(["SSR", "SR", "S", "A"]);
const AUTO_LOCK_TIERS   = new Set(["SSR", "SR", "S"]);
const FIFTY_FIFTY_TIERS = new Set(["SSR", "SR", "S"]);
const THEMED_KEYS       = ["ERA", "FRANCHISE", "GENRE", "SOURCE", "STUDIO", "TAG"];
const rarityInfoMap     = new Map(RARITIES.map(r => [r.tier, r]));
const SERVER_DATA_URL   = "https://frittutisna.github.io/AniGacha/supabase/functions/AniGacha-Japan/server-data.json";

let cachedData      = null;
let dataLoadPromise = null;

function getGameData() {
    if (cachedData)         return cachedData;
    if (dataLoadPromise)    return dataLoadPromise;

    dataLoadPromise = (async () => {
        try {
            const response = await fetch(SERVER_DATA_URL);
            if (!response.ok) throw new Error(`Failed to load server-data.json from GitHub Pages: (HTTP ${response.status})`)

            const parsed            = await response.json();
            const animesMap         = parsed.animes || {};
            const charList          = parsed.chars;
            const charMap           = new Map();
            const animeToCharKeys   = new Map();
            const globalBuckets     = {};

            RARITIES.forEach(r => globalBuckets[r.tier] = []);

            for (let charIdx = 0; charIdx < charList.length; charIdx++) {
                const [uniqueKey, tier, animeId = null, deckRank = "2", deckSuit = "Spades", name = ""] = charList[charIdx];

                const normAnimeId   = animeId       ? String(animeId).trim()                    :   null;
                const animeMeta     = normAnimeId   ? animesMap[normAnimeId]                    :   null;
                const rawDateInt    = animeMeta?.[1]                                            ??  null;
                const animeYear     = rawDateInt    ? Math.floor(Number(rawDateInt) / 10000)    :   null;

                charMap.set(uniqueKey, {
                    charIdx, uniqueKey, tier, name,
                    animeId     : normAnimeId,
                    rootAnimeId : animeMeta?.[0] || normAnimeId,
                    animeYear,
                    romaji      : animeMeta?.[6] || null,
                    english     : animeMeta?.[7] || null,
                    genres      : Array.isArray(animeMeta?.[2]) ? animeMeta[2] : [],
                    tags        : Array.isArray(animeMeta?.[3]) ? animeMeta[3] : [],
                    studios     : Array.isArray(animeMeta?.[4]) ? animeMeta[4] : [],
                    source      : animeMeta?.[5] || null,
                    deckRank, deckSuit
                });

                globalBuckets[tier].push(uniqueKey);

                if (normAnimeId) {
                    let arr = animeToCharKeys.get(normAnimeId);

                    if (!arr) {
                        arr = [];
                        animeToCharKeys.set(normAnimeId, arr);
                    }

                    arr.push(uniqueKey);
                }
            }

            const sortedAnimeIds = Array.from(animeToCharKeys.keys()).sort((a, b) => {
                const countA = Number(animesMap[a]?.[8]) || 0;
                const countB = Number(animesMap[b]?.[8]) || 0;

                return (countB - countA) || a.localeCompare(b);
            });

            const animeRankMap = new Map(sortedAnimeIds.map((id, idx) => [id, idx]));
            RARITIES.forEach(r => {if (globalBuckets[r.tier].length === 0) globalBuckets[r.tier].push(charList[0][0])});

            cachedData = {charList, charMap, animeToCharKeys, animeRankMap, globalBuckets, themedOptions: parsed.themedOptions};
            return cachedData;

        } catch (error) {
            dataLoadPromise = null;
            throw error;
        }
    })();

    return dataLoadPromise;
}

let cachedQuizSongs         = null;
let quizSongsLoadPromise    = null;

function getQuizSongsMeta() {
    if (cachedQuizSongs)        return cachedQuizSongs;
    if (quizSongsLoadPromise)   return quizSongsLoadPromise;

    quizSongsLoadPromise = (async () => {
        const treeRes = await fetch("https://api.github.com/repos/Frittutisna/Stats-Archive/git/trees/main?recursive=1");

        if (!treeRes.ok) {
            quizSongsLoadPromise = null;
            throw new Error("Failed to load song database");
        }

        const tree          = await treeRes.json();
        const paths         = (tree.tree || []).map(x => x.path);
        const timestampDirs = [...new Set(paths.map(p => p.match(/^(\d{10,})\/jsons\/search\.json$/)?.[1]).filter(Boolean))].sort();
        const base          = "https://raw.githubusercontent.com/Frittutisna/Stats-Archive/main/";
        const seen          = new Set();
        const songs         = [];

        for (let i = 0; i < timestampDirs.length; i += 5) {
            const batch = await Promise.all(
                timestampDirs.slice(i, i + 5).map(async ts => {
                    const r = await fetch(`${base}${ts}/jsons/search.json`);
                    if (!r.ok) return [];

                    const data = await r.json();
                    return Array.isArray(data) ? data : [];
                })
            );

            for (const list of batch) {
                for (const s of list) {
                    if (!s?.video_url || (!s.romaji && !s.english)) continue;

                    const key = String(s.video_url).trim();
                    if (key.toLowerCase().split("?")[0].endsWith(".webm") || seen.has(key)) continue;
                    seen.add(key);


                    const type = String(s.type || "").toLowerCase();

                    const category = type.includes("opening") ? "op" : type.includes("ending") ? "ed" : type.includes("insert") ? "in" : null;
                    if (!category) continue;

                    const chanting  = ["yes", "true", "1"].includes(String(s.chanting ?? "no").toLowerCase());
                    const yearMatch = String(s.vintage || "").match(/\b(19\d{2}|20\d{2})\b/);
                    const year      = yearMatch ? Number(yearMatch[1]) : null;
                    const diff      = parseFloat(s.difficulty);

                    songs.push({
                        video_url       : key,
                        romaji          : s.romaji                  || "",
                        english         : s.english                 || "",
                        alts            : Array.isArray(s.alts) ? s.alts    : [],
                        category, chanting, year,
                        difficulty      : Number.isFinite(diff) ? diff      : null,
                        start_sample    : Number(s.start_sample)    || 0,
                        type            : s.type                    || "",
                        song            : s.song                    || "",
                        artist_raw      : s.artist_raw              || ""
                    });
                }
            }
        }

        cachedQuizSongs = songs;
        return songs;
    })();

    return quizSongsLoadPromise;
}

function normalizeQuizAnswer(value) {return String(value || "")
    .normalize      ("NFKD")
    .toLowerCase    ()
    .replace        (/[\u0300-\u036f]/g, "")
    .replace        (/&/g, "and")
    .replace        (/[^a-z0-9]/g, "");
}

function validateQuizSettings(settings) {
    if (!settings || typeof settings !== "object") throw new Error("Invalid quiz settings");
    const categories = Array.isArray(settings.categories) ? [...new Set(settings.categories)] : [];

    if (!categories.length || categories.some(c => !["op", "ed", "in"].includes(c)))    throw new Error("Invalid quiz categories");
    if (!["entry", "mc"].includes(settings.mode))                                       throw new Error("Invalid quiz mode");

    const count = Number(settings.count);
    if (![20, 40, 60, 80, 100].includes(count)) throw new Error("Invalid quiz length");

    const sound = Number(settings.sound);
    const extra = Number(settings.extra);

    if (!((sound === 20 && extra === 0) || (sound === 15 && extra === 0) || (sound === 5 && extra === 0) || (sound === 2 && extra === 8))) throw new Error("Invalid quiz time settings");

    const vintageMin    = settings.vintageMin   == null ? null : Number(settings.vintageMin);
    const vintageMax    = settings.vintageMax   == null ? null : Number(settings.vintageMax);
    const diffMin       = settings.diffMin      == null ? null : Number(settings.diffMin);
    const diffMax       = settings.diffMax      == null ? null : Number(settings.diffMax);
    const vintagePoints = [1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];
    const diffPoints    = [20, 25, 30, 35];

    if (
        (vintageMin !== null && !vintagePoints.includes(vintageMin)) ||
        (vintageMax !== null && !vintagePoints.includes(vintageMax)) ||
        (vintageMin !== null && vintageMax !== null && vintageMin >= vintageMax)
    ) throw new Error("Invalid vintage range");

    if (
        (diffMin !== null && !diffPoints.includes(diffMin)) ||
        (diffMax !== null && !diffPoints.includes(diffMax)) ||
        (diffMin !== null && diffMax !== null && diffMin >= diffMax)
    ) throw new Error("Invalid difficulty range");

    return {
        categories,
        chanting    : settings.chanting === true,
        mode        : settings.mode,
        count, sound, extra, vintageMin, vintageMax, diffMin, diffMax
    };
}

function getFilteredServerQuizSongs(settings, songs) {return songs.filter(song => {
    if (!settings.categories.includes(song.category))                           return false;
    if (!settings.chanting && song.chanting)                                    return false;

    if (settings.vintageMin !== null || settings.vintageMax !== null) {
        if (song.year === null)                                                 return false;
        if (settings.vintageMin !== null && song.year < settings.vintageMin)    return false;
        if (settings.vintageMax !== null && song.year >= settings.vintageMax)   return false;
    }

    if (settings.diffMin !== null || settings.diffMax !== null) {
        if (song.difficulty === null)                                           return false;
        if (settings.diffMin !== null && song.difficulty < settings.diffMin)    return false;
        if (settings.diffMax !== null && song.difficulty >= settings.diffMax)   return false;
    }

    return true;
})}

async function fetchAnilistUserAnimeIds(username) {
    const query = `
        query ($userName: String) {
            MediaListCollection(userName: $userName, type: ANIME, status_in: [CURRENT, COMPLETED]) {
                user { name }
                lists {
                    entries {
                        mediaId
                    }
                }
            }
        }
    `;

    const res = await fetch("https://graphql.anilist.co", {
        method  : "POST",
        headers : {"Content-Type": "application/json", "Accept": "application/json"},
        body    : JSON.stringify({query, variables: {userName: username}}),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.errors || !json?.data?.MediaListCollection) throw new Error(json?.errors?.[0]?.message || "Could not fetch AniList user list");

    const collection    = json.data.MediaListCollection;
    const canonicalName = collection.user?.name || username;
    const ids           = new Set();

    for (const list of collection.lists || []) {for (const entry of list.entries || []) if (entry?.mediaId) ids.add(String(entry.mediaId))}
    return {canonicalName, animeIds: Array.from(ids)};
}

function getKeysForAnimeIds(animeIds, gameData) {
    const keys = [];

    for (const id of animeIds) {
        const matched = gameData.animeToCharKeys.get(String(id));
        if (matched) keys.push(...matched);
    }

    return keys;
}

function getJSTDateString() {return new Intl.DateTimeFormat("en-CA", {
    timeZone    : "Asia/Tokyo",
    year        : "numeric",
    month       : "2-digit",
    day         : "2-digit",
}).format(new Date())}

function hashSeed(str) {
    let h = 1779033703 ^ str.length;

    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }

    return (h >>> 0);
}

function mulberry32(seed) {return function () {
    let t = (seed += 0x6D2B79F5);

    t =     Math.imul(t ^ (t >>> 15), t | 1);
    t ^=    t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}}

function getDailyThemedBanners(gameData) {
    const jstDate       = getJSTDateString();
    const rng           = mulberry32(hashSeed(`anigacha-daily-${jstDate}`));
    const shuffledCats  = [...THEMED_KEYS];

    for (let i = shuffledCats.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffledCats[i], shuffledCats[j]] = [shuffledCats[j], shuffledCats[i]];
    }

    const activeCategories  = shuffledCats.slice(0, 2);
    const activeEntries     = {};

    for (const cat of activeCategories) {
        const options   = gameData.themedOptions[cat];
        const chosen    = options[Math.floor(rng() * options.length)];

        activeEntries[cat] = {
            title   : chosen.title,
            keys    : chosen.idxs.map(idx => gameData.charList[idx][0]),
        };
    }

    return {jstDate, activeCategories, activeEntries};
}

function buildTierMapFromKeys(keys, gameData) {
    const tierMap = {};
    RARITIES.forEach(r => tierMap[r.tier] = []);

    for (const k of keys) {
        const c = gameData.charMap.get(k);
        if (c) tierMap[c.tier].push(k);
    }

    RARITIES.forEach((r, idx) => {
        if (tierMap[r.tier].length > 0) return;

        for (let d = idx + 1; d < RARITIES.length; d++) {if (tierMap[RARITIES[d].tier].length > 0) {
            tierMap[r.tier] = tierMap[RARITIES[d].tier];
            return;
        }}

        tierMap[r.tier] = gameData.globalBuckets[r.tier];
    });

    return tierMap;
}

function selectRarityTier(guaranteeTier, customRarities = RARITIES) {
    const allowed = guaranteeTier === "A" ? GUARANTEED_A_PLUS : (guaranteeTier === "B" ? GUARANTEED_B_PLUS : null);

    if (allowed) {
        const eligible      = customRarities.filter(r => allowed.has(r.tier));
        const totalWeight   = eligible.reduce((sum, r) => sum + r.spawn, 0);
        const rand          = Math.random() * totalWeight;
        let cumulative      = 0;

        for (const r of eligible) {
            cumulative += r.spawn;
            if (rand < cumulative) return r.tier;
        }

        return guaranteeTier;
    }

    const rand      = Math.random();
    let cumulative  = 0;
    let selected    = customRarities[customRarities.length - 1].tier;

    for (const r of customRarities) {
        cumulative += r.spawn;

        if (rand < cumulative) {
            selected = r.tier;
            break;
        }
    }

    return selected;
}

function getSellMultiplier(count) {
    if (count >=    6) return 4;
    if (count >=    3) return 3;
    if (count ===   2) return 2;
    return 1;
}

async function persistPlayerSave(adminClient, userId, saveVersion, save) {
    const {data, error} = await adminClient.rpc("save_player_save_cas", {
        p_user_id           : userId,
        p_expected_version  : saveVersion,
        p_save_data         : save
    });

    if (error) {
        console.error("Save persistence failed:", error);
        throw new Error("Failed to save player data");
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result?.success) {
        return new Response(
            JSON.stringify({
                error   : "Save conflict. Please retry your action.",
                code    : "SAVE_CONFLICT"
            }), {
                status  : 409,
                headers : {...corsHeaders, "Content-Type": "application/json"}
            }
        );
    }

    return null;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", {headers: corsHeaders});

    try {
        const body      = await req.json().catch(() => ({ action: "INIT" }));
        const action    = body.action || "INIT";

        if (action === "GET_SHARED_PROFILE") {
            const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";

            if (!targetUserId) return new Response(JSON.stringify({error: "Missing userId"}), {
                status  : 400,
                headers : {...corsHeaders, "Content-Type": "application/json"}
            });

            const adminClient = createClient(
                Deno.env.get("SUPABASE_URL"),
                Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
            );

            const {data: row, error} = await adminClient.from("player_saves").select("save_data").eq("user_id", targetUserId).maybeSingle();

            if (error || !row?.save_data) return new Response(JSON.stringify({error: "Shared collection not found"}), {
                status  : 404,
                headers : {...corsHeaders, "Content-Type": "application/json"},
            });

            const s = row.save_data;

            return new Response(JSON.stringify({profile: {
                    displayName     : s.displayName || "Player",
                    profilePhoto    : s.profilePhoto || null,
                    anilistUsername : s.anilistUsername || null,
                    anilistAnimeIds : Array.isArray(s.anilistAnimeIds) ? s.anilistAnimeIds : [],
                    inventory       : s.inventory || {},
                    lockedCards     : Array.isArray(s.lockedCards) ? s.lockedCards : [],
                    deck            : s.deck && typeof s.deck === "object" && !Array.isArray(s.deck) ? s.deck : {},
            }}), {headers: {...corsHeaders, "Content-Type": "application/json"}});
        }

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401, headers: corsHeaders});

        const authClient = createClient(
            Deno.env.get("SUPABASE_URL"),
            Deno.env.get("SUPABASE_ANON_KEY"),
            {global: {headers: {Authorization: authHeader}}}
        );

        const token                                 = authHeader.replace(/^Bearer\s+/i, "");
        const {data: claimsData, error: claimsErr}  = await authClient.auth.getClaims(token);
        const userId                                = claimsData?.claims?.sub;

        if (claimsErr || !userId) return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401, headers: corsHeaders});

        const adminClient = createClient(
            Deno.env.get("SUPABASE_URL"),
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
        );

        const RATE_LIMITS = {
            INIT                    : 10,
            SUMMON                  : 100,
            SPARK                   : 100,
            SELL                    : 100,
            SELL_ALL                : 10,
            SET_PROFILE             : 10,
            SAVE_DECK               : 10,
            LINK_ANILIST            : 10,
            UNLINK_ANILIST          : 10,
            SET_FIFTY_FIFTY         : 100,
            TOGGLE_LOCK             : 100,
            CLAIM_DAILY_STARS       : 10,
            QUIZ_START              : 10,
            QUIZ_COMPLETE           : 10,
            QUIZ_MISSION_PROGRESS   : 100,
            QUIZ_CLAIM_MISSION      : 100,
            CASINO_BLACKJACK        : 100,
            CASINO_SYNERGY          : 100,
            CASINO_ROULETTE         : 100,
            CASINO_FX               : 100,
            TABI_START              : 10,
            TABI_ANSWER             : 100
        };

        const actionLimit = RATE_LIMITS[action] ?? 10;

        const {data: rateAllowed, error: rateError} = await adminClient.rpc("check_api_rate_limit", {
            p_user_id       : userId,
            p_action        : action,
            p_max_requests  : actionLimit
        });

        if (rateError) {
            console.error("Rate limiter database error:", rateError);

            return new Response(JSON.stringify({error: "Request validation temporarily unavailable"}), {
                status  : 503,
                headers : {...corsHeaders, "Content-Type": "application/json"}
            });
        }

        if (rateAllowed !== true) {return new Response(JSON.stringify({
            error   : "Too many requests. Please wait before trying again.",
            code    : "RATE_LIMITED"
        }), {
            status  : 429,
            headers : {
                ...corsHeaders,
                "Content-Type"  : "application/json",
                "Retry-After"   : "60"
            }
        })}

        const [gameData, { data: existing, error: loadError }] = await Promise.all([
            getGameData(),

            adminClient
                .from("player_saves")
                .select("save_data, save_version")
                .eq("user_id", userId)
                .maybeSingle()
        ]);

        if (loadError) throw new Error("Failed to load player save");
        const saveVersion = existing?.save_version ?? null;

        const save = existing?.save_data ?? {
            stars                       : 1200,
            inventory                   : {},
            lockedCards                 : [],
            sparkPoints                 : {STANDARD: 0, THEMED: 0, HOF: 0, LIST: 0},
            fiftyFifty                  : {STANDARD: null, HOF: null, LIST: null, THEMED: {}},
            totalPulls                  : 0,
            hofPulls                    : 0,
            listPulls                   : 0,
            themedPulls                 : {ERA: 0, FRANCHISE: 0, GENRE: 0, SOURCE: 0, STUDIO: 0, TAG: 0},
            lastDailyStarsDate          : null,
            lastFreeSummonDate          : null,
            profilePhoto                : null,
            displayName                 : null,
            lastNameChangeJstYear       : null,
            anilistUsername             : null,
            anilistAnimeIds             : [],
            linkedAnilistHistory        : [],
            lastAnilistChangeJstYear    : null,
            deck                        : {},
        };

        if (!save.deck || typeof save.deck !== "object" || Array.isArray(save.deck))    save.deck                   = {};
        if (!save.sparkPoints)                                                          save.sparkPoints            = {};
        if (typeof save.sparkPoints.THEMED  !== "number")                               save.sparkPoints.THEMED     = 0;

        for (const k of THEMED_KEYS) {
            if (typeof save.sparkPoints[k] === "number") {
                save.sparkPoints.THEMED += save.sparkPoints[k];
                delete save.sparkPoints[k];
            }
        }

        if (typeof save.sparkPoints.LIST    !== "number")                               save.sparkPoints.LIST       = 0;
        if (typeof save.listPulls           !== "number")                               save.listPulls              = 0;
        if (!Array.isArray(save.anilistAnimeIds))                                       save.anilistAnimeIds        = [];
        if (!Array.isArray(save.linkedAnilistHistory))                                  save.linkedAnilistHistory   = [];
        if (!save.fiftyFifty || typeof save.fiftyFifty !== "object")                    save.fiftyFifty             = {STANDARD: null, HOF: null, LIST: null, THEMED: {}};

        const dailyBanners = getDailyThemedBanners(gameData);

        if (!save.fiftyFifty.THEMED || typeof save.fiftyFifty.THEMED !== "object" || Array.isArray(save.fiftyFifty.THEMED)) save.fiftyFifty.THEMED = {};
        for (const [category, selection] of Object.entries(save.fiftyFifty.THEMED)) if (!THEMED_KEYS.includes(category) || !selection || selection.date !== dailyBanners.jstDate) delete save.fiftyFifty.THEMED[category];

        const bannerPayload = {
            jstDate             : dailyBanners.jstDate,
            activeCategories    : dailyBanners.activeCategories,
            activeTitles        : Object.fromEntries(Object.entries(dailyBanners.activeEntries).map(([cat, entry]) => [cat, entry.title]))
        };

        const emptyQuizDaily = () => ({
            date                : dailyBanners.jstDate,
            quizEarned          : 0,
            missionEarned       : 0,
            claimedMissions     : [],
            completedQuizIds    : [],
            progress            : {
                songsPlayed         : 0,
                correct             : 0,
                bestStreak          : 0,
                chantingCorrect     : 0,
                bestRoundPct        : 0,
                allCategoriesQuiz   : false,
                entryQuiz           : false,
                shortTimeQuiz       : false,
                allOptionsQuiz      : false
            }
        });

        const DAILY_CASINO_BET_LIMIT = 1000;

        const emptyCasinoDailyBet = () => ({
            date        : dailyBanners.jstDate,
            BLACKJACK   : 0,
            ROULETTE    : 0,
            FX          : 0,
            SYNERGY     : 0
        });

        if (!save.casinoDailyBet || save.casinoDailyBet.date !== dailyBanners.jstDate)  save.casinoDailyBet     = emptyCasinoDailyBet();
        else for (const g of ["BLACKJACK", "ROULETTE", "FX", "SYNERGY"])                save.casinoDailyBet[g]  = Math.max(0, Math.floor(Number(save.casinoDailyBet[g]) || 0));

        if (!save.quizDaily || save.quizDaily.date !== dailyBanners.jstDate) save.quizDaily = emptyQuizDaily();
        else {
            save.quizDaily.quizEarned       = Math.max(0, Math.min(120, Number(save.quizDaily.quizEarned)       || 0));
            save.quizDaily.missionEarned    = Math.max(0, Math.min(120, Number(save.quizDaily.missionEarned)    || 0));

            if (!Array.isArray(save.quizDaily.claimedMissions))     save.quizDaily.claimedMissions  = [];
            if (!Array.isArray(save.quizDaily.completedQuizIds))    save.quizDaily.completedQuizIds = [];
            if (!save.quizDaily.progress)                           save.quizDaily.progress         = emptyQuizDaily().progress;

            save.quizDaily.progress.chantingCorrect = Math.max(0,               Math.floor(Number(save.quizDaily.progress.chantingCorrect)  || 0));
            save.quizDaily.progress.bestRoundPct    = Math.max(0, Math.min(100, Math.floor(Number(save.quizDaily.progress.bestRoundPct)     || 0)));

            save.quizDaily.progress.shortTimeQuiz   = save.quizDaily.progress.shortTimeQuiz     === true;
            save.quizDaily.progress.allOptionsQuiz  = save.quizDaily.progress.allOptionsQuiz    === true;
        }

        const getJstWeekMonday = (jstDateStr) => {
            const [y, m, d] = jstDateStr.split("-").map(Number);
            const dt        = new Date(Date.UTC(y, m - 1, d));
            const day       = dt.getUTCDay();
            const diffToMon = (day + 6) % 7;

            dt.setUTCDate(dt.getUTCDate() - diffToMon);
            return dt.toISOString().slice(0, 10);
        };

        const currentWeekStart = getJstWeekMonday(dailyBanners.jstDate);

        if (!save.tabiWeekly || save.tabiWeekly.weekStart !== currentWeekStart) save.tabiWeekly = {
            weekStart       : currentWeekStart,
            completedDates  : [],
            weeklyAwarded   : false
        };

        if (!save.tabiDaily || save.tabiDaily.date !== dailyBanners.jstDate) save.tabiDaily = {
            date            : dailyBanners.jstDate,
            started         : false,
            completed       : false,
            dailyAwarded    : false,
            dailyEarned     : 0,
            station         : 0,
            laps            : 0,
            qIndex          : 0,
            answers         : []
        };

        if (action === "INIT") {
            const incomingDiscordName = typeof body.discordName === "string" ? body.discordName.trim().slice(0, 24) : "";
            if (!save.displayName && incomingDiscordName) save.displayName = incomingDiscordName;

            if (!existing || existing.save_data?.quizDaily?.date !== dailyBanners.jstDate || (!existing.save_data?.displayName && save.displayName)) {
                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;
            }

            const clientSave = {...save};

            if (save.blackjack && Array.isArray(save.blackjack.playerCards) && Array.isArray(save.blackjack.dealerCards)) {
                const evalInitBjHand = (cards) => {
                    let total   = 0;
                    let aces    = 0;

                    for (const card of cards) {
                        const rank = String(card).split(":")[1];

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
                };

                clientSave.blackjack = {
                    status      : "ACTIVE",
                    bet         : save.blackjack.bet,
                    payout      : 0,
                    playerCards : save.blackjack.playerCards,
                    dealerCards : [save.blackjack.dealerCards[0], null],
                    playerScore : evalInitBjHand(save.blackjack.playerCards),
                    dealerScore : evalInitBjHand([save.blackjack.dealerCards[0]])
                };
            }

            return new Response(JSON.stringify({save: clientSave, dailyBanners: bannerPayload}), {headers: {...corsHeaders, "Content-Type": "application/json"}});
        }

        const QUIZ_MISSIONS = {
            played20    : {reward: 10, ready: p => p.songsPlayed            >=  20},
            played40    : {reward: 10, ready: p => p.songsPlayed            >=  40},
            correct10   : {reward: 10, ready: p => p.correct                >=  10},
            correct20   : {reward: 10, ready: p => p.correct                >=  20},
            streak5     : {reward: 10, ready: p => p.bestStreak             >=  5},
            streak10    : {reward: 10, ready: p => p.bestStreak             >=  10},
            acc25       : {reward: 10, ready: p => (p.bestRoundPct || 0)    >=  25},
            acc50       : {reward: 10, ready: p => (p.bestRoundPct || 0)    >=  50},
            chanting    : {reward: 10, ready: p => p.chantingCorrect        >=  1},
            shorttime   : {reward: 10, ready: p => p.shortTimeQuiz          === true},
            entry       : {reward: 10, ready: p => p.entryQuiz              === true},
            alloptions  : {reward: 10, ready: p => p.allOptionsQuiz         === true}
        };

        if (action === "QUIZ_START") {
            const settings  = validateQuizSettings(body.settings);
            const allSongs  = await getQuizSongsMeta();
            const pool      = getFilteredServerQuizSongs(settings, allSongs);

            if (pool.length < 100) throw new Error("Quiz pool must include at least 100 valid songs");

            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            const selected      = pool.slice(0, settings.count);
            const privateSongs  = selected.map(song => ({video_url: song.video_url, acceptedAnswers: [song.romaji, song.english, ...song.alts].filter(Boolean), chanting: song.chanting}));
            const expiresAt     = new Date(Date.now() + 120 * 60 * 1000).toISOString();

            const {data: session, error} = await adminClient
                .from("quiz_sessions")
                .insert({
                    user_id     : userId,
                    quiz_date   : dailyBanners.jstDate,
                    settings,
                    songs       : privateSongs,
                    expires_at  : expiresAt
                })
                .select("id")
                .single();

            if (error || !session) {
                console.error("Quiz session creation failed:", error);
                throw new Error("Could not create quiz session");
            }

            return new Response(JSON.stringify({
                quizId      : session.id,
                songUrls    : selected.map(song => song.video_url),
                expiresAt
            }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
        }

        if (action === "QUIZ_MISSION_PROGRESS") throw new Error("Client-submitted quiz mission progress is disabled");

        if (action === "QUIZ_COMPLETE") {
            const quizId = String(body.quizId || "");
            if (!/^[0-9a-f-]{36}$/i.test(quizId)) throw new Error("Invalid quiz session");

            const {data: session, error: sessionError} = await adminClient
                .from           ("quiz_sessions")
                .select         ("*")
                .eq             ("id", quizId)
                .eq             ("user_id", userId)
                .maybeSingle    ();

            if (sessionError || !session)       throw new Error("Quiz session not found");
            if (session.status !== "active")    throw new Error("Quiz session has already been submitted");

            if (new Date(session.expires_at).getTime() < Date.now()) {
                await adminClient
                    .from   ("quiz_sessions")
                    .update ({status: "expired"})
                    .eq     ("id", quizId)
                    .eq     ("status", "active");

                throw new Error("Quiz session expired");
            }

            if (session.quiz_date !== dailyBanners.jstDate) throw new Error("Quiz session belongs to another day");
            const submitted = body.answers;

            if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > session.songs.length) throw new Error("Invalid submitted answers");
            const privateSongs = session.songs;

            let correct         = 0;
            let bestStreak      = 0;
            let currentStreak   = 0;
            let chantingCorrect = 0;

            for (let i = 0; i < submitted.length; i++) {
                const answer    = submitted     [i];
                const expected  = privateSongs  [i];

                if (!answer || answer.video_url !== expected.video_url || typeof answer.skipped !== "boolean") throw new Error("Invalid quiz answer sequence");

                const normalized    = normalizeQuizAnswer(answer.answer);
                const accepted      = expected.acceptedAnswers.map(normalizeQuizAnswer);
                const isCorrect     = !answer.skipped && normalized.length > 0 && accepted.includes(normalized);

                if (isCorrect) {
                    correct++;
                    currentStreak++;

                    bestStreak = Math.max(bestStreak, currentStreak);
                    if (expected.chanting) chantingCorrect++;
                } else currentStreak = 0;
            }

            const {data: claimed, error: claimError} = await adminClient
                .from           ("quiz_sessions")
                .update         ({status: "processing"})
                .eq             ("id", quizId)
                .eq             ("user_id", userId)
                .eq             ("status", "active")
                .select         ("id")
                .maybeSingle    ();

            if (claimError || !claimed) throw new Error("Quiz session has already been claimed");
            let saveCommitted = false;

            try {
                saveCommitted       = true;
                const settings      = session.settings;
                const songsPlayed   = submitted.length;
                const roundSongs    = privateSongs.length;
                const daily         = save.quizDaily;

                if (daily.completedQuizIds.includes(quizId)) throw new Error("Quiz already completed");

                const categoryM = settings.categories.length === 3 ? 1 : settings.categories.length === 2 ? 0.8 : 0.6;
                const chantingM = settings.chanting ? 1 : 0.8;
                const sound     = Number(settings.sound);
                const extra     = Number(settings.extra);
                const timeM     = sound === 20 && extra === 0 ? 1 : sound === 15 && extra === 0 ? 1.2 : sound === 5 && extra === 0 ? 1.6 : sound === 2 && extra === 8 ? 1.4 : null;

                if (timeM === null) throw new Error("Invalid quiz time control");

                const VINTAGE_CHECKPOINTS   = [1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];
                const DIFF_CHECKPOINTS      = [20, 25, 30, 35];
                const DIFF_SPAN_MODS        = [0.6, 0.3, 0, -0.3, -0.6];

                const vMin = settings.vintageMin;
                const vMax = settings.vintageMax;
                const dMin = settings.diffMin;
                const dMax = settings.diffMax;

                const vStart    = vMin === null ? 0                                 : VINTAGE_CHECKPOINTS.indexOf(vMin) + 1;
                const vEnd      = vMax === null ? VINTAGE_CHECKPOINTS.length + 1    : VINTAGE_CHECKPOINTS.indexOf(vMax) + 1;

                const vintageM = Math.max(0.5, Number((1 - (11 - (vEnd - vStart)) * 0.05).toFixed(2)));

                const dStart    = dMin === null ? 0                             : DIFF_CHECKPOINTS.indexOf(dMin) + 1;
                const dEnd      = dMax === null ? DIFF_CHECKPOINTS.length + 1   : DIFF_CHECKPOINTS.indexOf(dMax) + 1;

                let diffMod = 0;
                for (let i = dStart; i < dEnd; i++) diffMod += DIFF_SPAN_MODS[i];

                const diffM             = Math.max(0.2, Number((1 + diffMod / (dEnd - dStart)).toFixed(2)));
                const modeM             = settings.mode === "entry" ? 1 : 0.4;
                const streakM           = bestStreak >= 15 ? 1.6 : bestStreak >= 10 ? 1.4 : bestStreak >= 5 ? 1.2 : 1;
                const multiplier        = categoryM * chantingM * timeM * modeM * streakM * vintageM * diffM;
                const requestedReward   = Math.max(0, Math.round(correct * multiplier));
                const quizReward        = Math.min(requestedReward, Math.max(0, 120 - daily.quizEarned));

                daily.quizEarned    += quizReward;
                save.stars          += quizReward;

                daily.completedQuizIds.push(quizId);

                const roundPct = roundSongs >= 20 ? Math.floor((correct / roundSongs) * 100) : 0;
                const progress = daily.progress;

                progress.songsPlayed        += songsPlayed;
                progress.correct            += correct;
                progress.chantingCorrect    += chantingCorrect;

                progress.bestStreak     = Math.max(progress.bestStreak, bestStreak);
                progress.bestRoundPct   = Math.max(progress.bestRoundPct || 0, roundPct);
                const completed         = songsPlayed === roundSongs;

                progress.allCategoriesQuiz  ||= (completed && settings.categories.length === 3);
                progress.entryQuiz          ||= (completed && settings.mode === "entry");
                progress.shortTimeQuiz      ||= (completed && (sound !== 20 || extra !== 0));

                progress.allOptionsQuiz ||= (
                    completed                           &&
                    settings.categories.length === 3    &&
                    settings.chanting                   &&
                    settings.vintageMin === null        &&
                    settings.vintageMax === null        &&
                    settings.diffMin    === null        &&
                    settings.diffMax    === null
                );

                let missionReward = 0;

                for (const [missionId, mission] of Object.entries(QUIZ_MISSIONS)) {
                    if (!daily.claimedMissions.includes(missionId) && mission.ready(progress) && daily.missionEarned + mission.reward <= 120) {
                        daily.claimedMissions.push(missionId);

                        daily.missionEarned += mission.reward;
                        save.stars          += mission.reward;
                        missionReward       += mission.reward;
                    }
                }

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);

                if (conflictResponse) {
                    await adminClient
                        .from   ("quiz_sessions")
                        .update ({status: "active"})
                        .eq     ("id", quizId)
                        .eq     ("status", "processing");

                    return conflictResponse;
                }

                const {error: finishError} = await adminClient
                    .from   ("quiz_sessions")
                    .update ({
                        status          : "completed",
                        completed_at    : new Date().toISOString(),
                        result          : {songsPlayed, correct, bestStreak, chantingCorrect, quizReward, missionReward}
                    })
                    .eq     ("id", quizId)
                    .eq     ("status", "processing");

                if (finishError) {
                    console.error("Quiz session finalization failed:", finishError);
                    throw new Error("Could not finalize quiz session");
                }

                return new Response(JSON.stringify({save, quizReward, missionReward, requestedReward, multiplier, dailyBanners: bannerPayload}), {headers: {...corsHeaders, "Content-Type": "application/json"}});

            } catch (error) {
                if (!saveCommitted) {await adminClient
                    .from   ("quiz_sessions")
                    .update ({status: "active"})
                    .eq     ("id", quizId)
                    .eq     ("status", "processing");
                }

                throw error;
            }
        } else if (action === "QUIZ_CLAIM_MISSION") {
            const missionId = String(body.missionId || "");

            const missions = {
                played20    : {reward: 10, ready: p => p.songsPlayed            >=  20},
                played40    : {reward: 10, ready: p => p.songsPlayed            >=  40},
                correct10   : {reward: 10, ready: p => p.correct                >=  10},
                correct20   : {reward: 10, ready: p => p.correct                >=  20},
                streak5     : {reward: 10, ready: p => p.bestStreak             >=  5},
                streak10    : {reward: 10, ready: p => p.bestStreak             >=  10},
                acc25       : {reward: 10, ready: p => (p.bestRoundPct || 0)    >=  25},
                acc50       : {reward: 10, ready: p => (p.bestRoundPct || 0)    >=  50},
                chanting    : {reward: 10, ready: p => p.chantingCorrect        >=  1},
                shorttime   : {reward: 10, ready: p => p.shortTimeQuiz          === true},
                entry       : {reward: 10, ready: p => p.entryQuiz              === true},
                alloptions  : {reward: 10, ready: p => p.allOptionsQuiz         === true}
            };

            const mission = missions[missionId];
            if (!mission) throw new Error("Unknown quiz mission");

            const daily = save.quizDaily;

            if (daily.claimedMissions.includes(missionId))  throw new Error("Mission already claimed");
            if (!mission.ready(daily.progress))             throw new Error("Mission requirements not met");
            if (daily.missionEarned + mission.reward > 120) throw new Error("Daily mission reward cap reached");

            daily.claimedMissions.push(missionId);

            daily.missionEarned += mission.reward;
            save.stars          += mission.reward;

            const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save); 
            if (conflictResponse) return conflictResponse;
            return new Response(JSON.stringify({save, missionReward: mission.reward, dailyBanners: bannerPayload}), {headers: {...corsHeaders, "Content-Type": "application/json"}});
        } else if (action === "CASINO_BLACKJACK") {
            const BJ_SUITS = ["Spades", "Hearts", "Diamonds", "Clubs"];
            const BJ_RANKS = ["R", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];

            const evalBjHand = (cards) => {
                let total   = 0;
                let aces    = 0;

                for (const card of cards) {
                    const rank = String(card).split(":")[1];

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
            };

            const subAction = body.subAction;

            if (subAction === "DEAL") {
                const bet               = Math.floor(Number(body.bet));
                const remainingDaily    = DAILY_CASINO_BET_LIMIT - save.casinoDailyBet.BLACKJACK;

                if (!Number.isFinite(bet) || bet < 1 || bet > 1000) throw new Error("Bet must be between 1 and 1,000 Stars");
                if (bet > remainingDaily)                           throw new Error(`Exceeds daily bet limit (${remainingDaily.toLocaleString()} Stars remaining)`);
                if (save.stars < bet)                               throw new Error("Not enough stars");

                const shoe = [];
                for (const s of BJ_SUITS) {for (const r of BJ_RANKS) shoe.push(`${s}:${r}`)}

                for (let i = shoe.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
                }

                save.stars                      -= bet;
                save.casinoDailyBet.BLACKJACK   += bet;

                const playerCards = [shoe.pop(), shoe.pop()];
                const dealerCards = [shoe.pop(), shoe.pop()];
                const playerScore = evalBjHand(playerCards);
                const dealerScore = evalBjHand(dealerCards);

                let status = "ACTIVE";
                let payout = 0;

                if (playerScore === 21 || dealerScore === 21) {
                    if (playerScore === 21 && dealerScore === 21) {
                        status = "PUSH";
                        payout = bet;
                    } else if (playerScore === 21) {
                        status = "BLACKJACK";
                        payout = Math.floor(bet * 2.5);
                    } else {
                        status = "DEALER_BLACKJACK";
                        payout = 0;
                    }

                    save.stars      +=  payout;
                    save.blackjack  =   null;
                } else save.blackjack = {bet, shoe, playerCards, dealerCards};

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    game: {
                        status,
                        bet,
                        payout,
                        playerCards,
                        dealerCards : status === "ACTIVE" ? [dealerCards[0], null]          : dealerCards,
                        playerScore,
                        dealerScore : status === "ACTIVE" ? evalBjHand([dealerCards[0]])    : dealerScore
                    }
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            const bj = save.blackjack;
            if (!bj || !Array.isArray(bj.shoe) || !Array.isArray(bj.playerCards) || !Array.isArray(bj.dealerCards)) throw new Error("No active Blackjack hand");

            if (subAction === "HIT") {
                bj.playerCards.push(bj.shoe.pop());
                const playerScore = evalBjHand(bj.playerCards);

                if (playerScore > 21) {
                    const dealerScore   = evalBjHand(bj.dealerCards);
                    save.blackjack      = null;

                    const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                    if (conflictResponse) return conflictResponse;

                    return new Response(JSON.stringify({
                        save,
                        game: {
                            status      : "BUST",
                            bet         : bj.bet,
                            payout      : 0,
                            playerCards : bj.playerCards,
                            dealerCards : bj.dealerCards,
                            playerScore,
                            dealerScore
                        }
                    }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
                }

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    game: {
                        status      : "ACTIVE",
                        bet         : bj.bet,
                        payout      : 0,
                        playerCards : bj.playerCards,
                        dealerCards : [bj.dealerCards[0], null],
                        playerScore,
                        dealerScore : evalBjHand([bj.dealerCards[0]])
                    }
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            if (subAction === "STAND") {
                while (evalBjHand(bj.dealerCards) < 17 && bj.shoe.length > 0) bj.dealerCards.push(bj.shoe.pop());

                const playerScore = evalBjHand(bj.playerCards);
                const dealerScore = evalBjHand(bj.dealerCards);

                let status = "LOSE";
                let payout = 0;

                if (dealerScore > 21) {
                    status = "DEALER_BUST";
                    payout = bj.bet * 2;
                } else if (playerScore > dealerScore) {
                    status = "WIN";
                    payout = bj.bet * 2;
                } else if (playerScore === dealerScore) {
                    status = "PUSH";
                    payout = bj.bet;
                }

                save.stars      +=  payout;
                save.blackjack  =   null;

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    game: {
                        status,
                        bet         : bj.bet,
                        payout,
                        playerCards : bj.playerCards,
                        dealerCards : bj.dealerCards,
                        playerScore,
                        dealerScore
                    }
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            throw new Error("Invalid Blackjack action");
        } else if (action === "CASINO_ROULETTE") {
            const RED_NUMBERS       = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
            const bet               = Math.floor(Number(body.bet));
            const betColor          = body.color    != null ?   String(body.color).toUpperCase() : null;
            const betNumber         = body.number   != null ?   Number(body.number) : null;
            const validColor        = betColor      !== null && ["RED", "BLACK", "GREEN"].includes(betColor);
            const validNumber       = betNumber     !== null && Number.isInteger(betNumber) && betNumber >= 1 && betNumber <= 36;
            const remainingDaily    = DAILY_CASINO_BET_LIMIT - save.casinoDailyBet.ROULETTE;

            if ((!validColor && !validNumber) || (validColor && validNumber))   throw new Error("Invalid bet selection");
            if (!Number.isFinite(bet) || bet < 1 || bet > 1000)                 throw new Error("Bet must be between 1 and 1,000 Stars");
            if (bet > remainingDaily)                                           throw new Error(`Exceeds daily bet limit (${remainingDaily.toLocaleString()} Stars remaining)`);
            if (save.stars < bet)                                               throw new Error("Not enough stars");

            save.stars                   -=  bet;
            save.casinoDailyBet.ROULETTE +=  bet;

            const pocket = Math.floor(Math.random() * 37);

            const resultColor   = pocket === 0  ? "GREEN"                                                       : (RED_NUMBERS.has(pocket) ? "RED" : "BLACK");
            const won           = validNumber   ? (pocket === betNumber)                                        : (resultColor === betColor);
            const payout        = won           ? ((validNumber || betColor === "GREEN") ? bet * 36 : bet * 2)  : 0;

            save.stars += payout;

            const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
            if (conflictResponse) return conflictResponse;

            return new Response(JSON.stringify({
                save,
                spin: {
                    pocket,
                    resultColor,
                    betColor,
                    betNumber,
                    bet,
                    payout,
                    won
                }
            }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
        } else if (action === "CASINO_FX") {
            const FX_CONFIGS = {
                "USD/JPY": {base: 154.200,  vol: 0.00024, drift:  0.000000, jumpProb: 0.020, jumpScale: 0.0022, swapLong: -0.0003, swapShort: -0.0003, spread: 0.00016},
                "AUD/JPY": {base: 100.400,  vol: 0.00033, drift:  0.000000, jumpProb: 0.018, jumpScale: 0.0030, swapLong:  0.0001, swapShort: -0.0006, spread: 0.00020},
                "GBP/JPY": {base: 195.800,  vol: 0.00056, drift:  0.000000, jumpProb: 0.032, jumpScale: 0.0044, swapLong: -0.0004, swapShort: -0.0004, spread: 0.00030},
                "EUR/CHF": {base: 0.94200,  vol: 0.00008, drift:  0.000000, jumpProb: 0.012, jumpScale: 0.0040, swapLong: -0.0004, swapShort: -0.0004, spread: 0.00018},
                "ZAR/JPY": {base: 8.4500,   vol: 0.00036, drift: -0.000012, jumpProb: 0.020, jumpScale: 0.0028, swapLong:  0.0012, swapShort: -0.0020, spread: 0.00032},
                "TRY/JPY": {base: 4.3800,   vol: 0.00052, drift: -0.000018, jumpProb: 0.028, jumpScale: 0.0042, swapLong:  0.0018, swapShort: -0.0028, spread: 0.00045}
            };

            const subAction = String(body.subAction || "");

            if (subAction === "OPEN") {
                const pair              = String(body.pair || "");
                const side              = String(body.side || "").toUpperCase();
                const leverage          = Number(body.leverage);
                const bet               = Math.floor(Number(body.bet));
                const remainingDaily    = DAILY_CASINO_BET_LIMIT - save.casinoDailyBet.FX;

                if (!FX_CONFIGS[pair])                              throw new Error("Invalid currency pair");
                if (side !== "LONG" && side !== "SHORT")            throw new Error("Invalid trade direction");
                if (![100, 250, 500, 1000].includes(leverage))      throw new Error("Invalid leverage");
                if (!Number.isFinite(bet) || bet < 1 || bet > 1000) throw new Error("Bet must be between 1 and 1,000 Stars");
                if (bet > remainingDaily)                           throw new Error(`Exceeds daily bet limit (${remainingDaily.toLocaleString()} Stars remaining)`);
                if (save.stars < bet)                               throw new Error("Not enough stars");

                save.stars              -= bet;
                save.casinoDailyBet.FX  += bet;

                const cfg       = FX_CONFIGS[pair];
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

                        if (close > high)   high = close;
                        if (close < low)    low  = close;

                        ticks.push({high, low, close});
                    }

                    candles.push({open, high, low, close, ticks});
                    price = close;
                }

                const entryPrice = candles[0].open;

                save.fxSession = {
                    sessionId   : crypto.randomUUID(),
                    pair,
                    candles,
                    swapLong    : cfg.swapLong,
                    swapShort   : cfg.swapShort,
                    spread      : cfg.spread,
                    totalMargin : bet,
                    positions   : [{side, leverage, bet, entryPrice, openSec: 0}]
                };

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    session: save.fxSession
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            if (subAction === "ADD") {
                const fxSession         = save.fxSession;
                const sessionId         = String(body.sessionId || "");
                const side              = String(body.side || "").toUpperCase();
                const leverage          = Number(body.leverage);
                const bet               = Math.floor(Number(body.bet));
                const atSec             = Math.min(299, Math.max(0, Math.floor(Number(body.atSec) || 0)));
                const remainingDaily    = DAILY_CASINO_BET_LIMIT - save.casinoDailyBet.FX;

                if (!fxSession || fxSession.sessionId !== sessionId)    throw new Error("No active Forex session");
                if (side !== "LONG" && side !== "SHORT")                throw new Error("Invalid trade direction");
                if (fxSession.positions[0]?.side !== side)              throw new Error("Cannot hedge opposite direction in active session");
                if (![100, 250, 500, 1000].includes(leverage))          throw new Error("Invalid leverage");
                if (!Number.isFinite(bet) || bet < 1 || bet > 1000)     throw new Error("Bet must be between 1 and 1,000 Stars");
                if (bet > remainingDaily)                               throw new Error(`Exceeds daily bet limit (${remainingDaily.toLocaleString()} Stars remaining)`);
                if (save.stars < bet)                                   throw new Error("Not enough stars");

                save.stars              -= bet;
                save.casinoDailyBet.FX  += bet;

                const cIdx      = Math.floor(atSec / 5);
                const subIdx    = atSec % 5;
                const dir       = side === "LONG" ? 1 : -1;
                const livePrice = fxSession.candles[cIdx].ticks?.[subIdx]?.close ?? fxSession.candles[cIdx].close;
                const markPrice = livePrice * (1 + dir * (fxSession.spread || 0));

                fxSession.positions.push({side, leverage, bet, entryPrice: markPrice, openSec: atSec});
                fxSession.totalMargin += bet;

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    session: fxSession
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            if (subAction === "SETTLE") {
                const fxSession = save.fxSession;
                const sessionId = String(body.sessionId || "");
                const closeSec  = Math.min(299, Math.max(0, Math.floor(Number(body.closeSec) || 0)));

                if (!fxSession || fxSession.sessionId !== sessionId) throw new Error("No active Forex session");

                let liquidated  = false;
                let swapTotal   = 0;
                let finalEquity = fxSession.totalMargin;

                for (let s = 0; s <= closeSec; s++) {
                    const c     = fxSession.candles[Math.floor(s / 5)];
                    const price = c.ticks?.[s % 5]?.close ?? c.close;
                    let pnlSum  = 0;
                    let swapSum = 0;

                    for (const pos of fxSession.positions) {
                        const dir       = pos.side === "LONG" ? 1 : -1;
                        const swapRate  = pos.side === "LONG" ? fxSession.swapLong : fxSession.swapShort;
                        const move      = ((price - pos.entryPrice) / pos.entryPrice) * dir;

                        pnlSum  += pos.bet * pos.leverage * move;
                        swapSum += pos.bet * swapRate * Math.max(0, (s + 1) - pos.openSec);
                    }

                    swapTotal   = Math.round(swapSum);
                    const eq    = fxSession.totalMargin + pnlSum + swapTotal;

                    if (eq <= fxSession.totalMargin * 0.15) {
                        liquidated  = true;
                        finalEquity = 0;

                        break;
                    }

                    const maxPayout = fxSession.totalMargin * 4;

                    if (eq >= maxPayout) {
                        finalEquity = maxPayout;
                        break;
                    }

                    finalEquity = Math.max(0, Math.round(eq));
                }

                const payout    =   liquidated ? 0 : finalEquity;
                save.stars      +=  payout;
                save.fxSession  =   null;

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    result: {
                        liquidated,
                        swapTotal,
                        payout
                    }
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            throw new Error("Invalid Forex action");
        } else if (action === "CASINO_SYNERGY") {
            const SWAP_STEP     = 5;
            const TIER_RANK     = {SSR: 9,      SR: 8,  S: 7,   A: 6,   B: 5, C: 4, D: 3, E: 2, F: 1};
            const RARITY_PTS    = {SSR: 128,    SR: 64, S: 32,  A: 16,  B: 8, C: 4, D: 3, E: 2, F: 1};

            const getCardLevel = (count) => count >= 6 ? 3 : count >= 3 ? 2 : count === 2 ? 1 : 0;

            const getEraKey = (year) => {
                if (!year)          return null;
                if (year < 2000)    return "Pre-2000s";
                if (year < 2010)    return "2000s";

                const start = Math.floor(year / 5) * 5;
                return `${start}-${start + 4}`;
            };

            const sortByRarity = (keys, levelMap = null) => [...keys].sort((a, b) => {
                const ta = TIER_RANK[gameData.charMap.get(a)?.tier] || 0;
                const tb = TIER_RANK[gameData.charMap.get(b)?.tier] || 0;

                if (tb !== ta) return tb - ta;

                const la = levelMap ? (levelMap[a] ?? 0) : getCardLevel(save.inventory[a] || 1);
                const lb = levelMap ? (levelMap[b] ?? 0) : getCardLevel(save.inventory[b] || 1);

                return lb - la;
            });

            const evalSynergyHand = (keys, levelMap = null, maxSlots = 7) => {
                const chars = (keys || []).map(k => gameData.charMap.get(k)).filter(Boolean).slice(0, maxSlots);
                if (!chars.length) return 0;

                const filled        = chars.length;
                const completionPts = filled * 8 + (filled === maxSlots ? 64 : 0);
                let powerPts        = 0;

                const franchiseCounts   = new Map();
                const studioCounts      = new Map();
                const sourceCounts      = new Map();
                const eraCounts         = new Map();
                const genreCounts       = new Map();
                const tagCounts         = new Map();

                for (const c of chars) {
                    const tierPts   = RARITY_PTS[c.tier] || 1;
                    const level     = levelMap ? (levelMap[c.uniqueKey] ?? 0) : getCardLevel(save.inventory[c.uniqueKey] || 1);

                    powerPts += tierPts + level * 4;

                    if (c.rootAnimeId)  franchiseCounts .set(c.rootAnimeId, (franchiseCounts    .get(c.rootAnimeId) || 0) + 1);
                    if (c.source)       sourceCounts    .set(c.source,      (sourceCounts       .get(c.source)      || 0) + 1);

                    const era = getEraKey(c.animeYear);
                    if (era) eraCounts.set(era, (eraCounts.get(era) || 0) + 1);

                    for (const s of c.studios   || []) studioCounts .set(s, (studioCounts   .get(s) || 0) + 1);
                    for (const g of c.genres    || []) genreCounts  .set(g, (genreCounts    .get(g) || 0) + 1);
                    for (const t of c.tags      || []) tagCounts    .set(t, (tagCounts      .get(t) || 0) + 1);
                }

                const calcPairSum = (countMap, weight, maxItems = Infinity) => {
                    const counts    = Array.from(countMap.values()).filter (cnt => cnt >= 2).sort((a, b) => b - a).slice(0, maxItems);
                    let pts         = 0;

                    for (const cnt of counts) pts += ((cnt * (cnt - 1)) / 2) * weight;
                    return Math.round(pts);
                };

                return (
                    completionPts + powerPts +
                    calcPairSum(franchiseCounts,    64)     +
                    calcPairSum(studioCounts,       32)     +
                    calcPairSum(sourceCounts,       1)      +
                    calcPairSum(eraCounts,          16)     +
                    calcPairSum(genreCounts,        8, 3)   +
                    calcPairSum(tagCounts,          1, 3)
                );
            };

            const ownedKeys = Object.entries(save.inventory || {}).filter(([k, cnt]) => cnt > 0 && gameData.charMap.has(k)).map(([k]) => k);

            const shuffle = (arr) => {
                const copy = [...arr];

                for (let i = copy.length - 1; i > 0; i--) {
                    const j             = Math.floor(Math.random() * (i + 1));
                    [copy[i], copy[j]]  = [copy[j], copy[i]];
                }

                return copy;
            };

            const subAction = String(body.subAction || "");

            if (subAction === "START") {
                if (ownedKeys.length < 56) throw new Error("You must have at least 56 cards in your collection to play Synergy");
                const bet               = Math.floor(Number(body.bet));
                const remainingDaily    = DAILY_CASINO_BET_LIMIT - save.casinoDailyBet.SYNERGY;

                if (!Number.isFinite(bet) || bet < 1 || bet > 1000) throw new Error("Bet must be between 1 and 1,000 Stars");
                if (bet > remainingDaily)                           throw new Error(`Exceeds daily bet limit (${remainingDaily.toLocaleString()} Stars remaining)`);
                if (save.stars < bet)                               throw new Error("Not enough stars");

                save.stars                  -= bet;
                save.casinoDailyBet.SYNERGY += bet;

                const globalKeys    = gameData.charList.map(([key]) => key);
                const playerHand    = sortByRarity(shuffle(ownedKeys).slice(0, 7));
                const byTier        = new Map();

                for (const [key, tier] of gameData.charList) {
                    if (!byTier.has(tier)) byTier.set(tier, []);
                    byTier.get(tier).push(key);
                }

                const pickedDealer  = [];
                const usedDealer    = new Set();
                const dealerLevels  = {};

                for (const pKey of playerHand) {
                    const pChar         = gameData.charMap.get(pKey);
                    const tier          = pChar?.tier || "F";
                    const mirroredLevel = getCardLevel(save.inventory[pKey] || 1);
                    const candidates    = shuffle(byTier.get(tier) || globalKeys);
                    const chosen        = candidates.find(k => !usedDealer.has(k)) || candidates[0];

                    if (chosen) {
                        pickedDealer    .push   (chosen);
                        usedDealer      .add    (chosen);

                        dealerLevels[chosen] = mirroredLevel;
                    }
                }

                const maxPlayerRank = Math.max(...playerHand.map    (k => TIER_RANK     [gameData.charMap.get(k)?.tier] || 1));
                const eligiblePool  = globalKeys.filter             (k => (TIER_RANK    [gameData.charMap.get(k)?.tier] || 1) <= maxPlayerRank);

                for (const k of shuffle(eligiblePool)) {
                    if (pickedDealer.length >= 14) break;

                    if (!usedDealer.has(k)) {
                        pickedDealer    .push   (k);
                        usedDealer      .add    (k);

                        dealerLevels[k] = 0;
                    }
                }

                const dealerHand        = sortByRarity(pickedDealer.slice(0, 14), dealerLevels);
                const dealerPoolSize    = globalKeys.length;

                save.synergySession = {
                    bet,
                    playerHand,
                    dealerHand,
                    dealerLevels,
                    dealerPoolSize,
                    swapCount       : 0,
                    totalSwapCost   : 0
                };

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                const playerSynergy = evalSynergyHand(playerHand);

                return new Response(JSON.stringify({
                    save,
                    game: {
                        status              : "ACTIVE",
                        bet,
                        payout              : 0,
                        playerHand,
                        dealerHand          : [],
                        dealerPoolSize,
                        playerSynergy,
                        swapCount           : 0,
                        totalSwapCost       : 0,
                        playerNetSynergy    : playerSynergy,
                        dealerSynergy       : null
                    }
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            const syn = save.synergySession;
            if (!syn || !Array.isArray(syn.playerHand) || !Array.isArray(syn.dealerHand)) throw new Error("No active Synergy session");

            if (subAction === "SWAP") {
                const removeKey = String(body.removeKey || "");

                const idx = syn.playerHand.indexOf(removeKey);
                if (idx === -1) throw new Error("Card is not in your current hand");

                const inHandSet = new Set(syn.playerHand);
                const pool      = ownedKeys.filter(k => !inHandSet.has(k));

                if (!pool.length) throw new Error("No other owned cards available to swap in");

                const replacement   = pool[Math.floor(Math.random() * pool.length)];
                const cost          = (syn.swapCount + 1) * SWAP_STEP;

                syn.playerHand[idx] = replacement;
                syn.playerHand      = sortByRarity(syn.playerHand);

                syn.swapCount       += 1;
                syn.totalSwapCost   += cost;

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                const playerSynergy = evalSynergyHand(syn.playerHand);

                return new Response(JSON.stringify({
                    save,
                    game: {
                        status              : "ACTIVE",
                        bet                 : syn.bet,
                        payout              : 0,
                        playerHand          : syn.playerHand,
                        dealerHand          : [],
                        dealerPoolSize      : syn.dealerPoolSize,
                        playerSynergy,
                        swapCount           : syn.swapCount,
                        totalSwapCost       : syn.totalSwapCost,
                        playerNetSynergy    : playerSynergy - syn.totalSwapCost,
                        dealerSynergy       : null
                    }
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            if (subAction === "FINISH") {
                const playerSynergy     = evalSynergyHand(syn.playerHand, null, 7);
                const playerNetSynergy  = playerSynergy - syn.totalSwapCost;
                const dealerSynergy     = evalSynergyHand(syn.dealerHand, syn.dealerLevels || {}, 10);
                const won               = playerNetSynergy > dealerSynergy;
                const payout            = won ? syn.bet * 2 : 0;

                save.stars += payout;

                const finalState = {
                    status          : won ? "WIN" : "LOSE",
                    bet             : syn.bet,
                    payout,
                    playerHand      : syn.playerHand,
                    dealerHand      : syn.dealerHand,
                    dealerLevels    : syn.dealerLevels || {},
                    dealerPoolSize  : syn.dealerPoolSize,
                    playerSynergy,
                    swapCount       : syn.swapCount,
                    totalSwapCost   : syn.totalSwapCost,
                    playerNetSynergy,
                    dealerSynergy
                };

                save.synergySession = null;

                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;

                return new Response(JSON.stringify({
                    save,
                    game: finalState
                }), {headers: {...corsHeaders, "Content-Type": "application/json"}});
            }

            throw new Error("Invalid Synergy action");
        } else if (action === "TABI_START" || action === "TABI_ANSWER") {
            const [y, m, d] = dailyBanners.jstDate.split("-").map(Number);
            const dow       = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 1=Mon..6=Sat

            const DAY_CONFIG = {
                1: {route: "West",  qCount: 7, target: 20, maxStep: 5,  types: Array(7).fill("PERSON")},
                2: {route: "North", qCount: 7, target: 20, maxStep: 5,  types: Array(7).fill("WORK")},
                3: {route: "West",  qCount: 6, target: 20, maxStep: 5,  types: Array(6).fill("PERSON")},
                4: {route: "North", qCount: 6, target: 20, maxStep: 5,  types: Array(6).fill("WORK")},
                5: {route: "West",  qCount: 5, target: 20, maxStep: 5,  types: Array(5).fill("PERSON")},
                6: {route: "North", qCount: 5, target: 20, maxStep: 5,  types: Array(5).fill("WORK")},
                0: {route: "Loop",  qCount: 6, target: 30, maxStep: 30, types: null}
            };

            const cfg = DAY_CONFIG[dow];
            const rng = mulberry32(hashSeed(`anigacha-tabi-${dailyBanners.jstDate}`));

            const firstAlpha = (str) => {
                const m = String(str || "").trim().match(/[A-Za-z]/);
                return m ? m[0].toUpperCase() : null;
            };

            const lastAlpha = (str) => {
                const m = String(str || "").trim().match(/[A-Za-z](?=[^A-Za-z]*$)/);
                return m ? m[0].toUpperCase() : null;
            };

            const checkLexicalRule = (rawStrings, lexRule, lexVal) => {
                const strings = (rawStrings || []).filter(Boolean).map(s => String(s).trim());
                if (!strings.length) return false;

                return strings.some(str => {
                    const words = str.split(/\s+/).filter(Boolean);

                    if (lexRule === "ONE_WORD")         return words.length === 1;
                    if (lexRule === "TWO_WORDS")        return words.length === 2;
                    if (lexRule === "THREE_PLUS_WORDS") return words.length >=  3;
                    if (lexRule === "FIVE_PLUS_WORDS")  return words.length >=  5;
                    if (lexRule === "ALLITERATION")     return words.length >=  2 && firstAlpha(words[0]) !== null && firstAlpha(words[0]) === firstAlpha(words[words.length - 1]);
                    if (lexRule === "DOUBLE_LETTER")    return /([A-Za-z])\1/i          .test(str);
                    if (lexRule === "STARTS_WITH")      return firstAlpha   (str) === lexVal;
                    if (lexRule === "ENDS_WITH")        return lastAlpha    (str) === lexVal;
                    if (lexRule === "HAS_LETTER")       return new RegExp(lexVal, "i")  .test(str);
                    if (lexRule === "HAS_NUMBER")       return /\d/                     .test(str);
                    if (lexRule === "HAS_PUNCTUATION")  return /[^\p{L}\p{N}\s]/u       .test(str);

                    return false;
                });
            };

            const hasGenre = (target, g) => Array.isArray(target.genres) ? target.genres.includes(g) : Boolean(target.genres?.has?.(g));

            const checkPromptRule = (prompt, target, idxSetItem) => {
                if (prompt.rule === "GENRE")                                                                                                    return hasGenre(target, prompt.value);
                if (prompt.rule === "SOURCE")                                                                                                   return target.source === prompt.value;
                if (["ERA", "STUDIO", "FRANCHISE", "TAG"].includes(prompt.rule))                                                                return Boolean(prompt.idxs?.has(idxSetItem));
                if (["INT_GENRE_ERA", "INT_GENRE_STUDIO", "INT_GENRE_FRANCHISE", "INT_GENRE_TAG"]                       .includes(prompt.rule)) return hasGenre(target, prompt.genre)           && Boolean(prompt.idxs?.has(idxSetItem));
                if (prompt.rule === "INT_GENRE_SOURCE")                                                                                         return hasGenre(target, prompt.genre)           && target.source === prompt.source;
                if (["INT_SOURCE_ERA", "INT_SOURCE_STUDIO", "INT_SOURCE_FRANCHISE", "INT_SOURCE_TAG"]                   .includes(prompt.rule)) return target.source === prompt.source          && Boolean(prompt.idxs?.has(idxSetItem));
                if (["INT_ERA_STUDIO", "INT_ERA_FRANCHISE", "INT_ERA_TAG", "INT_STUDIO_FRANCHISE", "INT_STUDIO_TAG"]    .includes(prompt.rule)) return Boolean(prompt.idxsA?.has(idxSetItem))   && Boolean(prompt.idxsB?.has(idxSetItem));
                if (prompt.rule === "INT_LEX_GENRE")                                                                                            return hasGenre(target, prompt.genre)           && checkLexicalRule(prompt.kind === "PERSON" ? [target.name] : [target.romaji, target.english], prompt.lexRule, prompt.lexVal);
                if (prompt.rule === "INT_LEX_SOURCE")                                                                                           return target.source === prompt.source          && checkLexicalRule(prompt.kind === "PERSON" ? [target.name] : [target.romaji, target.english], prompt.lexRule, prompt.lexVal);
                if (["INT_LEX_ERA", "INT_LEX_STUDIO", "INT_LEX_FRANCHISE", "INT_LEX_TAG"]                               .includes(prompt.rule)) return Boolean(prompt.idxs?.has(idxSetItem))    && checkLexicalRule(prompt.kind === "PERSON" ? [target.name] : [target.romaji, target.english], prompt.lexRule, prompt.lexVal);

                if (prompt.rule === "LEX") {
                    const strings = prompt.kind === "PERSON" ? [target.name] : [target.romaji, target.english];
                    return checkLexicalRule(strings, prompt.lexRule, prompt.lexVal);
                }

                if (prompt.rule === "LEX_STARTS_ENDS") {
                    const strings = (prompt.kind === "PERSON" ? [target.name] : [target.romaji, target.english]).filter(Boolean);
                    return strings.some(str => firstAlpha(str) === prompt.lexVal && lastAlpha(str) === prompt.lexVal2);
                }

                return false;
            };

            const getPromptSignature = (p) => [p.kind, p.rule, p.value, p.genre, p.era, p.studio, p.source, p.franchise, p.tag, p.lexRule, p.lexVal, p.lexVal2].filter(Boolean).join("|");

            const getPromptCriteria = (p) => {
                const criteria = [];

                if (["GENRE", "ERA", "STUDIO", "SOURCE", "FRANCHISE", "TAG"].includes(p.rule) && p.value)   criteria.push(`${p.rule}:${p.value}`)
                if (p.genre)                                                                                criteria.push(`GENRE:${p.genre}`);
                if (p.era)                                                                                  criteria.push(`ERA:${p.era}`);
                if (p.studio)                                                                               criteria.push(`STUDIO:${p.studio}`);
                if (p.source)                                                                               criteria.push(`SOURCE:${p.source}`);
                if (p.franchise)                                                                            criteria.push(`FRANCHISE:${p.franchise}`);
                if (p.tag)                                                                                  criteria.push(`TAG:${p.tag}`);

                if (p.rule === "LEX_STARTS_ENDS") {
                    criteria.push("LEX:LEX_STARTS_ENDS");

                    if (p.lexVal)   criteria.push(`LEX_VAL:${p.lexVal}`);
                    if (p.lexVal2)  criteria.push(`LEX_VAL:${p.lexVal2}`);
                } else if (p.lexRule) {
                    criteria.push(`LEX:${p.lexRule}`);
                    if (p.lexVal) criteria.push(`LEX_VAL:${p.lexVal}`);
                }

                return criteria;
            };

            const hasEnoughMatches = (prompt, minMatches = 25) => {
                let count = 0;

                if (prompt.kind === "PERSON") {
                    for (const c of gameData.charMap.values()) {
                        if (checkPromptRule(prompt, c, c.charIdx) && ++count >= minMatches) return true;
                    }
                } else {
                    for (const [, keysForAnime] of gameData.animeToCharKeys.entries()) {
                        const repChar = gameData.charMap.get(keysForAnime[0]);
                        if (repChar && checkPromptRule(prompt, repChar, repChar.charIdx) && ++count >= minMatches) return true;
                    }
                }

                return false;
            };

            const pickValidPrompt = (builders, usedSignatures, usedCriteria) => {
                const isUnused = (_, sig, criteria) => !usedSignatures.has(sig) && !criteria.some(c => usedCriteria.has(c));

                const recordUsed = (sig, criteria) => {
                    usedSignatures.add(sig);
                    for (const c of criteria) usedCriteria.add(c);
                };

                for (let attempt = 0; attempt < 50; attempt++) {
                    const fn        = builders[Math.floor(rng() * builders.length)];
                    const candidate = fn();

                    if (!candidate) continue;

                    const sig       = getPromptSignature    (candidate);
                    const criteria  = getPromptCriteria     (candidate);

                    if (!isUnused(candidate, sig, criteria)) continue;

                    if (hasEnoughMatches(candidate, 25)) {
                        recordUsed(sig, criteria);
                        return candidate;
                    }
                }

                for (const fn of builders) {
                    const fallback = fn();
                    if (!fallback) continue;

                    const sig       = getPromptSignature    (fallback);
                    const criteria  = getPromptCriteria     (fallback);

                    if (isUnused(fallback, sig, criteria)) {
                        recordUsed(sig, criteria);
                        return fallback;
                    }
                }

                return builders[0]();
            };

            const buildDailyPrompts = () => {
                const types = dow === 0 ? (() => {
                    const arr = ["PERSON", "PERSON", "PERSON", "WORK", "WORK", "WORK"];

                    for (let i = arr.length - 1; i > 0; i--) {
                        const j = Math.floor(rng() * (i + 1));
                        [arr[i], arr[j]] = [arr[j], arr[i]];
                    }

                    return arr;
                })() : cfg.types;

                const prompts           = [];
                const usedSignatures    = new Set();
                const usedCriteria      = new Set();
                let lastBucketIdx       = -1;
                const eras              = gameData.themedOptions.ERA        || [];
                const franchises        = gameData.themedOptions.FRANCHISE  || [];
                const genres            = gameData.themedOptions.GENRE      || [];
                const studios           = gameData.themedOptions.STUDIO     || [];
                const sources           = gameData.themedOptions.SOURCE     || [];
                const tags              = gameData.themedOptions.TAG        || [];
                const letters           = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
                const pick              = (arr) => arr[Math.floor(rng() * arr.length)];

                const buildLexicalBuilders = (kind) => [
                    () => ({kind, rule: "LEX", lexRule: "ONE_WORD"}),
                    () => ({kind, rule: "LEX", lexRule: "TWO_WORDS"}),
                    () => ({kind, rule: "LEX", lexRule: "THREE_PLUS_WORDS"}),
                    () => ({kind, rule: "LEX", lexRule: "FIVE_PLUS_WORDS"}),
                    () => ({kind, rule: "LEX", lexRule: "ALLITERATION"}),
                    () => ({kind, rule: "LEX", lexRule: "DOUBLE_LETTER"}),
                    () => ({kind, rule: "LEX", lexRule: "STARTS_WITH",  lexVal: pick(letters)}),
                    () => ({kind, rule: "LEX", lexRule: "ENDS_WITH",    lexVal: pick(letters)}),
                    () => ({kind, rule: "LEX_STARTS_ENDS",              lexVal: pick(letters), lexVal2: pick(letters)}),
                    () => ({kind, rule: "LEX", lexRule: "HAS_LETTER",   lexVal: pick(letters)}),
                    () => ({kind, rule: "LEX", lexRule: "HAS_NUMBER"}),
                    () => ({kind, rule: "LEX", lexRule: "HAS_PUNCTUATION"})
                ];

                for (let i = 0; i < cfg.qCount; i++) {
                    const kind = types[i];

                    if (kind === "PERSON") {
                        const singleBuilders = [
                            genres      .length     ? () => {const g    = pick(genres);     return {kind: "PERSON", rule: "GENRE",      value: g.title}}                        : null,
                            eras        .length     ? () => {const e    = pick(eras);       return {kind: "PERSON", rule: "ERA",        value: e.title, idxs: new Set(e.idxs)}} : null,
                            studios     .length     ? () => {const s    = pick(studios);    return {kind: "PERSON", rule: "STUDIO",     value: s.title, idxs: new Set(s.idxs)}} : null,
                            sources     .length     ? () => {const src  = pick(sources);    return {kind: "PERSON", rule: "SOURCE",     value: src.title}}                      : null,
                            franchises  .length     ? () => {const f    = pick(franchises); return {kind: "PERSON", rule: "FRANCHISE",  value: f.title, idxs: new Set(f.idxs)}} : null
                        ].filter(Boolean);

                        const intersectionBuilders = [
                            (genres     .length && eras         .length)    ? () => {const g    = pick(genres),     e   = pick(eras);       return {kind: "PERSON", rule: "INT_GENRE_ERA",          genre       : g.title,      era         : e.title,                  idxs    : new Set(e.idxs)}}                         : null,
                            (genres     .length && studios      .length)    ? () => {const g    = pick(genres),     s   = pick(studios);    return {kind: "PERSON", rule: "INT_GENRE_STUDIO",       genre       : g.title,      studio      : s.title,                  idxs    : new Set(s.idxs)}}                         : null,
                            (genres     .length && sources      .length)    ? () => {const g    = pick(genres),     src = pick(sources);    return {kind: "PERSON", rule: "INT_GENRE_SOURCE",       genre       : g.title,      source      : src.title}}                                                                   : null,
                            (genres     .length && franchises   .length)    ? () => {const g    = pick(genres),     f   = pick(franchises); return {kind: "PERSON", rule: "INT_GENRE_FRANCHISE",    genre       : g.title,      franchise   : f.title,                  idxs    : new Set(f.idxs)}}                         : null,
                            (eras       .length && studios      .length)    ? () => {const e    = pick(eras),       s   = pick(studios);    return {kind: "PERSON", rule: "INT_ERA_STUDIO",         era         : e.title,      studio      : s.title,                  idxsA   : new Set(e.idxs), idxsB: new Set(s.idxs)}} : null,
                            (eras       .length && sources      .length)    ? () => {const e    = pick(eras),       src = pick(sources);    return {kind: "PERSON", rule: "INT_SOURCE_ERA",         source      : src.title,    era         : e.title,                  idxs    : new Set(e.idxs)}}                         : null,
                            (eras       .length && franchises   .length)    ? () => {const e    = pick(eras),       f   = pick(franchises); return {kind: "PERSON", rule: "INT_ERA_FRANCHISE",      era         : e.title,      franchise   : f.title,                  idxsA   : new Set(e.idxs), idxsB: new Set(f.idxs)}} : null,
                            (studios    .length && sources      .length)    ? () => {const s    = pick(studios),    src = pick(sources);    return {kind: "PERSON", rule: "INT_SOURCE_STUDIO",      source      : src.title,    studio      : s.title,                  idxs    : new Set(s.idxs)}}                         : null,
                            (studios    .length && franchises   .length)    ? () => {const s    = pick(studios),    f   = pick(franchises); return {kind: "PERSON", rule: "INT_STUDIO_FRANCHISE",   studio      : s.title,      franchise   : f.title,                  idxsA   : new Set(s.idxs), idxsB: new Set(f.idxs)}} : null,
                            (sources    .length && franchises   .length)    ? () => {const src  = pick(sources),    f   = pick(franchises); return {kind: "PERSON", rule: "INT_SOURCE_FRANCHISE",   source      : src.title,    franchise   : f.title,                  idxs    : new Set(f.idxs)}}                         : null,
                            genres      .length                             ? () => {const g    = pick(genres),     l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_GENRE",          genre       : g.title,      lexRule     : "STARTS_WITH", lexVal: l}}                                                    : null,
                            eras        .length                             ? () => {const e    = pick(eras),       l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_ERA",            era         : e.title,      lexRule     : "STARTS_WITH", lexVal: l, idxs    : new Set(e.idxs)}}                         : null,
                            studios     .length                             ? () => {const s    = pick(studios),    l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_STUDIO",         studio      : s.title,      lexRule     : "STARTS_WITH", lexVal: l, idxs    : new Set(s.idxs)}}                         : null,
                            sources     .length                             ? () => {const src  = pick(sources),    l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_SOURCE",         source      : src.title,    lexRule     : "STARTS_WITH", lexVal: l}}                                                    : null,
                            franchises  .length                             ? () => {const f    = pick(franchises), l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_FRANCHISE",      franchise   : f.title,      lexRule     : "STARTS_WITH", lexVal: l, idxs    : new Set(f.idxs)}}                         : null
                        ].filter(Boolean);

                        const lexicalBuilders   = buildLexicalBuilders(kind);
                        const buckets           = [singleBuilders, intersectionBuilders, lexicalBuilders].filter(b => b.length);

                        if (buckets.length) {
                            const eligibleIndices   = buckets.map((_, idx) => idx).filter(idx => buckets.length === 1 || idx !== lastBucketIdx);
                            const chosenBucketIdx   = pick(eligibleIndices);
                            lastBucketIdx           = chosenBucketIdx;

                            prompts.push(pickValidPrompt(buckets[chosenBucketIdx], usedSignatures, usedCriteria));
                        }
                    } else {
                        const singleBuilders = [
                            genres  .length ? () => {const g    = pick(genres);     return {kind: "WORK", rule: "GENRE",  value: g.title}}                          : null,
                            eras    .length ? () => {const e    = pick(eras);       return {kind: "WORK", rule: "ERA",    value: e.title, idxs: new Set(e.idxs)}}   : null,
                            studios .length ? () => {const s    = pick(studios);    return {kind: "WORK", rule: "STUDIO", value: s.title, idxs: new Set(s.idxs)}}   : null,
                            sources .length ? () => {const src  = pick(sources);    return {kind: "WORK", rule: "SOURCE", value: src.title}}                        : null,
                            tags    .length ? () => {const t    = pick(tags);       return {kind: "WORK", rule: "TAG",    value: t.title, idxs: new Set(t.idxs)}}   : null
                        ].filter(Boolean);

                        const intersectionBuilders = [
                            (genres     .length && eras     .length)    ? () => {const g    = pick(genres),     e   = pick(eras);       return {kind: "WORK", rule: "INT_GENRE_ERA",        genre   : g.title,      era     : e.title,                  idxs    : new Set(e.idxs)}}                         : null,
                            (genres     .length && studios  .length)    ? () => {const g    = pick(genres),     s   = pick(studios);    return {kind: "WORK", rule: "INT_GENRE_STUDIO",     genre   : g.title,      studio  : s.title,                  idxs    : new Set(s.idxs)}}                         : null,
                            (genres     .length && sources  .length)    ? () => {const g    = pick(genres),     src = pick(sources);    return {kind: "WORK", rule: "INT_GENRE_SOURCE",     genre   : g.title,      source  : src.title}}                                                                   : null,
                            (genres     .length && tags     .length)    ? () => {const g    = pick(genres),     t   = pick(tags);       return {kind: "WORK", rule: "INT_GENRE_TAG",        genre   : g.title,      tag     : t.title,                  idxs    : new Set(t.idxs)}}                         : null,
                            (eras       .length && studios  .length)    ? () => {const e    = pick(eras),       s   = pick(studios);    return {kind: "WORK", rule: "INT_ERA_STUDIO",       era     : e.title,      studio  : s.title,                  idxsA   : new Set(e.idxs), idxsB: new Set(s.idxs)}} : null,
                            (eras       .length && sources  .length)    ? () => {const e    = pick(eras),       src = pick(sources);    return {kind: "WORK", rule: "INT_SOURCE_ERA",       source  : src.title,    era     : e.title,                  idxs    : new Set(e.idxs)}}                         : null,
                            (eras       .length && tags     .length)    ? () => {const e    = pick(eras),       t   = pick(tags);       return {kind: "WORK", rule: "INT_ERA_TAG",          era     : e.title,      tag     : t.title,                  idxsA   : new Set(e.idxs), idxsB: new Set(t.idxs)}} : null,
                            (studios    .length && sources  .length)    ? () => {const s    = pick(studios),    src = pick(sources);    return {kind: "WORK", rule: "INT_SOURCE_STUDIO",    source  : src.title,    studio  : s.title,                  idxs    : new Set(s.idxs)}}                         : null,
                            (studios    .length && tags     .length)    ? () => {const s    = pick(studios),    t   = pick(tags);       return {kind: "WORK", rule: "INT_STUDIO_TAG",       studio  : s.title,      tag     : t.title,                  idxsA   : new Set(s.idxs), idxsB: new Set(t.idxs)}} : null,
                            (sources    .length && tags     .length)    ? () => {const src  = pick(sources),    t   = pick(tags);       return {kind: "WORK", rule: "INT_SOURCE_TAG",       source  : src.title,    tag     : t.title,                  idxs    : new Set(t.idxs)}}                         : null,
                            genres      .length                         ? () => {const g    = pick(genres),     l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_GENRE",        genre   : g.title,      lexRule : "STARTS_WITH", lexVal: l}}                                                    : null,
                            eras        .length                         ? () => {const e    = pick(eras),       l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_ERA",          era     : e.title,      lexRule : "STARTS_WITH", lexVal: l, idxs    : new Set(e.idxs)}}                         : null,
                            studios     .length                         ? () => {const s    = pick(studios),    l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_STUDIO",       studio  : s.title,      lexRule : "STARTS_WITH", lexVal: l, idxs    : new Set(s.idxs)}}                         : null,
                            sources     .length                         ? () => {const src  = pick(sources),    l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_SOURCE",       source  : src.title,    lexRule : "STARTS_WITH", lexVal: l}}                                                    : null,
                            tags        .length                         ? () => {const t    = pick(tags),       l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_TAG",          tag     : t.title,      lexRule : "STARTS_WITH", lexVal: l, idxs    : new Set(t.idxs)}}                         : null
                        ].filter(Boolean);

                        const lexicalBuilders   = buildLexicalBuilders(kind);
                        const buckets           = [singleBuilders, intersectionBuilders, lexicalBuilders].filter(b => b.length);

                        if (buckets.length) {
                            const eligibleIndices   = buckets.map((_, idx) => idx).filter(idx => buckets.length === 1 || idx !== lastBucketIdx);
                            const chosenBucketIdx   = pick(eligibleIndices);
                            lastBucketIdx           = chosenBucketIdx;

                            prompts.push(pickValidPrompt(buckets[chosenBucketIdx], usedSignatures, usedCriteria));
                        }
                    }
                }

                return prompts;
            };

            const prompts = buildDailyPrompts();

            if (action === "TABI_START") {
                if (save.tabiDaily.completed) throw new Error("Today's Tabi has ended");
                save.tabiDaily.started = true;
            } else {
                const td = save.tabiDaily;
                if (!td.started)                    throw new Error("Start today's Tabi first");
                if (td.completed)                   throw new Error("Today's Tabi has ended");
                if (td.qIndex >= prompts.length)    throw new Error("No questions remaining");

                const prompt        = prompts[td.qIndex];
                const passed        = body.passed === true;
                const uniqueKey     = typeof body.uniqueKey === "string" ? body.uniqueKey   .trim() : "";
                const animeId       = typeof body.animeId   === "string" ? body.animeId     .trim() : "";
                let stationsMoved   = 0;
                let obscurityPct    = 0;

                if (!passed) {
                    if (prompt.kind === "PERSON") {
                        const char = gameData.charMap.get(uniqueKey);
                        if (!char) throw new Error("Character not found");

                        const charIdx = char.charIdx;
                        if (!checkPromptRule(prompt, char, charIdx)) throw new Error("Wrong character");

                        const rankRatio     = charIdx >= 0 ? (charIdx / Math.max(1, gameData.charList.length - 1)) : 0;
                        const curvedRatio   = Math.pow      (rankRatio, 0.5);
                        obscurityPct        = Math.round    (rankRatio * 100);
                        stationsMoved       = Math.max      (1, Math.min(cfg.maxStep, Math.ceil(curvedRatio * cfg.maxStep)));
                    } else {
                        const keysForAnime = gameData.animeToCharKeys.get(animeId);
                        if (!keysForAnime || keysForAnime.length === 0) throw new Error("Anime not found");

                        const repChar = gameData.charMap.get(keysForAnime[0]);
                        if (!repChar || !checkPromptRule(prompt, repChar, repChar.charIdx)) throw new Error("Wrong anime");

                        const animeIdx      = gameData.animeRankMap.get(animeId) ?? Math.max(0, gameData.animeRankMap.size - 1);
                        const rankRatio     = animeIdx / Math.max(1, gameData.animeRankMap.size - 1);
                        const curvedRatio   = Math.pow      (rankRatio, 0.5);
                        obscurityPct        = Math.round    (rankRatio * 100);
                        stationsMoved       = Math.max      (1, Math.min(cfg.maxStep, Math.ceil(curvedRatio * cfg.maxStep)));
                    }
                }

                if (dow === 0) {
                    const totalSteps    =   td.station + stationsMoved;
                    td.laps             +=  Math.floor(totalSteps / 30);
                    td.station          =   totalSteps % 30;
                } else td.station       =   Math.min(20, td.station + stationsMoved);

                td.answers.push({
                    qIndex      : td.qIndex,
                    kind        : prompt.kind,
                    uniqueKey   : prompt.kind === "PERSON"  ? uniqueKey : null,
                    animeId     : prompt.kind === "WORK"    ? animeId   : null,
                    stationsMoved, obscurityPct
                });

                td.qIndex += 1;

                if (td.qIndex >= cfg.qCount || (dow !== 0 && td.station === 20)) {
                    td.completed = true;

                    if (!td.dailyAwarded) {
                        td.dailyAwarded = true;
                        let earnedStars = 0;

                        if (dow === 0) {
                            const distFromTokyo = Math.min(td.station, 30 - td.station);
                            earnedStars         = (20 * Math.min(5, td.laps)) + Math.max(0, 20 - (5 * distFromTokyo));
                        } else earnedStars      = 6 * td.station;

                        td.dailyEarned  = earnedStars;
                        save.stars      += earnedStars;

                        if (earnedStars >= 120) {
                            if (!save.tabiWeekly.completedDates.includes(dailyBanners.jstDate)) save.tabiWeekly.completedDates.push(dailyBanners.jstDate);

                            if (save.tabiWeekly.completedDates.length >= 6 && !save.tabiWeekly.weeklyAwarded) {
                                save.tabiWeekly.weeklyAwarded = true;
                                save.stars += 120;
                            }
                        }
                    }
                }
            }

            const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
            if (conflictResponse) return conflictResponse;
            return new Response(JSON.stringify({save, dailyBanners: bannerPayload}), {headers: {...corsHeaders, "Content-Type": "application/json"}});
        }

        const lockedSet             = new Set(save.lockedCards || []);
        const playerAnilistAnimeSet = new Set(save.anilistAnimeIds.map(String));
        const rolledResults         = [];

        if (action === "LINK_ANILIST") {
            const rawAnilist = typeof body.anilistUsername === "string" ? body.anilistUsername.trim().slice(0, 32) : "";
            if (!rawAnilist) throw new Error("AniList username is required");

            const currentJstYear        = dailyBanners.jstDate.slice(0, 4);
            const historySet            = new Set(save.linkedAnilistHistory.map(s => s.toLowerCase()));
            const isSameCurrent         = save.anilistUsername && rawAnilist.toLowerCase() === save.anilistUsername.toLowerCase();
            const isPreviouslyLinked    = historySet.has(rawAnilist.toLowerCase());

            if (!isSameCurrent && !isPreviouslyLinked) {
                if (save.lastAnilistChangeJstYear === currentJstYear) throw new Error("You have already used your AniList account change this year (resets Jan 1 JST)");
                save.lastAnilistChangeJstYear = currentJstYear;
            }

            const {canonicalName, animeIds} = await fetchAnilistUserAnimeIds(rawAnilist);

            save.anilistUsername = canonicalName;
            save.anilistAnimeIds = animeIds;

            historySet.add(rawAnilist       .toLowerCase());
            historySet.add(canonicalName    .toLowerCase());

            save.linkedAnilistHistory = Array.from(historySet);
        } else if (action === "UNLINK_ANILIST") {
            save.anilistUsername = null;
            save.anilistAnimeIds = [];
            save.fiftyFifty.LIST = null;
        } else if (action === "SET_FIFTY_FIFTY") {
            const bannerType    = body.bannerType;
            const uniqueKey     = body.uniqueKey || null;
            const isThemed      = THEMED_KEYS.includes(bannerType);
            const validBanner   = bannerType === "STANDARD" || bannerType === "HOF" || bannerType === "LIST" || isThemed;

            if (!validBanner) throw new Error("Invalid banner type");

            if (!uniqueKey) {
                if (isThemed)   delete save.fiftyFifty.THEMED[bannerType];
                else            save.fiftyFifty[bannerType] = null;
            } else {
                const char = gameData.charMap.get(uniqueKey);

                if (!char)                                                                  throw new Error("Invalid character");
                if (!FIFTY_FIFTY_TIERS.has(char.tier))                                      throw new Error("Only S, SR, or SSR characters can be selected for 50/50");
                if ((save.inventory[uniqueKey] || 0) >= 6)                                  throw new Error("Character is already maxed out");

                if (isThemed) {
                    const availableCategories = save.anilistUsername
                        ? dailyBanners.activeCategories.slice(0, 1)
                        : dailyBanners.activeCategories;

                    if (!availableCategories.includes(bannerType))                          throw new Error("Banner not active today");
                    if (!dailyBanners.activeEntries[bannerType].keys.includes(uniqueKey))   throw new Error("Character not in banner");

                    save.fiftyFifty.THEMED[bannerType] = {
                        date        : dailyBanners.jstDate,
                        uniqueKey   : uniqueKey
                    };
                } else if (bannerType === "LIST") {
                    if (!save.anilistUsername)                                              throw new Error("AniList account not linked");
                    if (!char.animeId || !playerAnilistAnimeSet.has(char.animeId))          throw new Error("Character not in AniList");

                    save.fiftyFifty.LIST            = uniqueKey;
                } else save.fiftyFifty[bannerType]  = uniqueKey;
            }
        } else if (action === "SUMMON") {
            const bannerType    = body.bannerType || "STANDARD";
            const isThemed      = THEMED_KEYS.includes(bannerType);
            const isListBanner  = bannerType === "LIST";

            if (isThemed) {
                const availableCategories = save.anilistUsername ? dailyBanners.activeCategories.slice(0, 1) : dailyBanners.activeCategories;
                if (!availableCategories.includes(bannerType)) throw new Error("That themed banner is not active today");
            }

            if (isListBanner && !save.anilistUsername) throw new Error("Link your AniList account first");

            const isFreeStandard    = bannerType === "STANDARD" && save.lastFreeSummonDate !== dailyBanners.jstDate;
            const cost              = isFreeStandard ? 0 : (COSTS[bannerType] ?? 80);

            if (save.stars < cost) throw new Error("Not enough stars");

            save.stars -= cost;
            if (isFreeStandard) save.lastFreeSummonDate = dailyBanners.jstDate;

            const isHOF             = bannerType === "HOF";
            const customRarities    = isHOF ? HOF_RARITIES : RARITIES;
            let categoryTierMap     = null;

            if (isThemed) categoryTierMap = buildTierMapFromKeys(dailyBanners.activeEntries[bannerType].keys, gameData);
            else if (isListBanner) {
                const listKeys = getKeysForAnimeIds(save.anilistAnimeIds, gameData);
                if (listKeys.length === 0) throw new Error("No characters in the database matched your AniList");
                categoryTierMap = buildTierMapFromKeys(listKeys, gameData);
            }

            let activeFiftyKey = null;

            if (isThemed) {
                const themedSelection = save.fiftyFifty.THEMED?.[bannerType];
                if (themedSelection?.date === dailyBanners.jstDate) activeFiftyKey = themedSelection.uniqueKey;
            } else                                                  activeFiftyKey = save.fiftyFifty[bannerType] || null;

            let activeFiftyChar = activeFiftyKey ? gameData.charMap.get(activeFiftyKey) : null;

            if (activeFiftyChar && (!FIFTY_FIFTY_TIERS.has(activeFiftyChar.tier) || (save.inventory[activeFiftyKey] || 0) >= 6)) {
                activeFiftyChar = null;

                if (isThemed)   delete save.fiftyFifty.THEMED[bannerType];
                else            save.fiftyFifty[bannerType] = null;
            }

            for (let i = 0; i < 10; i++) {
                const guaranteeTier     = i === 0 ? (isHOF ? "A" : "B") : null;
                const isCategorySlot    = Boolean(categoryTierMap && (isListBanner || i < 5));
                const tier              = selectRarityTier(guaranteeTier, customRarities);
                const pool              = isCategorySlot ? categoryTierMap[tier] : gameData.globalBuckets[tier];

                let chosenKey;

                if (activeFiftyChar && activeFiftyChar.tier === tier && (save.inventory[activeFiftyChar.uniqueKey] || 0) < 6 && Math.random() < 0.5)    chosenKey = activeFiftyChar.uniqueKey;
                else                                                                                                                                    chosenKey = pool[Math.floor(Math.random() * pool.length)];

                const prevCount             = save.inventory[chosenKey] || 0;
                const isMaxed               = prevCount >= 6;
                const autoSoldStars         = isMaxed ? rarityInfoMap.get(tier).sellValue : 0;
                const count                 = isMaxed ? prevCount : prevCount + 1;

                save.inventory[chosenKey] = count;

                if (activeFiftyChar && chosenKey === activeFiftyChar.uniqueKey && count >= 6) {
                    activeFiftyChar = null;

                    if (isThemed)   delete save.fiftyFifty.THEMED[bannerType];
                    else            save.fiftyFifty[bannerType] = null;
                }

                if (autoSoldStars > 0)          save.stars += autoSoldStars;
                if (AUTO_LOCK_TIERS.has(tier))  lockedSet.add(chosenKey);

                const sparkKey              = isThemed ? "THEMED" : bannerType;
                save.sparkPoints[sparkKey]  = (save.sparkPoints[sparkKey] || 0) + 1;

                if      (isThemed)      save.themedPulls[bannerType]    = (save.themedPulls[bannerType] || 0) + 1;
                else if (isListBanner)  save.listPulls                  = (save.listPulls               || 0) + 1;
                else if (isHOF)         save.hofPulls                   = (save.hofPulls                || 0) + 1;
                else                    save.totalPulls                 = (save.totalPulls              || 0) + 1;

                rolledResults.push({uniqueKey: chosenKey, occurrenceCount: count, autoSoldStars});
            }
        } else if (action === "SELL") {
            const key   = body.uniqueKey;
            const count = save.inventory[key] || 0;
            const char  = gameData.charMap.get(key);

            if (!char || count <= 0 || lockedSet.has(key)) throw new Error("Cannot sell card");
            save.stars += rarityInfoMap.get(char.tier).sellValue * getSellMultiplier(count);
            delete save.inventory[key];
            for (const [slotId, assignedKey] of Object.entries(save.deck)) {if (assignedKey === key) delete save.deck[slotId]}
        } else if (action === "SELL_ALL") {
            for (const [key, count] of Object.entries(save.inventory)) {
                if (count > 0 && !lockedSet.has(key)) {
                    const char = gameData.charMap.get(key);

                    if (char) {
                        save.stars += rarityInfoMap.get(char.tier).sellValue * getSellMultiplier(count);
                        delete save.inventory[key];
                        for (const [slotId, assignedKey] of Object.entries(save.deck)) {
                            if (assignedKey === key) delete save.deck[slotId];
                        }
                    }
                }
            }
        } else if (action === "SAVE_DECK") {
            const VALID_SUITS   = new Set(["Spades", "Hearts", "Diamonds", "Clubs"]);
            const VALID_RANKS   = new Set(["R", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]);
            const incoming      = body.deck;

            if (!incoming || typeof incoming !== "object" || Array.isArray(incoming))   throw new Error("Invalid deck payload");

            const nextDeck  = {};
            const usedChars = new Set();

            for (const [slotId, uniqueKey] of Object.entries(incoming)) {
                if (!uniqueKey) continue;
                const [suit, rank] = String(slotId).split(":");

                if (!VALID_SUITS.has(suit) || !VALID_RANKS.has(rank))                   throw new Error(`Invalid deck slot: ${slotId}`);
                if (typeof uniqueKey !== "string")                                      throw new Error("Invalid character key");
                if (usedChars.has(uniqueKey))                                           throw new Error("Duplicate character in deck");
                if (!(save.inventory[uniqueKey] > 0))                                   throw new Error("You must own every character in your deck");

                const char = gameData.charMap.get(uniqueKey);

                if (!char)                                                              throw new Error("Character not found");
                if (char.deckSuit !== suit || char.deckRank !== rank)                   throw new Error(`${uniqueKey} does not match ${rank} of ${suit}`);

                usedChars.add(uniqueKey);
                nextDeck[slotId] = uniqueKey;
            }

            save.deck = nextDeck;
        } else if (action === "SPARK") {
            const {bannerType, uniqueKey}   = body;
            const isThemed                  = THEMED_KEYS.includes(bannerType);

            if (isThemed) {
                const availableCategories = save.anilistUsername ? dailyBanners.activeCategories.slice(0, 1) : dailyBanners.activeCategories;

                if (!availableCategories                            .includes(bannerType))  throw new Error("Banner not active today");
                if (!dailyBanners.activeEntries[bannerType].keys    .includes(uniqueKey))   throw new Error("Character not in banner");
            } else if (bannerType === "LIST") {
                if (!save.anilistUsername) throw new Error("AniList account not linked");

                const char = gameData.charMap.get(uniqueKey);
                if (!char?.animeId || !playerAnilistAnimeSet.has(char.animeId)) throw new Error("Character not in AniList");
            }

            const char      = gameData.charMap.get(uniqueKey);
            const cost      = char ? rarityInfoMap.get(char.tier).sparkCost : Infinity;
            const sparkKey  = isThemed ? "THEMED" : bannerType;

            if (!char)                                      throw new Error("Invalid character");
            if ((save.inventory[uniqueKey]  || 0) >= 6)     throw new Error("Character is already maxed out");
            if ((save.sparkPoints[sparkKey] || 0) < cost)   throw new Error("Not enough spark points");

            save.sparkPoints[sparkKey]  -=  cost;
            save.inventory[uniqueKey]   =   (save.inventory[uniqueKey] || 0) + 1;

            lockedSet.add(uniqueKey);
        } else if (action === "TOGGLE_LOCK") {
            const key = body.uniqueKey;

            if (save.inventory[key]) {
                if (lockedSet.has(key)) lockedSet.delete    (key);
                else                    lockedSet.add       (key);
            }
        } else if (action === "CLAIM_DAILY_STARS") {
            if (save.lastDailyStarsDate === dailyBanners.jstDate) throw new Error("Daily stars already claimed today");

            save.stars              +=  120;
            save.lastDailyStarsDate =   dailyBanners.jstDate;
        } else if (action === "SET_PROFILE") {
            const currentJstYear    = dailyBanners.jstDate.slice(0, 4);
            const discordName       = typeof body.discordName === "string" ? body.discordName.trim().slice(0, 24) : "";
            const rawName           = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 24) : "";
            const nextName          = rawName || discordName;

            if (nextName && nextName !== save.displayName) {
                const isDiscordVariant = discordName !== "" && nextName.toLowerCase() === discordName.toLowerCase();

                if (!isDiscordVariant) {
                    if (save.lastNameChangeJstYear === currentJstYear) throw new Error("You have already used your custom name change this year (resets Jan 1 JST)");
                    save.lastNameChangeJstYear = currentJstYear;
                }

                save.displayName = nextName;
            }

            if (typeof body.anilistUsername === "string" && body.anilistUsername.trim() !== "") {
                const rawAnilist = body.anilistUsername.trim().slice(0, 32);

                if (rawAnilist !== save.anilistUsername) {
                    const historySet            = new Set(save.linkedAnilistHistory.map(s => s.toLowerCase()));
                    const isSameCaseVariant     = save.anilistUsername && rawAnilist.toLowerCase() === save.anilistUsername.toLowerCase();
                    const isPreviouslyLinked    = historySet.has(rawAnilist.toLowerCase());

                    if (!isSameCaseVariant && !isPreviouslyLinked) {
                        if (save.lastAnilistChangeJstYear === currentJstYear) throw new Error("You have already used your AniList account change this year (resets Jan 1 JST)");
                        save.lastAnilistChangeJstYear = currentJstYear;
                    }

                    const {canonicalName, animeIds} = await fetchAnilistUserAnimeIds(rawAnilist);
                    save.anilistUsername            = canonicalName;
                    save.anilistAnimeIds            = animeIds;

                    historySet.add(rawAnilist       .toLowerCase());
                    historySet.add(canonicalName    .toLowerCase());

                    save.linkedAnilistHistory = Array.from(historySet);
                }
            }

            if (body.photo && body.photo.uniqueKey) {
                const key   = body.photo.uniqueKey;
                const char  = gameData.charMap.get(key);

                if (!char || !(save.inventory[key] > 0)) throw new Error("You must own this character to set them as your photo");
                const clamp = (n, min, max, fallback) => typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;

                save.profilePhoto = {
                    uniqueKey   : key,
                    tier        : char.tier,
                    x           : clamp(body.photo.x,       -100,   100,    0),
                    y           : clamp(body.photo.y,       -100,   100,    0),
                    zoom        : clamp(body.photo.zoom,    1,      3,      0),
                    rotate      : clamp(body.photo.rotate,  -180,   180,    0),
                };
            }
        }

        save.lockedCards = Array.from(lockedSet);

        const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
        if (conflictResponse) return conflictResponse;
        return new Response(JSON.stringify({save, rolledResults, dailyBanners: bannerPayload}), {headers: {...corsHeaders, "Content-Type": "application/json"}});
    } catch (err) {return new Response(JSON.stringify({error: err.message}), {
        status  : 400,
        headers : { ...corsHeaders, "Content-Type": "application/json"}
    })}
});