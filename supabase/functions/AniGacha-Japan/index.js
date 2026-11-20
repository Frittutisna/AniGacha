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
    HOF         : 120,
    LIST        : 140
};

const GUARANTEED_B_PLUS = new Set(["SSR", "SR", "S", "A", "B"]);
const GUARANTEED_A_PLUS = new Set(["SSR", "SR", "S", "A"]);
const AUTO_LOCK_TIERS   = new Set(["SSR", "SR", "S"]);
const FIFTY_FIFTY_TIERS = new Set(["SSR", "SR", "S"]);
const THEMED_KEYS       = ["ERA", "FRANCHISE", "GENRE", "SOURCE", "STUDIO", "TAG"];
const rarityInfoMap     = new Map(RARITIES.map(r => [r.tier, r]));

let cachedData      = null;
let dataLoadPromise = null;

function getGameData(adminClient) {
    if (cachedData)         return cachedData;
    if (dataLoadPromise)    return dataLoadPromise;

    dataLoadPromise = (async () => {
        const {data: blob, error} = await adminClient.storage.from("game-data").download("server-data.json");

        if (error || !blob) {
            dataLoadPromise = null;
            throw new Error("Failed to load server-data.json from storage");
        }

        const parsed            = JSON.parse(await blob.text());
        const charList          = parsed.chars;
        const charMap           = new Map();
        const animeToCharKeys   = new Map();
        const globalBuckets     = {};

        RARITIES.forEach(r => globalBuckets[r.tier] = []);

        for (const [uniqueKey, tier, animeId = null] of charList) {
            const normAnimeId = animeId ? String(animeId).trim() : null;

            charMap.set(uniqueKey, {uniqueKey, tier, animeId: normAnimeId});
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

        RARITIES.forEach(r => {if (globalBuckets[r.tier].length === 0) globalBuckets[r.tier].push(charList[0][0])});
        cachedData = {charList, charMap, animeToCharKeys, globalBuckets, themedOptions: parsed.themedOptions};
        return cachedData;
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

        for (let u = idx - 1; u >= 0; u--) {if (tierMap[RARITIES[u].tier].length > 0) {
            tierMap[r.tier] = tierMap[RARITIES[u].tier];
            return;
        }}

        tierMap[r.tier] = keys.length > 0 ? keys : gameData.globalBuckets[r.tier];
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

            const RATE_LIMITS = {
                INIT                    : 10,
                SUMMON                  : 100,
                SPARK                   : 100,
                SELL                    : 100,
                SELL_ALL                : 10,
                SET_PROFILE             : 10,
                LINK_ANILIST            : 10,
                UNLINK_ANILIST          : 10,
                SET_FIFTY_FIFTY         : 100,
                TOGGLE_LOCK             : 100,
                CLAIM_DAILY_STARS       : 10,
                QUIZ_COMPLETE           : 10,
                QUIZ_MISSION_PROGRESS   : 100,
                QUIZ_CLAIM_MISSION      : 100
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

            const {data: row, error} = await adminClient.from("player_saves").select("save_data").eq("user_id", targetUserId).maybeSingle();

            if (error || !row?.save_data) return new Response(JSON.stringify({error: "Shared collection not found"}), {
                status  : 404,
                headers : {...corsHeaders, "Content-Type": "application/json"},
            });

            const s = row.save_data;

            return new Response(JSON.stringify({profile: {
                    displayName:     s.displayName || "Player",
                    profilePhoto:    s.profilePhoto || null,
                    anilistUsername: s.anilistUsername || null,
                    anilistAnimeIds: Array.isArray(s.anilistAnimeIds) ? s.anilistAnimeIds : [],
                    inventory:       s.inventory || {},
                    lockedCards:     Array.isArray(s.lockedCards) ? s.lockedCards : [],
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

        const [gameData, { data: existing, error: loadError }] = await Promise.all([
            getGameData(adminClient),

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
        };

        if (!save.sparkPoints)                              save.sparkPoints        = {};
        if (typeof save.sparkPoints.THEMED  !== "number")   save.sparkPoints.THEMED = 0;

        for (const k of THEMED_KEYS) {
            if (typeof save.sparkPoints[k] === "number") {
                save.sparkPoints.THEMED += save.sparkPoints[k];
                delete save.sparkPoints[k];
            }
        }

        if (typeof save.sparkPoints.LIST    !== "number")               save.sparkPoints.LIST       = 0;
        if (typeof save.listPulls           !== "number")               save.listPulls              = 0;
        if (!Array.isArray(save.anilistAnimeIds))                       save.anilistAnimeIds        = [];
        if (!Array.isArray(save.linkedAnilistHistory))                  save.linkedAnilistHistory   = [];
        if (!save.fiftyFifty || typeof save.fiftyFifty !== "object")    save.fiftyFifty             = {STANDARD: null, HOF: null, LIST: null, THEMED: {}};

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

        if (action === "INIT") {
            const incomingDiscordName = typeof body.discordName === "string" ? body.discordName.trim().slice(0, 24) : "";
            if (!save.displayName && incomingDiscordName) save.displayName = incomingDiscordName;

            if (!existing || existing.save_data?.quizDaily?.date !== dailyBanners.jstDate || (!existing.save_data?.displayName && save.displayName)) {
                const conflictResponse = await persistPlayerSave(adminClient, userId, saveVersion, save);
                if (conflictResponse) return conflictResponse;
            }

            return new Response(JSON.stringify({save, dailyBanners: bannerPayload}), {headers: {...corsHeaders, "Content-Type": "application/json"}});
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
            const expiresAt     = new Date(Date.now() + 30 * 60 * 1000).toISOString();

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
                const isCategorySlot    = Boolean(categoryTierMap && i < 5);
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
        } else if (action === "SELL_ALL") {
            for (const [key, count] of Object.entries(save.inventory)) {
                if (count > 0 && !lockedSet.has(key)) {
                    const char = gameData.charMap.get(key);

                    if (char) {
                        save.stars += rarityInfoMap.get(char.tier).sellValue * getSellMultiplier(count);
                        delete save.inventory[key];
                    }
                }
            }
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