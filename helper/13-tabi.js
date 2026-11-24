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
let tabiSelectedSuggestion  = null;
let tabiSuggestionIndex     = -1;

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

    t =     Math.imul(t ^ (t >>> 15),   t | 1);
    t ^=    Math.imul(t ^ (t >>> 7),    t | 61) + t

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

function tabiBuildAnimeCatalog() {
    if (tabiAnimeCatalog.length > 0 || !characterPool.length) return;
    const byAnime = new Map();

    characterPool.forEach((c, rankIdx) => {
        if (!c.animeId) return;
        let entry = byAnime.get(c.animeId);

        if (!entry) {
            entry = {
                animeId     : c.animeId,
                romaji      : c.animeRomaji  || c.animeEnglish || `Anime #${c.animeId}`,
                english     : c.animeEnglish || c.animeRomaji  || `Anime #${c.animeId}`,
                genres      : c.genres instanceof Set ? c.genres : new Set(c.genres || []),
                source      : c.source,
                bestRankIdx : rankIdx,
                charKeys    : new Set([c.uniqueKey])
            };

            byAnime.set(c.animeId, entry);
        } else {
            if (rankIdx < entry.bestRankIdx) entry.bestRankIdx = rankIdx;
            entry.charKeys.add(c.uniqueKey);
        }
    });

    tabiAnimeCatalog = Array.from(byAnime.values());
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

    const eras      = THEMED_BANNERS.ERA    ?.allOptions    || [];
    const genres    = THEMED_BANNERS.GENRE  ?.allOptions    || [];
    const studios   = THEMED_BANNERS.STUDIO ?.allOptions    || [];
    const sources   = THEMED_BANNERS.SOURCE ?.allOptions    || [];
    const tags      = THEMED_BANNERS.TAG    ?.allOptions    || [];
    const prompts   = [];

    for (let i = 0; i < cfg.qCount; i++) {
        const kind = types[i];

        if (kind === "PERSON") {
            const pools = [
                genres.length ? () => {
                    const g = genres[Math.floor(rng() * genres.length)];
                    return {kind: "PERSON", rule: "GENRE", value: g.title, text: `Name a character from ${tabiWithArticle(g.title)} anime`}
                } : null,

                eras.length ? () => {
                    const e = eras[Math.floor(rng() * eras.length)];
                    return {kind: "PERSON", rule: "ERA", value: e.title, keys: e.eligibleKeys, text: `Name a character from an anime in the ${e.title}`}
                } : null,

                studios.length ? () => {
                    const s = studios[Math.floor(rng() * studios.length)];
                    return {kind: "PERSON", rule: "STUDIO", value: s.title, keys: s.eligibleKeys, text: `Name a character from an anime made by ${s.title}`}
                } : null
            ].filter(Boolean);

            if (pools.length) prompts.push(pools[i % pools.length]());
        } else {
            const pools = [
                genres.length ? () => {
                    const g = genres[Math.floor(rng() * genres.length)];
                    return {kind: "WORK", rule: "GENRE", value: g.title, text: `Name ${tabiWithArticle(g.title)} anime`}
                } : null,

                sources.length ? () => {
                    const src = sources[Math.floor(rng() * sources.length)];
                    return {kind: "WORK", rule: "SOURCE", value: src.title, text: `Name an anime adapted from ${tabiWithArticle(src.title)}`}
                } : null,

                tags.length ? () => {
                    const t = tags[Math.floor(rng() * tags.length)];
                    return {kind: "WORK", rule: "TAG", value: t.title, keys: t.eligibleKeys, text: `Name an anime with the ${t.title} tag`}
                }: null
            ].filter(Boolean);

            if (pools.length) prompts.push(pools[i % pools.length]());
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

function tabiOnPageOpen() {
    tabiBuildAnimeCatalog   ();
    tabiEnsureLocalState    ();
    tabiRender              ();
}

function tabiRender() {
    if (!databaseReady) return;

    tabiBuildAnimeCatalog   ();
    tabiEnsureLocalState    ();

    const jstDate   = tabiState.date;
    const dow       = tabiGetJstDow(jstDate);
    const cfg       = SCHEDULE[dow];
    const prompts   = tabiGetDailyPrompts(jstDate);

    const curStationName = cfg.stations[tabiState.station] || "Tokyo";
    document.getElementById("tabi-daily-reward").innerHTML = `<span>★</span> <span>${tabiState.dailyAwarded ? 120 : 0}/120</span>`;

    const daysDone      = Math.min(6, tabiWeeklyState.completedDates?.length || 0);
    const weeklyStar    = tabiWeeklyState.weeklyAwarded ? 120 : 0;

    document.getElementById("tabi-weekly-label")    .textContent    = `Weekly Stars: ${daysDone}/6`;
    document.getElementById("tabi-weekly-reward")   .innerHTML      = `<span>★</span> <span>${weeklyStar}/120</span>`;

    const routeEndpoints = dow === 0 ? "Tokyo ↻ Tokyo" : `${cfg.stations[0]} ➜ ${cfg.stations[20]}`;
    document.getElementById("tabi-track-endpoints").textContent = `${cfg.route}: ${routeEndpoints}, currently in ${curStationName}`;

    const nodesEl           = document.getElementById("tabi-track-nodes");
    const isDesktop         = window.matchMedia("(min-width: 640px)").matches;
    const orderedIndices    = (dow === 0 || isDesktop) ? cfg.stations.map((_, i) => i) : [0, 1, 2, 3, 4, 5, 6, 13, 12, 11, 10, 9, 8, 7, 14, 15, 16, 17, 18, 19, 20];
    nodesEl.className       = dow === 0 ? "grid grid-cols-6 sm:flex sm:flex-nowrap sm:justify-between gap-1.5 sm:gap-1 justify-items-center py-1" : "grid grid-cols-7 sm:flex sm:flex-nowrap sm:justify-between gap-2 sm:gap-1.5 justify-items-center py-1";

    nodesEl.innerHTML = orderedIndices.map((idx) => {
        const stName    = cfg.stations[idx];
        const isCurrent = idx === tabiState.station;
        const isPassed  = dow !== 0 && idx < tabiState.station;

        const dotClass = isCurrent
            ? "bg-indigo-600 text-white ring-2 ring-indigo-400 scale-110"
            : isPassed
                ? "bg-emerald-500/80 text-white"
                : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
        return `<div title="${escapeHTML(stName)}" class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-help transition ${dotClass}">${idx}</div>`;
    }).join("");

    const idlePanel = document.getElementById("tabi-idle-panel");
    const playPanel = document.getElementById("tabi-play-panel");
    const startBtn  = document.getElementById("tabi-start-btn");
    const summaryEl = document.getElementById("tabi-summary-banner");
    const historyEl = document.getElementById("tabi-history-list");

    const renderLogHTML = () => (tabiState.answers || []).map((a, i) => {
        let entityTitle = "Passed";

        if (a.uniqueKey) entityTitle = characterMap.get(a.uniqueKey)?.name || a.uniqueKey;
        else if (a.animeId) {
            const an = tabiAnimeCatalog.find(x => x.animeId === a.animeId);
            entityTitle = an ? (titleLang === "EN" ? an.english : an.romaji) : a.animeId;
        }

        const stepLabel = a.stationsMoved > 0 ? `+${a.stationsMoved}` : "0";

        return `
            <div class="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-xs">
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

        if (tabiState.completed) {
            startBtn    .classList.add      ("hidden");
            summaryEl   .classList.remove   ("hidden");

            const won = tabiState.dailyAwarded;

            summaryEl.className = `rounded-lg border px-3 py-2 text-center text-sm font-bold ${
                won
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
            }`;

            summaryEl.textContent = won
                ? "Reached the end of your Tabi!"
                : dow === 0
                    ? `Tabi ended at ${curStationName} after ${tabiState.laps} laps; need 5+ laps and land in Tokyo`
                    : `Tabi ended at ${curStationName}`;
        } else {
            startBtn.classList.remove("hidden");
            startBtn.disabled = tabiBusy;

            summaryEl.classList.add("hidden");
        }
        return;
    }

    idlePanel.classList.add     ("hidden");
    playPanel.classList.remove  ("hidden");

    const prompt    = prompts[tabiState.qIndex];
    const typeLabel = prompt.kind === "PERSON" ? "Person" : "Work";

    document.getElementById("tabi-prompt-subtitle") .textContent    = `Q${tabiState.qIndex + 1}/${cfg.qCount} • ${typeLabel}`;
    document.getElementById("tabi-prompt-text")     .textContent    = prompt.text;
    document.getElementById("tabi-step-log")        .innerHTML      = renderLogHTML();

    const inputEl       = document.getElementById("tabi-answer-input");
    inputEl.placeholder = prompt.kind === "PERSON" ? "Search character name" : "Search anime title";
    inputEl.disabled    = tabiBusy;

    document.getElementById("tabi-submit-btn").disabled = tabiBusy;

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

function tabiMatchSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q || !tabiState) return [];

    const prompts   = tabiGetDailyPrompts(tabiState.date);
    const prompt    = prompts[tabiState.qIndex];

    if (!prompt) return [];

    const usedKeys      = new Set((tabiState.answers || []).map(a => a.uniqueKey)   .filter(Boolean));
    const usedAnimes    = new Set((tabiState.answers || []).map(a => a.animeId)     .filter(Boolean));

    if (prompt.kind === "PERSON") {
        const out = [];

        for (let i = 0; i < characterPool.length; i++) {
            const c = characterPool[i];

            if (usedKeys.has(c.uniqueKey)   || !c.name.toLowerCase().includes(q))       continue;
            if (prompt.rule === "GENRE"     && !tabiHasGenre(c.genres, prompt.value))   continue;
            if (prompt.rule === "ERA"       && !prompt.keys?.has(c.uniqueKey))          continue;
            if (prompt.rule === "STUDIO"    && !prompt.keys?.has(c.uniqueKey))          continue;

            const series = titleLang === "EN" ? (c.animeEnglish || c.animeRomaji || "") : (c.animeRomaji || c.animeEnglish || "");
            out.push({id: c.uniqueKey, label: c.name, sub: series, rankIdx: i});
            if (out.length >= 30) break;
        }

        return out;
    } else {
        const out = [];

        for (const a of tabiAnimeCatalog) {
            if (usedAnimes.has(a.animeId)) continue;
            const disp = titleLang === "EN" ? a.english : a.romaji;

            if (!a.romaji.toLowerCase().includes(q) && !a.english.toLowerCase().includes(q))            continue;
            if (prompt.rule === "GENRE"             && !tabiHasGenre(a.genres, prompt.value))           continue;
            if (prompt.rule === "SOURCE"            && a.source !== prompt.value)                       continue;
            if (prompt.rule === "TAG"               && ![...a.charKeys].some(k => prompt.keys?.has(k))) continue;

            out.push({id: a.animeId, label: disp, sub: a.source || "", rankIdx: a.bestRankIdx});
            if (out.length >= 30) break;
        }

        return out;
    }
}

function tabiRenderSuggestions() {
    const inputEl = document.getElementById("tabi-answer-input");
    const sugWrap = document.getElementById("tabi-suggestions");
    const matches = tabiMatchSuggestions(inputEl.value);

    tabiSuggestionIndex = -1;

    if (matches.length === 0) {
        sugWrap.classList.add("hidden");
        sugWrap.innerHTML = "";

        return;
    }

    sugWrap.innerHTML = matches.map(m => `
        <button type="button" data-tabi-id="${escapeHTML(m.id)}" data-tabi-label="${escapeHTML(m.label)}"
            class="w-full px-3 py-2 text-left text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 transition">
            <span class="font-bold truncate">${escapeHTML(m.label)}</span>
            <span class="text-[11px] text-slate-400 truncate max-w-[45%]">${escapeHTML(m.sub)}</span>
        </button>
    `).join("");

    sugWrap.classList.remove("hidden");
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

async function tabiSubmitAnswer(timedOut = false) {
    if (tabiBusy || !tabiState?.started || tabiState?.completed) return;

    const jstDate   = tabiState.date;
    const dow       = tabiGetJstDow(jstDate);
    const cfg       = SCHEDULE[dow];
    const prompts   = tabiGetDailyPrompts(jstDate);

    const prompt = prompts[tabiState.qIndex];
    if (!prompt) return;

    let selectedId = tabiSelectedSuggestion;

    if (!timedOut && !selectedId) {
        const matches = tabiMatchSuggestions(document.getElementById("tabi-answer-input").value);
        if (matches.length > 0) selectedId = matches[0].id;
    }

    if (!timedOut && !selectedId) {
        alert("Select a valid option from the suggestions");
        return;
    }

    tabiStopTimer();
    document.getElementById("tabi-suggestions").classList.add("hidden");

    if (currentUser) {
        tabiBusy = true;
        tabiRender();

        try {
            const payload = {
                action    : "TABI_ANSWER",
                passed    : timedOut,
                uniqueKey : prompt.kind === "PERSON" ? selectedId : null,
                animeId   : prompt.kind === "WORK"   ? selectedId : null
            };

            const res = await sendGachaAction(payload);

            if (res) {
                document.getElementById("tabi-answer-input").value = "";
                tabiSelectedSuggestion = null;
            }
        } finally {
            tabiBusy = false;
            tabiRender();
        }

        return;
    }

    let stationsMoved   = 0;
    let obscurityPct    = 0;

    if (!timedOut) {
        if (prompt.kind === "PERSON") {
            const idx       = characterPool.findIndex(c => c.uniqueKey === selectedId);
            const rankRatio = idx >= 0 ? (idx / Math.max(1, characterPool.length - 1)) : 0;
            obscurityPct    = Math.round(rankRatio * 100);
            stationsMoved   = Math.max(1, Math.min(cfg.maxStep, Math.ceil(rankRatio * cfg.maxStep)));
        } else {
            const an        = tabiAnimeCatalog.find(a => a.animeId === selectedId);
            const rankRatio = an ? (an.bestRankIdx / Math.max(1, characterPool.length - 1)) : 0;
            obscurityPct    = Math.round(rankRatio * 100);
            stationsMoved   = Math.max(1, Math.min(cfg.maxStep, Math.ceil(rankRatio * cfg.maxStep)));
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

    const reachedGoal = dow === 0 ? (tabiState.qIndex === cfg.qCount && tabiState.laps >= 5 && tabiState.station === 0) : (tabiState.station === 20);

    if (tabiState.qIndex >= cfg.qCount || (dow !== 0 && tabiState.station === 20)) {
        tabiState.completed = true;

        if (reachedGoal && !tabiState.dailyAwarded) {
            tabiState.dailyAwarded = true;

            if (!tabiWeeklyState.completedDates.includes(jstDate))  tabiWeeklyState.completedDates.push(jstDate);
            if (tabiWeeklyState.completedDates.length >= 6)         tabiWeeklyState.weeklyAwarded = true;
        }
    }

    document.getElementById("tabi-answer-input").value = "";

    tabiSelectedSuggestion  = null;
    tabiSuggestionIndex     = -1;

    tabiRender();
}

document.getElementById("tabi-start-btn")?.     addEventListener("click", tabiHandleStart);
document.getElementById("tabi-submit-btn")?.    addEventListener("click", () => tabiSubmitAnswer(false));

document.getElementById("tabi-answer-input")?.addEventListener("input", () => {
    tabiSelectedSuggestion  = null;
    tabiSuggestionIndex     = -1;

    tabiRenderSuggestions();
});

document.getElementById("tabi-answer-input")?.addEventListener("keydown", (e) => {
    const sugWrap   = document.getElementById("tabi-suggestions");
    const items     = sugWrap && !sugWrap.classList.contains("hidden") ? [...sugWrap.querySelectorAll("[data-tabi-id]")] : [];

    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length > 0) {
        e.preventDefault();
        tabiSuggestionIndex = (tabiSuggestionIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;

        items.forEach((b, i) => {
            b.classList.toggle("bg-indigo-100",     i === tabiSuggestionIndex);
            b.classList.toggle("dark:bg-slate-800", i === tabiSuggestionIndex);
        });

        items[tabiSuggestionIndex]?.scrollIntoView({block: "nearest"});
        return;
    }

    if (e.key === "Escape" && items.length > 0) {
        sugWrap.classList.add("hidden");
        tabiSuggestionIndex = -1;
        return;
    }

    if (e.key === "Enter") {
        e.preventDefault();

        if (tabiSuggestionIndex >= 0 && items[tabiSuggestionIndex]) {
            items[tabiSuggestionIndex].click();
            return;
        }

        const isEmpty = e.currentTarget.value.trim() === "";
        tabiSubmitAnswer(isEmpty);
    }
});

document.getElementById("tabi-suggestions")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tabi-id]");
    if (!btn) return;

    tabiSelectedSuggestion  = btn.getAttribute("data-tabi-id");
    tabiSuggestionIndex     = -1;

    document.getElementById("tabi-answer-input").value = btn.getAttribute("data-tabi-label");
    document.getElementById("tabi-suggestions").classList.add("hidden");
});