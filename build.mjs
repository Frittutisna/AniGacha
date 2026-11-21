import fs   from "node:fs";
import Papa from "papaparse";

const RARITIES = [
    {tier: "SSR",   dist: 0.005},
    {tier: "SR",    dist: 0.010},
    {tier: "S",     dist: 0.020},
    {tier: "A",     dist: 0.040},
    {tier: "B",     dist: 0.060},
    {tier: "C",     dist: 0.100},
    {tier: "D",     dist: 0.160},
    {tier: "E",     dist: 0.250},
    {tier: "F",     dist: 0.355},
];

function readCSV(path) {return Papa.parse(fs.readFileSync(path, "utf8"), {header: true, skipEmptyLines: true}).data}

function getField(row, candidates) {
    const keys = Object.keys(row);

    for (const c of candidates) {
        const match = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());

        if (match && row[match] !== undefined && row[match] !== null) {
            const val = String(row[match]).trim();
            if (val !== "" && !["null", "none", "nan"].includes(val.toLowerCase())) return val;
        }
    }

    return null;
}

function normalizeId(val) {
    if (!val) return null;

    const str = String(val).trim().replace(/\.0+$/, "");
    return str === "" ? null : str;
}

function parseCSVList(raw) {return raw ? String(raw).split(",").map(s => s.trim()).filter(Boolean) : []}

function parseRawDateInt(row) {
    const raw = getField(row, ["start_date", "release_date", "aired", "date", "premiered", "year", "start_year", "season_year"]);
    if (!raw) return null;

    const digits = raw.replace(/\D/g, "");

    if (digits.length >=    8) return Number(digits.slice(0, 8));
    if (digits.length ===   4) return Number(`${digits}0101`);

    return null;
}

const rawAnime      = readCSV("./dataset/anime.csv");
const rawChars      = readCSV("./dataset/char.csv");
const rawEras       = readCSV("./dataset/era.csv");
const rawFranchises = readCSV("./dataset/franchise.csv");
const rawGenres     = readCSV("./dataset/genre.csv");
const rawSources    = readCSV("./dataset/source.csv");
const rawStudios    = readCSV("./dataset/studio.csv");
const rawTags       = readCSV("./dataset/tag.csv");

function parseAnimeDateMs(row) {
    const raw = getField(row, ["start_date", "release_date", "aired", "date", "premiered", "year", "start_year", "season_year"]);
    if (!raw) return null;

    if (/^\d{8}$/.test(raw)) {
        const y = Number(raw.slice(0, 4));
        const m = Math.min(Math.max(Number(raw.slice(4, 6)), 1), 99) - 1;
        const d = Math.min(Math.max(Number(raw.slice(6, 8)), 1), 99);

        return new Date(y, m, d).getTime();
    }

    if (/^\d{4}$/.test(raw)) return new Date(Number(raw), 0, 1).getTime();

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
}

const animeMap = new Map();

rawAnime.forEach(row => {
    const id = normalizeId(getField(row, ["id", "anime_id"]));
    if (!id) return;

    animeMap.set(id, {
        id,
        romaji      : getField(row, ["romaji", "title_romaji", "title"]),
        english     : getField(row, ["english", "title_english"]),
        animeCount  : parseFloat(getField(row, ["count", "favorites", "favourites", "popularity"])) || 0,
        animeDate   : parseAnimeDateMs(row),
        rawDateInt  : parseRawDateInt(row),
        rootId      : normalizeId(getField(row, ["root_id", "root_anime_id", "root"])),
        parentId    : normalizeId(getField(row, ["parent_id", "prequel_id", "parent_anime_id", "source_anime_id"])),
        genres      : new Set(parseCSVList(getField(row, ["genres", "genre"]))),
        tags        : new Set(parseCSVList(getField(row, ["tags", "tag"]))),
        studios     : new Set(parseCSVList(getField(row, ["studios", "studio"]))),
        source      : getField(row, ["source"]),
    });
});

function resolveRootAnime(animeId) {
    let currId      = animeId;
    const visited   = new Set();

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

const chars = rawChars.map((row, idx) => {
    const rawCharId         = getField(row, ["id", "char_id", "character_id"]);
    const uniqueKey         = rawCharId ? `${rawCharId}_${idx}` : String(idx);
    const explicitRootId    = normalizeId(getField(row, ["root_anime_id", "root_id"]));
    const animeId           = normalizeId(getField(row, ["anime_id"]));
    const directAnime       = animeId ? animeMap.get(animeId) : null;
    const rootAnime         = resolveRootAnime(explicitRootId || animeId);

    return {
        uniqueKey,
        animeId,
        rootAnimeId : rootAnime ? rootAnime.id : animeId,
        rawDateInt  : rootAnime ? rootAnime.rawDateInt : null,
        genres      : directAnime ? Array.from(directAnime.genres) : [],
        tags        : directAnime ? Array.from(directAnime.tags) : [],
        studios     : directAnime ? Array.from(directAnime.studios) : [],
        source      : directAnime ? directAnime.source : null,
        count       : parseFloat(getField(row, ["count"])) || 0,
        tier        : "F",
    };
});

chars.sort((a, b) => b.count - a.count);
const total = chars.length;

chars.forEach((c, i) => {
    const pct   = i / total;
    let acc     = 0;

    for (const r of RARITIES) {
        acc += r.dist;

        if (pct < acc) {
            c.tier = r.tier;
            break;
        }
    }
});

chars.forEach((c, idx) => {c.idx = idx});

function makeOption(title, matchingChars) {return {title, idxs: matchingChars.map(c => c.idx)}}

const themedOptions = {
    ERA: rawEras.map(row => {
        const title     = getField(row, ["era", "name"]);
        const s         = getField(row, ["start"]);
        const e         = getField(row, ["end"]);
        const startDate = s !== null && !Number.isNaN(Number(s)) ? Number(`${Math.floor(Number(s))}0101`) : -Infinity;
        const endDate   = e !== null && !Number.isNaN(Number(e)) ? Number(`${Math.floor(Number(e))}9999`) : Infinity;

        return title
            ? makeOption(title, chars.filter(c => c.rawDateInt !== null && c.rawDateInt >= startDate && c.rawDateInt <= endDate))
            : null;
    }).filter(Boolean),

    FRANCHISE: rawFranchises.map(row => {
        const title     = getField(row, ["clean", "franchise", "name"]);
        const ids       = new Set(parseCSVList(getField(row, ["related"])).map(normalizeId).filter(Boolean));
        const rootId    = normalizeId(getField(row, ["id"]));

        if (rootId) ids.add(rootId);

        return title
            ? makeOption(title, chars.filter(c => (c.animeId && ids.has(c.animeId)) || (c.rootAnimeId && ids.has(c.rootAnimeId))))
            : null;
    }).filter(Boolean),

    GENRE: rawGenres.map(row => {
        const title = getField(row, ["genre", "name"]);

        return title
            ? makeOption(title, chars.filter(c => c.genres.includes(title)))
            : null;
    }).filter(Boolean),

    SOURCE: rawSources.map(row => {
        const title = getField(row, ["source", "name"]);

        return title
            ? makeOption(title, chars.filter(c => c.source === title))
            : null;
    }).filter(Boolean),

    STUDIO: rawStudios.map(row => {
        const rawStudio = getField(row, ["studio"]);
        const title     = getField(row, ["clean", "studio", "name"]);

        return title
            ? makeOption(title, chars.filter(c => c.studios.includes(rawStudio)))
            : null;
    }).filter(Boolean),

    TAG: rawTags.map(row => {
        const rawTag    = getField(row, ["tag"]);
        const title     = getField(row, ["clean", "tag", "name"]);

        return title
            ? makeOption(title, chars.filter(c => c.tags.includes(rawTag)))
            : null;
    }).filter(Boolean),
};

const compactChars = chars.map(c => [c.uniqueKey, c.tier, c.animeId]);
fs.writeFileSync("./supabase/functions/AniGacha-Japan/server-data.json", JSON.stringify({chars: compactChars, themedOptions}));

const clientAnimes = {};

for (const [id, a] of animeMap.entries()) {
    const root = resolveRootAnime(id) || a;

    clientAnimes[id] = [
        root.romaji,
        root.english,
        root.animeCount,
        root.animeDate,
        root.rawDateInt,
        root.id,
        Array.from(a.genres),
        Array.from(a.tags),
        Array.from(a.studios),
        a.source
    ];
}

const rawCharByKey = new Map(rawChars.map((row, idx) => {
    const rawCharId = getField(row, ["id", "char_id", "character_id"]);
    const uniqueKey = rawCharId ? `${rawCharId}_${idx}` : String(idx);
    const name      = getField(row, ["name", "full_name", "character_name"]) || `Character #${idx + 1}`;
    const img       = getField(row, ["image", "img", "image_url", "avatar", "picture", "suffix"]);

    return [uniqueKey, [name, img]];
}));

const DECK_RANK_CURVE = [
    {rank: "R",  dist: 0.010},
    {rank: "A",  dist: 0.015},
    {rank: "K",  dist: 0.020},
    {rank: "Q",  dist: 0.025},
    {rank: "J",  dist: 0.030},
    {rank: "10", dist: 0.035},
    {rank: "9",  dist: 0.040},
    {rank: "8",  dist: 0.045},
    {rank: "7",  dist: 0.050},
    {rank: "6",  dist: 0.075},
    {rank: "5",  dist: 0.100},
    {rank: "4",  dist: 0.125},
    {rank: "3",  dist: 0.150},
    {rank: "2",  dist: 0.280}
];

const DECK_SUITS            = ["Spades", "Hearts", "Diamonds", "Clubs"];
const RARITY_RANK_PRIORITY  = new Map(RARITIES.map((r, idx) => [r.tier, idx]));

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr;
}

function buildBalancedDeckMeta(charList) {
    const totalCount = charList.length;

    const deckByKey = new Map();
    if (totalCount === 0) return deckByKey;

    const rankByIdx     = new Array(totalCount);
    const jokerEntry    = DECK_RANK_CURVE.find(entry => entry.rank === "R");
    const jokerDist     = jokerEntry ? jokerEntry.dist : 0.010;
    const jokerCount    = Math.min(totalCount, Math.round(totalCount * jokerDist));
    const randomIndices = shuffleInPlace(charList.map((_, i) => i));
    const jokerSet      = new Set(randomIndices.slice(0, jokerCount));

    for (const idx of jokerSet) rankByIdx[idx] = "R";
    const nonJokerCurve = DECK_RANK_CURVE.filter(entry => entry.rank !== "R");

    const remainingIndices = charList
        .map((_, i) => i)
        .filter(i => !jokerSet.has(i))
        .sort((a, b) => {
            const tierDiff = (RARITY_RANK_PRIORITY.get(charList[a].tier) ?? 99) - (RARITY_RANK_PRIORITY.get(charList[b].tier) ?? 99);
            if (tierDiff !== 0) return tierDiff;

            return (charList[b].count - charList[a].count) || a - b;
        });

    const remainingTotal    = remainingIndices.length;
    let cursor              = 0;

    nonJokerCurve.forEach((entry, idx) => {
        const isLast    = idx === nonJokerCurve.length - 1;
        const size      = isLast ? remainingTotal - cursor : Math.min(remainingTotal - cursor, Math.round(remainingTotal * entry.dist));

        for (let k = 0; k < size; k++) rankByIdx[remainingIndices[cursor++]] = entry.rank;
    });

    while (cursor < remainingTotal) rankByIdx[remainingIndices[cursor++]] = "2";

    const suitIndices       = shuffleInPlace(charList.map((_, i) => i));
    const basePerSuit       = Math.floor(totalCount / DECK_SUITS.length);
    const remainderSuits    = totalCount % DECK_SUITS.length;
    const suitByIdx         = new Array(totalCount);
    let sCursor             = 0;

    DECK_SUITS.forEach((suitName, sIdx) => {
        const size = basePerSuit + (sIdx < remainderSuits ? 1 : 0);
        for (let k = 0; k < size; k++) suitByIdx[suitIndices[sCursor++]] = suitName;
    });

    charList.forEach((c, idx) => {
        deckByKey.set(c.uniqueKey, {
            rank: rankByIdx[idx] || "2",
            suit: suitByIdx[idx] || "Spades"
        });
    });

    return deckByKey;
}

const deckMetaByKey = buildBalancedDeckMeta(chars);

const clientChars = chars.map(c => {
    const [name, img]   = rawCharByKey.get(c.uniqueKey) || ["Unknown", null];
    const deck          = deckMetaByKey.get(c.uniqueKey) || {rank: "2", suit: "Spades"};

    return [c.uniqueKey, name, c.animeId, img, c.count, c.tier, deck.rank, deck.suit];
});

const clientEraOptions = rawEras.map((row, i) => {
    const title     = getField(row, ["era", "name"]);
    const s         = getField(row, ["start"]);
    const e         = getField(row, ["end"]);
    const startYear = s !== null ? Math.floor(Number(s)) : null;
    const endYear   = e !== null ? Math.floor(Number(e)) : null;
    const hasStart  = startYear !== null && !Number.isNaN(startYear);
    const hasEnd    = endYear !== null && !Number.isNaN(endYear);
    const isSpecial = title === "Pre-2000s" || title === "2000s";
    const hover     = (title && hasStart && hasEnd && !isSpecial) ? `${title} (${startYear}-${endYear})` : title;
    const opt       = themedOptions.ERA.find(o => o.title === title);

    return opt ? {title, hoverLabel: hover, sortOrder: hasStart ? startYear : -Infinity, idxs: opt.idxs} : null;
}).filter(Boolean);

fs.writeFileSync("./supabase/functions/AniGacha-Japan/client-data.json", JSON.stringify({
    animes          : clientAnimes,
    chars           : clientChars,
    themedOptions   : {...themedOptions, ERA: clientEraOptions}
}));

console.log(`Generated server-data.json and client-data.json`);