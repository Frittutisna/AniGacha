const LOOP_STATIONS = [
    "Tokyo",
    "Kanda",
    "Akihabara",
    "Okachimachi",
    "Ueno",
    "Uguisudani",
    "Nippori",
    "Nishi-Nippori",
    "Tabata",
    "Komagome",
    "Sugamo",
    "Otsuka",
    "Ikebukuro",
    "Mejiro",
    "Takadanobaba",
    "Shin-Okubo",
    "Shinjuku",
    "Yoyogi",
    "Harajuku",
    "Shibuya",
    "Ebisu",
    "Meguro",
    "Gotanda",
    "Osaki",
    "Shinagawa",
    "Takanawa Gateway",
    "Tamachi",
    "Hamamatsucho",
    "Shimbashi",
    "Yurakucho"
];

const WEST_STATIONS = [
    "Tokyo",
    "Shinagawa",
    "Yokohama",
    "Odawara",
    "Atami",
    "Shizuoka",
    "Hamamatsu",
    "Toyohashi",
    "Nagoya",
    "Maibara",
    "Kyoto",
    "Shin-Osaka",
    "Okayama",
    "Hiroshima",
    "Kokura",
    "Hakata",
    "Kumamoto",
    "Kagoshima-Chuo",
    "Ibusuki",
    "Yamakawa",
    "Nishi-Oyama"
];

const NORTH_STATIONS = [
    "Tokyo",
    "Ueno",
    "Omiya",
    "Utsunomiya",
    "Koriyama",
    "Fukushima",
    "Sendai",
    "Ichinoseki",
    "Morioka",
    "Hachinohe",
    "Shin-Aomori",
    "Shin-Hakodate-Hokuto",
    "Oshamambe",
    "Otaru",
    "Sapporo",
    "Iwamizawa",
    "Takikawa",
    "Asahikawa",
    "Nayoro",
    "Horonobe",
    "Wakkanai"
];

const SCHEDULE = {
    1: {route: "West",  stations: WEST_STATIONS,    qCount: 7, maxStep: 5},
    2: {route: "North", stations: NORTH_STATIONS,   qCount: 7, maxStep: 5},
    3: {route: "West",  stations: WEST_STATIONS,    qCount: 6, maxStep: 5},
    4: {route: "North", stations: NORTH_STATIONS,   qCount: 6, maxStep: 5},
    5: {route: "West",  stations: WEST_STATIONS,    qCount: 5, maxStep: 5},
    6: {route: "North", stations: NORTH_STATIONS,   qCount: 5, maxStep: 5},
    0: {route: "Loop",  stations: LOOP_STATIONS,    qCount: 6, maxStep: 30}
};

const TIME_LIMIT            = 20;
let tabiState               = null;
let tabiWeeklyState         = null;
let tabiAnimeCatalog        = [];
let tabiPromptsCache        = {date: null, prompts: []};
let tabiBusy                = false;
let tabiTimerRaf            = null;
let tabiActiveQuestionKey   = null;
let tabiPendingTargetPage   = null;

function tabiHashSeed(str) {
    let h = 1779033703 ^ str.length;

    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }

    return (h >>> 0);
}

function tabiMulberry32(seed) {return function () {
    let t = (seed += 0x6D2B79F5);

    t =         Math.imul(t ^ (t >>> 15),   t | 1);
    t ^= t +    Math.imul(t ^ (t >>> 7),    t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}}

function tabiGetJstDow(jstDateStr) {
    const [y, m, d] = jstDateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function tabiWithArticle(word) {
    const trimmed = String(word || "").trim();
    const article = /^[aeiou]/i.test(trimmed) ? "an" : "a";

    return `${article} ${trimmed}`;
}

let tabiAnimeMap    = new Map();
let tabiWarmPromise = null;

function tabiBuildAnimeCatalog() {
    if (tabiAnimeCatalog.length > 0 || !characterPool.length) return;
    const byAnime = new Map();

    for (let i = 0; i < characterPool.length; i++) {
        const c = characterPool[i];
        if (!c.animeId) continue;

        let entry = byAnime.get(c.animeId);

        if (!entry) {
            entry = {
                animeId         : c.animeId,
                romaji          : c.animeRomaji     || c.animeEnglish   || `Anime #${c.animeId}`,
                english         : c.animeEnglish    || c.animeRomaji    || `Anime #${c.animeId}`,
                animeYear       : c.animeYear       ?? null,
                genres          : c.genres  instanceof Set ? c.genres   : new Set(c.genres  || []),
                studios         : c.studios instanceof Set ? c.studios  : new Set(c.studios || []),
                source          : c.source,
                animeCount      : Number(c.animeCount) || 0,
                animeRankIdx    : 0,
                charKeys        : new Set([c.uniqueKey])
            };

            byAnime.set(c.animeId, entry);
        } else entry.charKeys.add(c.uniqueKey);
    }

    tabiAnimeCatalog    = Array.from(byAnime.values()).sort((a, b) => (b.animeCount - a.animeCount) || a.animeId.localeCompare(b.animeId));
    tabiAnimeMap        = new Map();

    for (let idx = 0; idx < tabiAnimeCatalog.length; idx++) {
        const entry         = tabiAnimeCatalog[idx];
        entry.animeRankIdx  = idx;

        tabiAnimeMap.set(entry.animeId, entry);
    }
}

function tabiKeysToAnimeSet(keys, cacheProp, p) {
    if (!keys)          return null;
    if (p[cacheProp])   return p[cacheProp];

    const ids = new Set();

    for (const k of keys) {
        const animeId = characterMap.get(k)?.animeId;
        if (animeId) ids.add(animeId);
    }

    p[cacheProp] = ids;
    return ids;
}

function tabiCountWords(str) {return String(str || "").trim().split(/\s+/).filter(Boolean).length}

function tabiFirstAlpha(str) {
    const m = String(str || "").trim().match(/[A-Za-z]/);
    return m ? m[0].toUpperCase() : null;
}

function tabiLastAlpha(str) {
    const m = String(str || "").trim().match(/[A-Za-z](?=[^A-Za-z]*$)/);
    return m ? m[0].toUpperCase() : null;
}

function tabiCheckLexicalRule(rawStrings, lexRule, lexVal) {
    const strings = (rawStrings || []).filter(Boolean).map(s => String(s).trim());
    if (!strings.length) return false;

    return strings.some(str => {
        const words = str.split(/\s+/).filter(Boolean);

        if (lexRule === "ONE_WORD")         return words.length === 1;
        if (lexRule === "TWO_WORDS")        return words.length === 2;
        if (lexRule === "THREE_PLUS_WORDS") return words.length >=  3;
        if (lexRule === "FIVE_PLUS_WORDS")  return words.length >=  5;
        if (lexRule === "ALLITERATION")     return words.length >=  2 && tabiFirstAlpha(words[0]) !== null && tabiFirstAlpha(words[0]) === tabiFirstAlpha(words[words.length - 1]);
        if (lexRule === "DOUBLE_LETTER")    return /([A-Za-z])\1/i          .test(str);
        if (lexRule === "STARTS_WITH")      return tabiFirstAlpha   (str) === lexVal;
        if (lexRule === "ENDS_WITH")        return tabiLastAlpha    (str) === lexVal;
        if (lexRule === "HAS_LETTER")       return new RegExp(lexVal, "i")  .test(str);
        if (lexRule === "HAS_NUMBER")       return /\d/                     .test(str);
        if (lexRule === "HAS_PUNCTUATION")  return /[^\p{L}\p{N}\s]/u       .test(str);

        return false;
    });
}

function tabiCheckPromptCandidate(p, id) {
    if (p.kind === "PERSON") {
        const c = characterMap.get(id);
        if (!c) return false;

        if (p.rule === "GENRE")                                                                 return tabiHasGenre(c.genres, p.value);
        if (p.rule === "SOURCE")                                                                return c.source === p.value;
        if (["ERA", "STUDIO", "FRANCHISE"]                                  .includes(p.rule))  return Boolean(p.keys?.has(id));
        if (["INT_GENRE_ERA", "INT_GENRE_STUDIO", "INT_GENRE_FRANCHISE"]    .includes(p.rule))  return tabiHasGenre(c.genres, p.genre) && Boolean(p.keys?.has(id));
        if (p.rule === "INT_GENRE_SOURCE")                                                      return tabiHasGenre(c.genres, p.genre) && c.source === p.source;
        if (["INT_SOURCE_ERA", "INT_SOURCE_STUDIO", "INT_SOURCE_FRANCHISE"] .includes(p.rule))  return c.source === p.source && Boolean(p.keys?.has(id));
        if (["INT_ERA_STUDIO", "INT_ERA_FRANCHISE", "INT_STUDIO_FRANCHISE"] .includes(p.rule))  return Boolean(p.keysA?.has(id)) && Boolean(p.keysB?.has(id));
        if (p.rule === "INT_LEX_GENRE")                                                         return tabiHasGenre(c.genres, p.genre) && tabiCheckLexicalRule([c.name], p.lexRule, p.lexVal);
        if (p.rule === "INT_LEX_SOURCE")                                                        return c.source === p.source && tabiCheckLexicalRule([c.name], p.lexRule, p.lexVal);
        if (["INT_LEX_ERA", "INT_LEX_STUDIO", "INT_LEX_FRANCHISE"]          .includes(p.rule))  return Boolean(p.keys?.has(id)) && tabiCheckLexicalRule([c.name], p.lexRule, p.lexVal);
        if (p.rule === "LEX")                                                                   return tabiCheckLexicalRule([c.name], p.lexRule, p.lexVal);
        if (p.rule === "LEX_STARTS_ENDS")                                                       return [c.name].filter(Boolean).some(str => tabiFirstAlpha(str) === p.lexVal && tabiLastAlpha(str) === p.lexVal2);

        return true;
    } else {
        const a = tabiAnimeMap.get(id);
        if (!a) return false;

        const hasAnime  = () => Boolean(tabiKeysToAnimeSet(p.keys,  "_animeIds",    p)?.has(id));
        const hasAnimeA = () => Boolean(tabiKeysToAnimeSet(p.keysA, "_animeIdsA",   p)?.has(id));
        const hasAnimeB = () => Boolean(tabiKeysToAnimeSet(p.keysB, "_animeIdsB",   p)?.has(id));

        if (p.rule === "GENRE")                                                             return tabiHasGenre(a.genres, p.value);
        if (p.rule === "SOURCE")                                                            return a.source === p.value;
        if (["ERA", "STUDIO", "TAG"]                                    .includes(p.rule))  return hasAnime();
        if (["INT_GENRE_ERA", "INT_GENRE_STUDIO", "INT_GENRE_TAG"]      .includes(p.rule))  return tabiHasGenre(a.genres, p.genre) && hasAnime();
        if (p.rule === "INT_GENRE_SOURCE")                                                  return tabiHasGenre(a.genres, p.genre) && a.source === p.source;
        if (["INT_SOURCE_ERA", "INT_SOURCE_STUDIO", "INT_SOURCE_TAG"]   .includes(p.rule))  return a.source === p.source && hasAnime();
        if (["INT_ERA_STUDIO", "INT_ERA_TAG", "INT_STUDIO_TAG"]         .includes(p.rule))  return hasAnimeA() && hasAnimeB();
        if (p.rule === "INT_LEX_GENRE")                                                     return tabiHasGenre(a.genres, p.genre) && tabiCheckLexicalRule([a.romaji, a.english], p.lexRule, p.lexVal);
        if (p.rule === "INT_LEX_SOURCE")                                                    return a.source === p.source && tabiCheckLexicalRule([a.romaji, a.english], p.lexRule, p.lexVal);
        if (["INT_LEX_ERA", "INT_LEX_STUDIO", "INT_LEX_TAG"]            .includes(p.rule))  return hasAnime() && tabiCheckLexicalRule([a.romaji, a.english], p.lexRule, p.lexVal);
        if (p.rule === "LEX")                                                               return tabiCheckLexicalRule([a.romaji, a.english], p.lexRule, p.lexVal);
        if (p.rule === "LEX_STARTS_ENDS")                                                   return [a.romaji, a.english].filter(Boolean).some(str => tabiFirstAlpha(str) === p.lexVal && tabiLastAlpha(str) === p.lexVal2);

        return true;
    }
}

function tabiGetPromptSignature(p) {return [p.kind, p.rule, p.value, p.genre, p.era, p.studio, p.source, p.franchise, p.tag, p.lexRule, p.lexVal, p.lexVal2].filter(Boolean).join("|")}

function tabiGetPromptCriteria(p) {
    const criteria = [];

    if (["GENRE", "ERA", "STUDIO", "SOURCE", "FRANCHISE", "TAG"].includes(p.rule) && p.value)   criteria.push(`${p.rule}:${p.value}`);
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
}

function tabiHasEnoughMatches(prompt, minMatches = 25) {
    let count = 0;

    if (prompt.kind === "PERSON") {
        for (let i = 0; i < characterPool.length; i++) {
            if (tabiCheckPromptCandidate(prompt, characterPool[i].uniqueKey) && ++count >= minMatches) return true;
        }
    } else {
        for (let i = 0; i < tabiAnimeCatalog.length; i++) {
            if (tabiCheckPromptCandidate(prompt, tabiAnimeCatalog[i].animeId) && ++count >= minMatches) return true;
        }
    }

    return false;
}

function tabiPickValidPrompt(rng, builders, usedSignatures, usedCriteria) {
    const isUnused = (_, sig, criteria) => !usedSignatures.has(sig) && !criteria.some(c => usedCriteria.has(c));

    const recordUsed = (sig, criteria) => {
        usedSignatures.add(sig);
        for (const c of criteria) usedCriteria.add(c);
    };

    for (let attempt = 0; attempt < 50; attempt++) {
        const fn        = builders[Math.floor(rng() * builders.length)];
        const candidate = fn();

        if (!candidate) continue;

        const sig       = tabiGetPromptSignature    (candidate);
        const criteria  = tabiGetPromptCriteria     (candidate);

        if (!isUnused(candidate, sig, criteria)) continue;

        if (tabiHasEnoughMatches(candidate, 25)) {
            recordUsed(sig, criteria);
            return candidate;
        }
    }

    for (const fn of builders) {
        const fallback = fn();
        if (!fallback) continue;

        const sig       = tabiGetPromptSignature    (fallback);
        const criteria  = tabiGetPromptCriteria     (fallback);

        if (isUnused(fallback, sig, criteria)) {
            recordUsed(sig, criteria);
            return fallback;
        }
    }

    return builders[0]();
}

function tabiGetDailyPrompts(jstDate) {
    if (tabiPromptsCache.date === jstDate && tabiPromptsCache.prompts.length > 0) return tabiPromptsCache.prompts;

    const dow = tabiGetJstDow(jstDate);
    const cfg = SCHEDULE[dow];
    const rng = tabiMulberry32(tabiHashSeed(`anigacha-tabi-${jstDate}`));

    const types = dow === 0 ? (() => {
        const arr = ["PERSON", "PERSON", "PERSON", "WORK", "WORK", "WORK"];

        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }

        return arr;
    })() : Array(cfg.qCount).fill(dow % 2 === 1 ? "PERSON" : "WORK");

    const eras              = THEMED_BANNERS.ERA        ?.allOptions || [];
    const franchises        = THEMED_BANNERS.FRANCHISE  ?.allOptions || [];
    const genres            = THEMED_BANNERS.GENRE      ?.allOptions || [];
    const studios           = THEMED_BANNERS.STUDIO     ?.allOptions || [];
    const sources           = THEMED_BANNERS.SOURCE     ?.allOptions || [];
    const tags              = THEMED_BANNERS.TAG        ?.allOptions || [];
    const letters           = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const prompts           = [];
    const usedSignatures    = new Set();
    const usedCriteria      = new Set();
    let lastBucketIdx       = -1;
    const pick              = (arr) => arr[Math.floor(rng() * arr.length)];

    const buildLexicalBuilders = (kind) => {
        const subject       = kind === "PERSON" ? "a character" : "an anime";
        const noun          = kind === "PERSON" ? "name"        : "title";
        const possessive    = kind === "PERSON" ? "their"       : "its";

        return [
            () => (                                                     {kind, rule: "LEX",             lexRule : "ONE_WORD",                       text: `Name ${subject} with a one-word ${noun}`}),
            () => (                                                     {kind, rule: "LEX",             lexRule : "TWO_WORDS",                      text: `Name ${subject} with a two-word ${noun}`}),
            () => (                                                     {kind, rule: "LEX",             lexRule : "THREE_PLUS_WORDS",               text: `Name ${subject} whose ${noun} has 3 or more words`}),
            () => (                                                     {kind, rule: "LEX",             lexRule : "FIVE_PLUS_WORDS",                text: `Name ${subject} whose ${noun} has 5 or more words`}),
            () => (                                                     {kind, rule: "LEX",             lexRule : "ALLITERATION",                   text: `Name ${subject} whose first and last words in ${possessive} ${noun} start with the same letter`}),
            () => (                                                     {kind, rule: "LEX",             lexRule : "DOUBLE_LETTER",                  text: `Name ${subject} whose ${noun} has doubled letters`}),
            () => {const l  = pick(letters); return                     {kind, rule: "LEX",             lexRule : "STARTS_WITH",    lexVal  : l,    text: `Name ${subject} whose ${noun} starts with the letter ${l}`}},
            () => {const l  = pick(letters); return                     {kind, rule: "LEX",             lexRule : "ENDS_WITH",      lexVal  : l,    text: `Name ${subject} whose ${noun} ends with the letter ${l}`}},
            () => {const l1 = pick(letters), l2 = pick(letters); return {kind, rule: "LEX_STARTS_ENDS", lexVal  : l1,               lexVal2 : l2,   text: `Name ${subject} whose ${noun} starts with ${l1} and ends with ${l2}`}},
            () => {const l  = pick(letters); return                     {kind, rule: "LEX",             lexRule : "HAS_LETTER",     lexVal  : l,    text: `Name ${subject} whose ${noun} contains the letter ${l}`}},
            () => (                                                     {kind, rule: "LEX",             lexRule : "HAS_NUMBER",                     text: `Name ${subject} with a number in ${possessive} ${noun}`}),
            () => (                                                     {kind, rule: "LEX",             lexRule : "HAS_PUNCTUATION",                text: `Name ${subject} with a punctuation or a symbol in ${possessive} ${noun}`})
        ];
    };

    for (let i = 0; i < cfg.qCount; i++) {
        const kind = types[i];

        if (kind === "PERSON") {
            const singleBuilders = [
                genres      .length     ? () => {const g    = pick(genres);     return {kind: "PERSON", rule: "GENRE",      value: g.title,                         text: `Name a character from ${tabiWithArticle(g.title)} anime`}}                   : null,
                eras        .length     ? () => {const e    = pick(eras);       return {kind: "PERSON", rule: "ERA",        value: e.title, keys: e.eligibleKeys,   text: `Name a character from an anime in the ${e.title}`}}                          : null,
                studios     .length     ? () => {const s    = pick(studios);    return {kind: "PERSON", rule: "STUDIO",     value: s.title, keys: s.eligibleKeys,   text: `Name a character from an anime made by ${s.title}`}}                         : null,
                sources     .length     ? () => {const src  = pick(sources);    return {kind: "PERSON", rule: "SOURCE",     value: src.title,                       text: `Name a character from an anime adapted from ${tabiWithArticle(src.title)}`}} : null,
                franchises  .length     ? () => {const f    = pick(franchises); return {kind: "PERSON", rule: "FRANCHISE",  value: f.title, keys: f.eligibleKeys,   text: `Name a character from the ${f.title} franchise`}}                            : null
            ].filter(Boolean);

            const intersectionBuilders = [
                (genres     .length && eras         .length)    ? () => {const g   = pick(genres),      e   = pick(eras);       return {kind: "PERSON", rule: "INT_GENRE_ERA",          genre     : g.title,      era       : e.title,                      keys    : e.eligibleKeys,                           text: `Name a character from ${tabiWithArticle(g.title)} anime in the ${e.title}`}}                             : null,
                (genres     .length && studios      .length)    ? () => {const g   = pick(genres),      s   = pick(studios);    return {kind: "PERSON", rule: "INT_GENRE_STUDIO",       genre     : g.title,      studio    : s.title,                      keys    : s.eligibleKeys,                           text: `Name a character from ${tabiWithArticle(g.title)} anime made by ${s.title}`}}                            : null,
                (genres     .length && sources      .length)    ? () => {const g   = pick(genres),      src = pick(sources);    return {kind: "PERSON", rule: "INT_GENRE_SOURCE",       genre     : g.title,      source    : src.title,                                                                        text: `Name a character from ${tabiWithArticle(g.title)} anime adapted from ${tabiWithArticle(src.title)}`}}    : null,
                (genres     .length && franchises   .length)    ? () => {const g   = pick(genres),      f   = pick(franchises); return {kind: "PERSON", rule: "INT_GENRE_FRANCHISE",    genre     : g.title,      franchise : f.title,                      keys    : f.eligibleKeys,                           text: `Name a character from ${tabiWithArticle(g.title)} anime in the ${f.title} franchise`}}                   : null,
                (eras       .length && studios      .length)    ? () => {const e   = pick(eras),        s   = pick(studios);    return {kind: "PERSON", rule: "INT_ERA_STUDIO",         era       : e.title,      studio    : s.title,                      keysA   : e.eligibleKeys, keysB: s.eligibleKeys,    text: `Name a character from an anime made by ${s.title} in the ${e.title}`}}                                   : null,
                (eras       .length && sources      .length)    ? () => {const e   = pick(eras),        src = pick(sources);    return {kind: "PERSON", rule: "INT_SOURCE_ERA",         source    : src.title,    era       : e.title,                      keys    : e.eligibleKeys,                           text: `Name a character from an anime adapted from ${tabiWithArticle(src.title)} in the ${e.title}`}}           : null,
                (eras       .length && franchises   .length)    ? () => {const e   = pick(eras),        f   = pick(franchises); return {kind: "PERSON", rule: "INT_ERA_FRANCHISE",      era       : e.title,      franchise : f.title,                      keysA   : e.eligibleKeys, keysB: f.eligibleKeys,    text: `Name a character from the ${f.title} franchise in the ${e.title}`}}                                      : null,
                (studios    .length && sources      .length)    ? () => {const s   = pick(studios),     src = pick(sources);    return {kind: "PERSON", rule: "INT_SOURCE_STUDIO",      source    : src.title,    studio    : s.title,                      keys    : s.eligibleKeys,                           text: `Name a character from an anime made by ${s.title} adapted from ${tabiWithArticle(src.title)}`}}          : null,
                (studios    .length && franchises   .length)    ? () => {const s   = pick(studios),     f   = pick(franchises); return {kind: "PERSON", rule: "INT_STUDIO_FRANCHISE",   studio    : s.title,      franchise : f.title,                      keysA   : s.eligibleKeys, keysB: f.eligibleKeys,    text: `Name a character from the ${f.title} franchise made by ${s.title}`}}                                     : null,
                (sources    .length && franchises   .length)    ? () => {const src = pick(sources),     f   = pick(franchises); return {kind: "PERSON", rule: "INT_SOURCE_FRANCHISE",   source    : src.title,    franchise : f.title,                      keys    : f.eligibleKeys,                           text: `Name a character from the ${f.title} franchise adapted from ${tabiWithArticle(src.title)}`}}             : null,
                genres      .length                             ? () => {const g    = pick(genres),     l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_GENRE",          genre     : g.title,      lexRule   : "STARTS_WITH",    lexVal: l,                                                      text: `Name a character from ${tabiWithArticle(g.title)} anime whose name starts with ${l}`}}                   : null,
                eras        .length                             ? () => {const e    = pick(eras),       l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_ERA",            era       : e.title,      lexRule   : "STARTS_WITH",    lexVal: l,  keys    : e.eligibleKeys,                           text: `Name a character from an anime in the ${e.title} whose name starts with ${l}`}}                          : null,
                studios     .length                             ? () => {const s    = pick(studios),    l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_STUDIO",         studio    : s.title,      lexRule   : "STARTS_WITH",    lexVal: l,  keys    : s.eligibleKeys,                           text: `Name a character from an anime made by ${s.title} whose name starts with ${l}`}}                         : null,
                sources     .length                             ? () => {const src  = pick(sources),    l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_SOURCE",         source    : src.title,    lexRule   : "STARTS_WITH",    lexVal: l,                                                      text: `Name a character from an anime adapted from ${tabiWithArticle(src.title)} whose name starts with ${l}`}} : null,
                franchises  .length                             ? () => {const f    = pick(franchises), l   = pick(letters);    return {kind: "PERSON", rule: "INT_LEX_FRANCHISE",      franchise : f.title,      lexRule   : "STARTS_WITH",    lexVal: l,  keys    : f.eligibleKeys,                           text: `Name a character from the ${f.title} franchise whose name starts with ${l}`}}                            : null
            ].filter(Boolean);

            const lexicalBuilders   = buildLexicalBuilders(kind);
            const buckets           = [singleBuilders, intersectionBuilders, lexicalBuilders].filter(b => b.length);

            if (buckets.length) {
                const eligibleIndices   = buckets.map((_, idx) => idx).filter(idx => buckets.length === 1 || idx !== lastBucketIdx);
                const chosenBucketIdx   = pick(eligibleIndices);
                lastBucketIdx           = chosenBucketIdx;

                prompts.push(tabiPickValidPrompt(rng, buckets[chosenBucketIdx], usedSignatures, usedCriteria));
            }
        } else {
            const singleBuilders = [
                genres  .length ? () => {const g    = pick(genres);     return {kind: "WORK", rule: "GENRE",  value: g.title,                           text: `Name ${tabiWithArticle(g.title)} anime`}}                    : null,
                eras    .length ? () => {const e    = pick(eras);       return {kind: "WORK", rule: "ERA",    value: e.title,   keys: e.eligibleKeys,   text: `Name an anime from the ${e.title}`}}                         : null,
                studios .length ? () => {const s    = pick(studios);    return {kind: "WORK", rule: "STUDIO", value: s.title,   keys: s.eligibleKeys,   text: `Name an anime made by ${s.title}`}}                          : null,
                sources .length ? () => {const src  = pick(sources);    return {kind: "WORK", rule: "SOURCE", value: src.title,                         text: `Name an anime adapted from ${tabiWithArticle(src.title)}`}}  : null,
                tags    .length ? () => {const t    = pick(tags);       return {kind: "WORK", rule: "TAG",    value: t.title,   keys: t.eligibleKeys,   text: `Name an anime with the ${t.title} tag`}}                     : null
            ].filter(Boolean);

            const intersectionBuilders = [
                (genres     .length && eras     .length)    ? () => {const g    = pick(genres),     e   = pick(eras);       return {kind: "WORK", rule: "INT_GENRE_ERA",        genre   : g.title,      era     : e.title,                      keys    : e.eligibleKeys,                           text: `Name ${tabiWithArticle(g.title)} anime from the ${e.title}`}}                            : null,
                (genres     .length && studios  .length)    ? () => {const g    = pick(genres),     s   = pick(studios);    return {kind: "WORK", rule: "INT_GENRE_STUDIO",     genre   : g.title,      studio  : s.title,                      keys    : s.eligibleKeys,                           text: `Name ${tabiWithArticle(g.title)} anime made by ${s.title}`}}                             : null,
                (genres     .length && sources  .length)    ? () => {const g    = pick(genres),     src = pick(sources);    return {kind: "WORK", rule: "INT_GENRE_SOURCE",     genre   : g.title,      source  : src.title,                                                                        text: `Name ${tabiWithArticle(g.title)} anime adapted from ${tabiWithArticle(src.title)}`}}     : null,
                (genres     .length && tags     .length)    ? () => {const g    = pick(genres),     t   = pick(tags);       return {kind: "WORK", rule: "INT_GENRE_TAG",        genre   : g.title,      tag     : t.title,                      keys    : t.eligibleKeys,                           text: `Name ${tabiWithArticle(g.title)} anime with the ${t.title} tag`}}                        : null,
                (eras       .length && studios  .length)    ? () => {const e    = pick(eras),       s   = pick(studios);    return {kind: "WORK", rule: "INT_ERA_STUDIO",       era     : e.title,      studio  : s.title,                      keysA   : e.eligibleKeys, keysB: s.eligibleKeys,    text: `Name an anime made by ${s.title} from the ${e.title}`}}                                  : null,
                (eras       .length && sources  .length)    ? () => {const e    = pick(eras),       src = pick(sources);    return {kind: "WORK", rule: "INT_SOURCE_ERA",       source  : src.title,    era     : e.title,                      keys    : e.eligibleKeys,                           text: `Name an anime adapted from ${tabiWithArticle(src.title)} from the ${e.title}`}}          : null,
                (eras       .length && tags     .length)    ? () => {const e    = pick(eras),       t   = pick(tags);       return {kind: "WORK", rule: "INT_ERA_TAG",          era     : e.title,      tag     : t.title,                      keysA   : e.eligibleKeys, keysB: t.eligibleKeys,    text: `Name an anime with the ${t.title} tag from the ${e.title}`}}                             : null,
                (studios    .length && sources  .length)    ? () => {const s    = pick(studios),    src = pick(sources);    return {kind: "WORK", rule: "INT_SOURCE_STUDIO",    source  : src.title,    studio  : s.title,                      keys    : e.eligibleKeys,                           text: `Name an anime made by ${s.title} adapted from ${tabiWithArticle(src.title)}`}}           : null,
                (studios    .length && tags     .length)    ? () => {const s    = pick(studios),    t   = pick(tags);       return {kind: "WORK", rule: "INT_STUDIO_TAG",       studio  : s.title,      tag     : t.title,                      keysA   : s.eligibleKeys, keysB: t.eligibleKeys,    text: `Name an anime made by ${s.title} with the ${t.title} tag`}}                              : null,
                (sources    .length && tags     .length)    ? () => {const src  = pick(sources),    t   = pick(tags);       return {kind: "WORK", rule: "INT_SOURCE_TAG",       source  : src.title,    tag     : t.title,                      keys    : t.eligibleKeys,                           text: `Name an anime adapted from ${tabiWithArticle(src.title)} with the ${t.title} tag`}}      : null,
                genres      .length                         ? () => {const g    = pick(genres),     l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_GENRE",        genre   : g.title,      lexRule : "STARTS_WITH",    lexVal: l,                                                      text: `Name ${tabiWithArticle(g.title)} anime whose title starts with ${l}`}}                   : null,
                eras        .length                         ? () => {const e    = pick(eras),       l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_ERA",          era     : e.title,      lexRule : "STARTS_WITH",    lexVal: l,  keys    : e.eligibleKeys,                           text: `Name an anime from the ${e.title} whose title starts with ${l}`}}                        : null,
                studios     .length                         ? () => {const s    = pick(studios),    l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_STUDIO",       studio  : s.title,      lexRule : "STARTS_WITH",    lexVal: l,  keys    : s.eligibleKeys,                           text: `Name an anime made by ${s.title} whose title starts with ${l}`}}                         : null,
                sources     .length                         ? () => {const src  = pick(sources),    l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_SOURCE",       source  : src.title,    lexRule : "STARTS_WITH",    lexVal: l,                                                      text: `Name an anime adapted from ${tabiWithArticle(src.title)} whose title starts with ${l}`}} : null,
                tags        .length                         ? () => {const t    = pick(tags),       l   = pick(letters);    return {kind: "WORK", rule: "INT_LEX_TAG",          tag     : t.title,      lexRule : "STARTS_WITH",    lexVal: l,  keys    : t.eligibleKeys,                           text: `Name an anime with the ${t.title} tag whose title starts with ${l}`}}                    : null
            ].filter(Boolean);

            const lexicalBuilders   = buildLexicalBuilders(kind);
            const buckets           = [singleBuilders, intersectionBuilders, lexicalBuilders].filter(b => b.length);

            if (buckets.length) {
                const eligibleIndices   = buckets.map((_, idx) => idx).filter(idx => buckets.length === 1 || idx !== lastBucketIdx);
                const chosenBucketIdx   = pick(eligibleIndices);
                lastBucketIdx           = chosenBucketIdx;

                prompts.push(tabiPickValidPrompt(rng, buckets[chosenBucketIdx], usedSignatures, usedCriteria));
            }
        }
    }

    tabiPromptsCache = {date: jstDate, prompts};
    return prompts;
}

function tabiStopTimer() {
    if (tabiTimerRaf !== null) {
        cancelAnimationFrame(tabiTimerRaf);
        tabiTimerRaf = null;
    }

    tabiActiveQuestionKey = null;
}

function tabiStartQuestionTimer(questionKey) {
    if (tabiActiveQuestionKey === questionKey && tabiTimerRaf !== null) return;

    tabiStopTimer();
    tabiActiveQuestionKey = questionKey;

    const barEl = document.getElementById("tabi-timer-bar");
    if (barEl) barEl.style.width = "100%";

    const start = performance.now();

    const tick = (now) => {
        if (tabiActiveQuestionKey !== questionKey) return;

        const elapsed   = (now - start) / 1000;
        const remaining = Math.max(0, TIME_LIMIT - elapsed);

        if (barEl) barEl.style.width = `${(remaining / TIME_LIMIT) * 100}%`;

        if (elapsed >= TIME_LIMIT) {
            tabiStopTimer();
            tabiSubmitAnswer(true);
        } else tabiTimerRaf = requestAnimationFrame(tick);
    };

    tabiTimerRaf = requestAnimationFrame(tick);
}

function tabiEnsureLocalState() {
    const today = activeDailyJstDate || getCurrentJstDate();

    if (!tabiState || tabiState.date !== today) tabiState = {
        date            : today,
        started         : false,
        completed       : false,
        dailyAwarded    : false,
        dailyEarned     : 0,
        station         : 0,
        laps            : 0,
        qIndex          : 0,
        answers         : []
    };

    if (!tabiWeeklyState) tabiWeeklyState = {weekStart: today, completedDates: [], weeklyAwarded: false};
}

function tabiApplyState(saveData) {
    if (!saveData)              return;
    if (saveData.tabiDaily)     tabiState       = {...saveData.tabiDaily};
    if (saveData.tabiWeekly)    tabiWeeklyState = {...saveData.tabiWeekly};

    tabiRender();
}

function tabiWarmUp() {
    if (tabiWarmPromise)                            return tabiWarmPromise;
    if (!databaseReady || !characterPool.length)    return Promise.resolve();

    tabiWarmPromise = new Promise((resolve) => {
        const run = () => {
            tabiBuildAnimeCatalog   ();
            tabiEnsureLocalState    ();
            tabiGetDailyPrompts     (tabiState.date);
            resolve                 ();
        };

        if (typeof requestIdleCallback === "function")  requestIdleCallback(run, {timeout: 1500});
        else                                            setTimeout(run, 0);
    });

    return tabiWarmPromise;
}

function tabiOnPageOpen() {
    if (!databaseReady) return;

    if (tabiAnimeCatalog.length > 0 && tabiPromptsCache.date === (tabiState?.date || activeDailyJstDate || getCurrentJstDate())) {
        tabiEnsureLocalState    ();
        tabiRender              ();

        return;
    }

    requestAnimationFrame(() => {
        tabiBuildAnimeCatalog   ();
        tabiEnsureLocalState    ();
        tabiRender              ();
    });
}

function tabiRender() {
    if (!databaseReady) return;

    tabiBuildAnimeCatalog   ();
    tabiEnsureLocalState    ();

    const jstDate           = tabiState.date;
    const dow               = tabiGetJstDow(jstDate);
    const cfg               = SCHEDULE[dow];
    const prompts           = tabiGetDailyPrompts(jstDate);
    const curStationName    = cfg.stations[tabiState.station] || "Tokyo";
    const dailyEarned       = tabiState.dailyEarned ?? (tabiState.dailyAwarded ? 120 : 0);

    document.getElementById("tabi-daily-reward").innerHTML = `<span>★</span> <span>${dailyEarned}/120</span>`;

    const daysDone      = Math.min(6, tabiWeeklyState.completedDates?.length || 0);
    const weeklyStar    = tabiWeeklyState.weeklyAwarded ? 120 : 0;

    document.getElementById("tabi-weekly-label")    .textContent    = `Weekly Stars: ${daysDone}/6`;
    document.getElementById("tabi-weekly-reward")   .innerHTML      = `<span>★</span> <span>${weeklyStar}/120</span>`;

    const routeEndpoints = dow === 0 ? "Tokyo ↻ Tokyo" : `${cfg.stations[0]} ➜ ${cfg.stations[20]}`;
    document.getElementById("tabi-track-endpoints").textContent = `${cfg.route}: ${routeEndpoints}, currently in ${curStationName}`;

    const nodesEl   = document.getElementById("tabi-track-nodes");
    const isDesktop = window.matchMedia("(min-width: 640px)").matches;

    if (dow === 0) {
        const radiusPct     = 44;
        const nodeSize      = isDesktop ? "w-7 h-7 text-xs" : "w-6 h-6 text-[10px]";
        nodesEl.className   = "relative mx-auto my-2 w-full max-w-[300px] sm:max-w-[360px] aspect-square";
        nodesEl.innerHTML   = cfg.stations.map((stName, idx) => {
            const angle     = ((idx / cfg.stations.length) * 2 * Math.PI) - (Math.PI / 2);
            const leftPct   = 50 + radiusPct * Math.cos(angle);
            const topPct    = 50 + radiusPct * Math.sin(angle);
            const isCurrent = idx === tabiState.station;
            const dotClass  = isCurrent ? "bg-indigo-600 text-white scale-110 ring-2 ring-indigo-400/50 z-10" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400";

            return `<div title="${escapeHTML(stName)}" style="left: ${leftPct.toFixed(2)}%; top: ${topPct.toFixed(2)}%;" class="absolute -translate-x-1/2 -translate-y-1/2 ${nodeSize} rounded-full flex items-center justify-center font-bold cursor-help transition ${dotClass}">${idx}</div>`;
            }).join("") + `
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Laps</span>
                <span class="text-lg sm:text-xl font-extrabold text-slate-700 dark:text-slate-200 tabular-nums">${tabiState.laps || 0}/5</span>
            </div>
        `;
    } else {
        const orderedIndices    = isDesktop ? cfg.stations.map((_, i) => i) : [0, 1, 2, 3, 4, 5, 6, 13, 12, 11, 10, 9, 8, 7, 14, 15, 16, 17, 18, 19, 20];
        nodesEl.className       = "grid grid-cols-7 sm:flex sm:flex-nowrap sm:justify-between gap-2 sm:gap-1.5 justify-items-center py-1";

        nodesEl.innerHTML = orderedIndices.map((idx) => {
            const stName    = cfg.stations[idx];
            const isCurrent = idx ===   tabiState.station;
            const isPassed  = idx <     tabiState.station;

            const dotClass = isCurrent
                ? "bg-indigo-600 text-white scale-110"
                : isPassed
                    ? "bg-emerald-500/80 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
            return `<div title="${escapeHTML(stName)}" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-help transition ${dotClass}">${idx}</div>`;
        }).join("");
    }

    const idlePanel = document.getElementById("tabi-idle-panel");
    const playPanel = document.getElementById("tabi-play-panel");
    const startBtn  = document.getElementById("tabi-start-btn");
    const summaryEl = document.getElementById("tabi-summary-banner");
    const historyEl = document.getElementById("tabi-history-list");

    const renderLogHTML = () => (tabiState.answers || []).map((a, i) => {
        let entityTitle = "Passed";

        if (a.uniqueKey) entityTitle = characterMap.get(a.uniqueKey)?.name || a.uniqueKey;
        else if (a.animeId) {
            const an = tabiAnimeMap.get(a.animeId);
            entityTitle = an ? (titleLang === "EN" ? an.english : an.romaji) : a.animeId;
        }

        const stepLabel = a.stationsMoved > 0 ? `+${a.stationsMoved}` : "0";

        return `
            <div class="flex items-center justify-between px-3 py-2 mt-3 mb-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-sm font-bold">
                <span class="truncate">Q${i + 1}: ${escapeHTML(entityTitle)}</span>
                <span class="shrink-0 tabular-nums">${stepLabel}</span>
            </div>
        `;
    }).join("");

    if (!tabiState.started || tabiState.completed) {
        tabiStopTimer();

        idlePanel.classList.remove  ("hidden");
        playPanel.classList.add     ("hidden");

        historyEl.innerHTML = renderLogHTML();
        const summaryRowEl  = document.getElementById("tabi-summary-row");

        if (tabiState.completed) {
            document.getElementById("tabi-start-wrap").classList.add("hidden");

            summaryRowEl?.  classList.remove("hidden");
            summaryEl.      classList.remove("hidden");

            const maxWon = dailyEarned >= 120;

            summaryEl.className = `flex-1 min-w-0 rounded-lg border px-3 py-2 text-center text-sm font-bold ${
                maxWon
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : dailyEarned > 0
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
            }`;

            summaryEl.textContent = maxWon
                ? `Reached the end of your Tabi! (★ ${dailyEarned})`
                : dow === 0
                    ? `Tabi ended at ${curStationName} after ${tabiState.laps} laps (★ ${dailyEarned})`
                    : `Tabi ended at ${curStationName} (★ ${dailyEarned})`;
        } else {
            document.getElementById("tabi-start-wrap").classList.remove("hidden");

            startBtn.disabled   = tabiBusy;
            const rulesPill     = document.getElementById("tabi-rules-pill");

            if (rulesPill) {
                const rulesText = "Travel between stations by entering the answers to each question\nReach the terminus in the allocated questions\nQuestion count reduces as the week progresses\nOn Sundays, you must do 5+ laps and return to Tokyo\nObscure answers move you further\n20 seconds per question\n6 perfect days in a week awards ★ 120";

                rulesPill.setAttribute      ("data-tooltip", rulesText);
                rulesPill.removeAttribute   ("title");
            }

            summaryRowEl?.  classList.add("hidden");
            summaryEl.      classList.add("hidden");
        }

        return;
    }

    idlePanel.classList.add     ("hidden");
    playPanel.classList.remove  ("hidden");

    const prompt    = prompts[tabiState.qIndex];
    const typeLabel = prompt.kind === "PERSON" ? "Person" : "Work";

    document.getElementById("tabi-prompt-subtitle") .textContent    = `Q${tabiState.qIndex + 1}/${cfg.qCount} • ${typeLabel}`;
    document.getElementById("tabi-prompt-text")     .textContent    = prompt.text;

    const stepLogEl = document.getElementById("tabi-step-log");
    const logHTML   = renderLogHTML();

    stepLogEl.innerHTML = logHTML;
    stepLogEl.classList.toggle("hidden", logHTML.trim() === "");

    const inputEl       = document.getElementById("tabi-answer-input");
    inputEl.placeholder = "";
    inputEl.disabled    = tabiBusy;

    const qKey = `${jstDate}:${tabiState.qIndex}`;

    if (!tabiBusy) {
        tabiStartQuestionTimer(qKey);
        if (document.activeElement !== inputEl) inputEl.focus();
    }
}

function tabiHasGenre(genreCollection, targetGenre) {
    if (!genreCollection)                           return false;
    if (typeof genreCollection.has === "function")  return genreCollection.has      (targetGenre);
    if (Array.isArray(genreCollection))             return genreCollection.includes (targetGenre);

    return false;
}

async function tabiHandleStart() {
    if (tabiBusy) return;
    tabiEnsureLocalState();

    if (currentUser) {
        tabiBusy = true;
        tabiRender();

        try {await sendGachaAction({action: "TABI_START"})}
        finally {
            tabiBusy = false;
            tabiRender();
        }

    } else {
        tabiState.started = true;
        tabiRender();
    }
}

function tabiFindExactMatch(rawInput, prompt) {
    const q = String(rawInput || "").trim().toLowerCase();
    if (!q || !prompt || !tabiState) return null;

    if (prompt.kind === "PERSON") {
        const matches = characterPool.filter(c => c.name.trim().toLowerCase() === q && tabiCheckPromptCandidate(prompt, c.uniqueKey));
        if (!matches.length) return null;

        return matches.reduce((best, c) => {
            const idx       = characterPool.findIndex(x => x.uniqueKey === c.uniqueKey);
            const rankRatio = idx / Math.max(1, characterPool.length - 1);
            const bestIdx   = characterPool.findIndex(x => x.uniqueKey === best.uniqueKey);
            const bestRatio = bestIdx / Math.max(1, characterPool.length - 1);

            return rankRatio > bestRatio ? c : best;
        }).uniqueKey;
    } else {
        const matches = tabiAnimeCatalog.filter(a => (a.romaji.trim().toLowerCase() === q || a.english.trim().toLowerCase() === q) && tabiCheckPromptCandidate(prompt, a.animeId));
        if (!matches.length) return null;

        return matches.reduce((best, a) => a.animeRankIdx > best.animeRankIdx ? a : best).animeId;
    }
}

async function tabiSubmitAnswer(timedOut = false) {
    if (tabiBusy || !tabiState?.started || tabiState?.completed) return;

    const jstDate   = tabiState.date;
    const dow       = tabiGetJstDow(jstDate);
    const cfg       = SCHEDULE[dow];
    const prompts   = tabiGetDailyPrompts(jstDate);

    const prompt = prompts[tabiState.qIndex];
    if (!prompt) return;

    let selectedId = null;

    const rejectWrongAnswer = () => {
        const inputEl = document.getElementById("tabi-answer-input");
        if (!inputEl) return;

        inputEl.value = "";
        inputEl.classList.add("border-rose-500", "ring-2", "ring-rose-500/40");

        setTimeout(() => {inputEl.classList.remove("border-rose-500", "ring-2", "ring-rose-500/40")}, 250);
        inputEl.focus();
    };

    if (!timedOut) {
        const rawText = document.getElementById("tabi-answer-input")?.value || "";
        selectedId = tabiFindExactMatch(rawText, prompt);
    }

    if (!timedOut && !selectedId) {
        rejectWrongAnswer();
        return;
    }

    tabiStopTimer();

    if (currentUser) {
        tabiBusy = true;
        document.getElementById("tabi-answer-input").disabled = true;
        let res = null;

        try {
            const payload = {
                action    : "TABI_ANSWER",
                passed    : timedOut,
                uniqueKey : prompt.kind === "PERSON" ? selectedId : null,
                animeId   : prompt.kind === "WORK"   ? selectedId : null
            };

            res = await sendGachaAction(payload);
            if (res) document.getElementById("tabi-answer-input").value = "";
        } finally {
            tabiBusy = false;
            if (res) tabiRender();
            else {
                const inputEl       = document.getElementById("tabi-answer-input");
                inputEl.disabled    = false;

                inputEl.focus();
            }
        }

        return;
    }

    let stationsMoved   = 0;
    let obscurityPct    = 0;

    if (!timedOut) {
        if (prompt.kind === "PERSON") {
            const idx           = characterPool.findIndex(c => c.uniqueKey === selectedId);
            const rankRatio     = idx >= 0 ? (idx / Math.max(1, characterPool.length - 1)) : 0;
            const curvedRatio   = Math.pow      (rankRatio, 0.5);
            obscurityPct        = Math.round    (rankRatio * 100);
            stationsMoved       = Math.max      (1, Math.min(cfg.maxStep, Math.ceil(curvedRatio * cfg.maxStep)));
        } else {
            const an            = tabiAnimeMap.get(selectedId);
            const rankRatio     = an ? (an.animeRankIdx / Math.max(1, tabiAnimeCatalog.length - 1)) : 0;
            const curvedRatio   = Math.pow      (rankRatio, 0.5);
            obscurityPct        = Math.round    (rankRatio * 100);
            stationsMoved       = Math.max      (1, Math.min(cfg.maxStep, Math.ceil(curvedRatio * cfg.maxStep)));
        }
    }

    if (dow === 0) {
        const totalSteps        =   tabiState.station + stationsMoved;
        tabiState.laps          +=  Math.floor(totalSteps / 30);
        tabiState.station       =   totalSteps % 30;
    } else tabiState.station    =   Math.min(20, tabiState.station + stationsMoved);

    tabiState.answers.push({
        qIndex      : tabiState.qIndex,
        kind        : prompt.kind,
        uniqueKey   : (!timedOut && prompt.kind === "PERSON")   ? selectedId : null,
        animeId     : (!timedOut && prompt.kind === "WORK")     ? selectedId : null,
        stationsMoved, obscurityPct
    });

    tabiState.qIndex += 1;

    if (tabiState.qIndex >= cfg.qCount || (dow !== 0 && tabiState.station === 20)) {
        tabiState.completed = true;

        if (!tabiState.dailyAwarded) {
            tabiState.dailyAwarded  = true;
            let earnedStars         = 0;

            if (dow === 0) {
                const distFromTokyo = Math.min(tabiState.station, 30 - tabiState.station);
                earnedStars         = (20 * Math.min(5, tabiState.laps)) + Math.max(0, 20 - (5 * distFromTokyo));
            } else earnedStars      = 6 * tabiState.station;

            tabiState.dailyEarned = earnedStars;

            if (earnedStars >= 120) {
                if (!tabiWeeklyState.completedDates.includes(jstDate))  tabiWeeklyState.completedDates.push(jstDate);
                if (tabiWeeklyState.completedDates.length >= 6)         tabiWeeklyState.weeklyAwarded = true;
            }
        }
    }

    document.getElementById("tabi-answer-input").value = "";
    tabiRender();
}

document.getElementById("tabi-start-btn")?.addEventListener("click", tabiHandleStart);

document.getElementById("tabi-answer-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();

        if (!document.getElementById("alert-modal")?.classList.contains("hidden")) return;
        const isEmpty = e.currentTarget.value.trim() === "";
        tabiSubmitAnswer(isEmpty);
    }
});

function tabiBuildShareText() {
    tabiEnsureLocalState();

    const jstDate   = tabiState.date;
    const dow       = tabiGetJstDow(jstDate);
    const moves     = (tabiState.answers || []).map(a => String(Number(a.stationsMoved) || 0)).join("-");
    const siteUrl   = "https://frittutisna.github.io/AniGacha";

    if (dow === 0) {
        const laps          = Number(tabiState.laps) || 0;
        const lapPlural     = laps === 1 ? "" : "s";
        const direction     = tabiState.station < 15 ? "past" : "from";
        const distFromTokyo = Math.min(tabiState.station, 30 - tabiState.station);
        const distPlural    = distFromTokyo === 1 ? "" : "s";

        return [`AniGacha-Tabi: ${jstDate}`, `${laps} lap${lapPlural}, ${distFromTokyo} station${distPlural} ${direction} Tokyo Station`, moves, siteUrl].join("\n");
    }

    const cfg           = SCHEDULE[dow];
    const totalStations = Number(tabiState.station) || 0;
    const stationName   = cfg.stations[totalStations] || "Tokyo";

    return [`AniGacha-Tabi: ${jstDate}`, `${stationName} (${totalStations}/20): ${moves}`, siteUrl].join("\n");
}

document.getElementById("tabi-share-btn")?.addEventListener("click", async () => {
    if (!tabiState?.completed) return;

    const shareText     = tabiBuildShareText();
    const shareModalEl  = document.getElementById("share-modal");

    try {
        await navigator.    clipboard.writeText (shareText);
        shareModalEl?.      classList.remove    ("hidden");
    } catch {prompt("Copy your Tabi result:", shareText);}
});

const tabiAbortModal = document.getElementById("tabi-abort-modal");

const closeTabiAbortModal = () => {
    tabiPendingTargetPage = null;
    tabiAbortModal?.classList.add("hidden");
};

function tabiPromptAbort(targetPage = "HOME") {
    tabiPendingTargetPage = targetPage;
    tabiAbortModal?.classList.remove("hidden");
    document.getElementById("tabi-abort-confirm")?.focus();
}

async function tabiConfirmAbort() {
    if (tabiBusy) return;
    const destination = tabiPendingTargetPage;

    closeTabiAbortModal ();
    tabiStopTimer       ();

    if (currentUser) {
        tabiBusy = true;

        try {await sendGachaAction({action: "TABI_ABORT"})}
        finally {
            tabiBusy = false;
            tabiRender();
        }
    } else if (tabiState) {
        tabiState.completed     = true;
        tabiState.dailyAwarded  = true;
        tabiState.dailyEarned   = 0;

        tabiRender();
    }

    if (destination && typeof switchHeaderPage === "function") switchHeaderPage(destination);
}

document.getElementById("tabi-abort-cancel")?.  addEventListener("click",           closeTabiAbortModal);
document.getElementById("tabi-abort-confirm")?. addEventListener("click",           tabiConfirmAbort);
tabiAbortModal?.                                addEventListener("click",           (e) => {if (e.target === tabiAbortModal)                    closeTabiAbortModal ()});
window.                                         addEventListener("beforeunload",    (e) => {if (tabiState?.started && !tabiState?.completed)    e.preventDefault    ()});