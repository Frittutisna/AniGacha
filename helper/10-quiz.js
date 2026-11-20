let aniQuizSongs            = [];
let aniQuizNames            = [];
let aniQuizIndex            = 0;
let aniQuizCorrect          = 0;
let aniQuizStreak           = 0;
let aniQuizBestStreak       = 0;
let aniQuizCurrent          = null;
let aniQuizTimer            = null;
let aniQuizAudioTimer       = null;
let aniQuizAnswered         = false;
let aniQuizRevealing        = false;
let aniQuizRun              = null;
let aniQuizDaily            = null;
let aniQuizCurrentReward    = 0;
let aniQuizChantingCorrect  = 0;
let aniQuizAudioPlaying     = false;
let aniQuizSelectedMcBtn    = null;

const ANI_QUIZ_MISSIONS = [{
    id          : "played20",
    name        : "Play 20 songs",
    reward      : 10,
    test        : s => s.songsPlayed >= 20,
    progress    : s => `${Math.min(s.songsPlayed, 20)}/20`
}, {
    id          : "played40",
    name        : "Play 40 songs",
    reward      : 10,
    test        : s => s.songsPlayed >= 40,
    progress    : s => `${Math.min(s.songsPlayed, 40)}/40`
}, {
    id          : "correct10",
    name        : "Get 10 correct answers",
    reward      : 10,
    test        : s => s.correct >= 10,
    progress    : s => `${Math.min(s.correct, 10)}/10`
}, {
    id          : "correct20",
    name        : "Get 20 correct answers",
    reward      : 10,
    test        : s => s.correct >= 20,
    progress    : s => `${Math.min(s.correct, 20)}/20`
}, {
    id          : "streak5",
    name        : "Get a 5-song streak",
    reward      : 10,
    test        : s => s.bestStreak >= 5,
    progress    : s => `${Math.min(s.bestStreak, 5)}/5`
}, {
    id          : "streak10",
    name        : "Get a 10-song streak",
    reward      : 10,
    test        : s => s.bestStreak >= 10,
    progress    : s => `${Math.min(s.bestStreak, 10)}/10`
}, {
    id          : "acc25",
    name        : "Get at least 25% in a round",
    reward      : 10,
    test        : s => s.bestRoundPct >= 25,
    progress    : s => `${Math.min(s.bestRoundPct, 25)}/25`
}, {
    id          : "acc50",
    name        : "Get at least 50% in a round",
    reward      : 10,
    test        : s => s.bestRoundPct >= 50,
    progress    : s => `${Math.min(s.bestRoundPct, 50)}/50`
}, {
    id          : "chanting",
    name        : "Get a chanting song right",
    reward      : 10,
    test        : s => s.chantingCorrect >= 1,
    progress    : s => `${Math.min(s.chantingCorrect, 1)}/1`
}, {
    id          : "shorttime",
    name        : "Complete a quiz below 20+0",
    reward      : 10,
    test        : s => s.shortTimeQuiz
}, {
    id          : "entry",
    name        : "Complete a quiz in Entry mode",
    reward      : 10,
    test        : s => s.entryQuiz
}, {
    id          : "alloptions",
    name        : "Complete a quiz with all options enabled",
    reward      : 10,
    test        : s => s.allOptionsQuiz
}];

const aniQuizNorm = s => String(s || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

function aniQuizTitle(song) {
    const lang = typeof titleLang !== "undefined" ? titleLang : "JP";
    return lang === "JP" ? (song.romaji || song.english || "") : (song.english || song.romaji || "");
}

function aniQuizAccepted(song) {return [song.romaji, song.english, ...(Array.isArray(song.alts) ? song.alts : [])].filter(Boolean).map(aniQuizNorm)}
let aniQuizLoadPromise = null;

function loadAniQuizData() {
    if (aniQuizLoadPromise) return aniQuizLoadPromise;

    aniQuizLoadPromise = (async () => {
        const loading = document.getElementById("quiz-loading");
        loading?.classList.remove("hidden");

        try {
            const treeRes = await fetch("https://api.github.com/repos/Frittutisna/Stats-Archive/git/trees/main?recursive=1");
            if (!treeRes.ok) throw new Error("Could not list Stats-Archive files (" + treeRes.status + ")");

            const tree          = await treeRes.json();
            const paths         = (tree.tree || []).map(x => x.path);
            const timestampDirs = [...new Set(paths.map(p => p.match(/^(\d{10,})\/jsons\/search\.json$/)?.[1]).filter(Boolean))].sort();
            const namePaths     = paths.filter(p => /^\d{10,}\/jsons\/name\.json$/.test(p)).sort();

            if (!timestampDirs.length || !namePaths.length) throw new Error("No timestamped quiz JSON files were found.");

            const base  = "https://raw.githubusercontent.com/Frittutisna/Stats-Archive/main/";
            const all   = [];

            for (let i = 0; i < timestampDirs.length; i += 5) {
                const batch = await Promise.all(timestampDirs.slice(i, i + 5).map(async ts => {
                    const r = await fetch(base + ts + "/jsons/search.json");
                    if (!r.ok) return [];

                    const d = await r.json();
                    return Array.isArray(d) ? d : [];
                }));

                batch.forEach(a => all.push(...a));
            }

            const nr = await fetch(base + namePaths[namePaths.length - 1]);
            if (!nr.ok) throw new Error("Could not load the newest anime title list.");

            const rawNames          = await nr.json();
            const pooledTitles      = [];
            const seenNormTitles    = new Set();

            const addPooledTitle = (t) => {
                const trimmed   = String(t || "").trim();
                const norm      = aniQuizNorm(trimmed);

                if (!trimmed || !norm || seenNormTitles.has(norm)) return;

                seenNormTitles  .add    (norm);
                pooledTitles    .push   ({title: trimmed, norm});
            };

            for (const entry of (Array.isArray(rawNames) ? rawNames : [])) {for (const part of String(entry || "").split(" || ")) addPooledTitle(part)}

            for (const s of all) {
                addPooledTitle(s?.romaji);
                addPooledTitle(s?.english);

                if (Array.isArray(s?.alts)) {for (const alt of s.alts) addPooledTitle(alt)}
            }

            aniQuizNames    = pooledTitles;
            const seen      = new Set();

            aniQuizSongs = all.filter(s => {
                if (!s?.video_url || !s?.romaji && !s?.english) return false;
                const key = String(s.video_url).trim();

                if (key.toLowerCase().split("?")[0].endsWith(".webm"))  return false;
                if (seen.has(key))                                      return false;

                seen.add(key);
                return true;
            });

            aniQuizBuildMcIndex();
            document.getElementById("quiz-loading")?.classList.add("hidden");

            aniQuizRenderMissions           ();
            aniQuizUpdateSettingsPreview    ();
        } catch (e) {
            aniQuizLoadPromise = null;
            loading.textContent = "Quiz data could not be loaded: " + e.message;
            console.error(e);
        }
    })();

    return aniQuizLoadPromise;
}

const VINTAGE_CHECKPOINTS   = [1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];
const DIFF_CHECKPOINTS      = [20, 25, 30, 35];
const DIFF_SPAN_MODS        = [0.6, 0.3, 0, -0.3, -0.6];

function aniQuizSettings() {
    const cats              = ["op", "ed", "in"].filter(k => document.getElementById("quiz-" + k).checked);
    const [sound, extra]    = document.getElementById("quiz-time").value.split(",").map(Number);
    const vMinRaw           = document.getElementById("quiz-vintage-min")?. value;
    const vMaxRaw           = document.getElementById("quiz-vintage-max")?. value;
    const dMinRaw           = document.getElementById("quiz-diff-min")?.    value;
    const dMaxRaw           = document.getElementById("quiz-diff-max")?.    value;

    return {
        cats,
        chanting    : document.getElementById("quiz-chanting").checked,
        sound,
        extra,
        mode        : document.getElementById("quiz-mode").value,
        count       : Number(document.getElementById("quiz-count").value),
        vintageMin  : vMinRaw ? Number(vMinRaw) : null,
        vintageMax  : vMaxRaw ? Number(vMaxRaw) : null,
        diffMin     : dMinRaw ? Number(dMinRaw) : null,
        diffMax     : dMaxRaw ? Number(dMaxRaw) : null
    };
}

function aniQuizVintageM(vMin, vMax) {
    const startIdx      = vMin === null ? 0 : VINTAGE_CHECKPOINTS.indexOf(vMin) + 1;
    const endIdx        = vMax === null ? VINTAGE_CHECKPOINTS.length + 1 : VINTAGE_CHECKPOINTS.indexOf(vMax) + 1;
    const excludedSpans = 11 - (endIdx - startIdx);

    return Math.max(0.5, Number((1 - excludedSpans * 0.05).toFixed(2)));
}

function aniQuizDiffM(dMin, dMax) {
    const startIdx  = dMin === null ? 0 : DIFF_CHECKPOINTS.indexOf(dMin) + 1;
    const endIdx    = dMax === null ? DIFF_CHECKPOINTS.length + 1 : DIFF_CHECKPOINTS.indexOf(dMax) + 1;

    let mod = 0;
    for (let i = startIdx; i < endIdx; i++) mod += DIFF_SPAN_MODS[i];

    return Math.max(0.2, Number((1 + mod / (endIdx - startIdx)).toFixed(2)));
}

function aniQuizMultiplier(settings, best) {
    const catM      = settings.cats.length === 3 ? 1 : settings.cats.length === 2 ? .8 : .6;
    const chantM    = settings.chanting ? 1 : .8;
    const timeM     = settings.sound === 20 ? 1 : settings.sound === 15 ? 1.2 : settings.sound === 5 ? 1.6 : 1.4;
    const modeM     = settings.mode === "entry" ? 1 : .4;
    const streakM   = best >= 15 ? 1.6 : best >= 10 ? 1.4 : best >= 5 ? 1.2 : 1;
    const vintageM  = aniQuizVintageM(settings.vintageMin, settings.vintageMax);
    const diffM     = aniQuizDiffM(settings.diffMin, settings.diffMax);

    return {
        value: catM * chantM * timeM * modeM * streakM * vintageM * diffM,
        parts: {catM, chantM, timeM, modeM, streakM, vintageM, diffM}
    };
}

function aniQuizUpdateTimerBars(s, elapsed, total) {
    const isTwoEight    = s.sound === 2 && s.extra === 8;
    const singleWrap    = document.getElementById("quiz-timer-single");
    const splitWrap     = document.getElementById("quiz-timer-2-8");

    if (isTwoEight) {
        singleWrap  .classList.add      ("hidden");
        splitWrap   .classList.remove   ("hidden");

        const shortRem  = Math.max(0, Math.min(2, 2 - elapsed));
        const longRem   = Math.max(0, Math.min(8, 8 - Math.max(0, elapsed - 2)));

        document.getElementById("quiz-time-bar-extra").style.width  = `${(shortRem  / 2) * 100}%`;
        document.getElementById("quiz-time-bar-sound").style.width  = `${(longRem   / 8) * 100}%`;
    } else {
        splitWrap   .classList.add      ("hidden");
        singleWrap  .classList.remove   ("hidden");

        const remaining = Math.max(0, total - elapsed);
        document.getElementById("quiz-time-bar").style.width = `${(remaining / total) * 100}%`;
    }
}

function aniQuizGetFilteredPool(settings) {
    if (!settings.cats.length) return [];

    return aniQuizSongs.filter(s => {
        const t         = String(s.type || "").toLowerCase();
        const category  = t.includes("opening") ? "op" : t.includes("ending") ? "ed" : t.includes("insert") ? "in" : null;

        if (!category || !settings.cats.includes(category)) return false;

        const hasChanting = ["yes", "true", "1"].includes(String(s.chanting ?? "no").toLowerCase());
        if (!settings.chanting && hasChanting) return false;

        if (settings.vintageMin !== null || settings.vintageMax !== null) {
            const yearMatch = String(s.vintage || "").match(/\b(19\d{2}|20\d{2})\b/);
            if (!yearMatch) return false;

            const year = Number(yearMatch[1]);

            if (settings.vintageMin !== null && year <  settings.vintageMin) return false;
            if (settings.vintageMax !== null && year >= settings.vintageMax) return false;
        }

        if (settings.diffMin !== null || settings.diffMax !== null) {
            const diff = parseFloat(s.difficulty);

            if (!Number.isFinite(diff))                                     return false;
            if (settings.diffMin !== null && diff <     settings.diffMin)   return false;
            if (settings.diffMax !== null && diff >=    settings.diffMax)   return false;
        }

        return true;
    });
}

function aniQuizUpdateSettingsPreview() {
    const settings          = aniQuizSettings();
    const {value, parts}    = aniQuizMultiplier(settings, 0);
    const fmtLeg            = (n) => `×${Number(n.toFixed(2))}`;

    const setLeg = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = fmtLeg(val);
    };

    setLeg("quiz-leg-time",     parts.timeM);
    setLeg("quiz-leg-mode",     parts.modeM);
    setLeg("quiz-leg-vintage",  parts.vintageM);
    setLeg("quiz-leg-diff",     parts.diffM);
    setLeg("quiz-leg-type",     parts.catM);
    setLeg("quiz-leg-chant",    parts.chantM);

    const multEl = document.getElementById("quiz-mult-preview");

    if (multEl) {
        const rounded       = Math.round(value * 100) / 100;
        multEl.textContent  = `×${rounded}`;

        const multColor = rounded > 1
            ? "text-indigo-600 dark:text-indigo-400"
            : rounded < 1
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-700 dark:text-slate-200";

        multEl.className = `font-bold tabular-nums ${multColor}`;
    }

    if (!aniQuizSongs.length) return;

    const poolCount = aniQuizGetFilteredPool(settings).length;
    const isValid   = poolCount >= 100 && poolCount >= settings.count;
    const poolEl    = document.getElementById("quiz-pool-count");

    if (poolEl) {
        poolEl.textContent = poolCount.toLocaleString();

        const songColor = poolCount >= 100
            ? "text-indigo-600 dark:text-indigo-400"
            : "text-rose-600 dark:text-rose-400";

        poolEl.className = `font-bold tabular-nums ${songColor}`;
    }

    const startBtn = document.getElementById("quiz-start");
    if (startBtn) startBtn.disabled = !isValid;
}

function aniQuizStart() {
    const settings = aniQuizSettings();
    if (!settings.cats.length) { alert("Select at least one song category."); return; }

    const pool = aniQuizGetFilteredPool(settings);

    if (pool.length < 100) {
        alert(`Only ${pool.length} songs match these settings; at least 100 valid songs are required`);
        return;
    }

    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    aniQuizRun = {
        settings,
        songs   : pool.slice(0, settings.count),
        answers : [],
        id      : crypto.randomUUID?.() || String(Date.now()) + "-" + Math.random()
    };

    aniQuizIndex            = 0;
    aniQuizCorrect          = 0;
    aniQuizStreak           = 0;
    aniQuizBestStreak       = 0;
    aniQuizChantingCorrect  = 0;

    document.getElementById("quiz-setup")   .classList.add      ("hidden");
    document.getElementById("quiz-result")  .classList.add      ("hidden");
    document.getElementById("quiz-active")  .classList.remove   ("hidden");

    aniQuizNext();
}

function aniQuizClearTimers() {
    if (aniQuizTimer !== null) cancelAnimationFrame(aniQuizTimer);
    clearTimeout(aniQuizAudioTimer);

    aniQuizTimer        = null;
    aniQuizAudioTimer   = null;
}

function aniQuizSetSwipeText(el, text) {
    el.innerHTML        = "";
    const span          = document.createElement("span");
    span.className      = "inline-block whitespace-nowrap";
    span.textContent    = text;

    el.appendChild(span);

    requestAnimationFrame(() => {
        const style         = getComputedStyle(el);
        const padX          = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const innerWidth    = el.getBoundingClientRect().width - padX - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
        const textWidth     = span.getBoundingClientRect().width;
        const overflow      = Math.ceil(textWidth - innerWidth);

        if (overflow > 2) {
            const dist = overflow + 8;

            span.style.setProperty("--quiz-swipe-dist", `-${dist}px`);
            span.style.setProperty("--quiz-swipe-dur",  `${Math.max(2.8, dist / 75 + 1.4).toFixed(1)}s`);

            span.classList.add("quiz-marquee-track");
        }
    });
}

function aniQuizNext() {
    aniQuizClearTimers();
    if (aniQuizIndex >= aniQuizRun.songs.length) { aniQuizFinish(); return; }

    aniQuizCurrent          = aniQuizRun.songs[aniQuizIndex];
    aniQuizAnswered         = false;
    aniQuizRevealing        = false;
    aniQuizAudioPlaying     = false;
    aniQuizSelectedMcBtn    = null;

    const s     = aniQuizRun.settings;
    const audio = document.getElementById("quiz-audio");
    const total = s.sound + s.extra;

    aniQuizUpdateTimerBars(s, 0, total);

    document.getElementById("quiz-progress")    .textContent = `${aniQuizIndex + 1}/${s.count}`;
    document.getElementById("quiz-score")       .textContent = aniQuizCorrect;
    document.getElementById("quiz-streak")      .textContent = aniQuizStreak;
    document.getElementById("quiz-best")        .textContent = aniQuizBestStreak;
    document.getElementById("quiz-suggestions") .innerHTML   = "";

    aniQuizFilteredNames    = [];
    aniQuizSuggestionIndex  = -1;

    document.getElementById("quiz-suggestions").classList.add("hidden");

    const answerInput   = document.getElementById("quiz-answer");
    const answerReveal  = document.getElementById("quiz-answer-reveal");
    answerInput.value   = "";

    answerInput.removeAttribute("title");

    answerInput.disabled    = false;
    answerInput.className   = "w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-bold";

    answerReveal.classList.add("hidden");
    answerReveal.innerHTML = "";

    const isMc = s.mode === "mc";

    document.getElementById("quiz-entry-wrap")  .classList.toggle("hidden", isMc);
    document.getElementById("quiz-mc-wrap")     .classList.toggle("hidden", !isMc);

    const skipBtn   = document.getElementById("quiz-skip");
    const endBtn    = document.getElementById("quiz-end");

    skipBtn.textContent = "Skip";

    skipBtn.className = isMc
        ? "h-10 sm:h-auto sm:order-first px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition flex items-center justify-center"
        : "h-10 sm:order-first px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition";

    endBtn.className = isMc
        ? "h-10 sm:h-auto px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition flex items-center justify-center"
        : "h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition";

    audio.loop          = false;
    audio.muted         = false;
    audio.src           = aniQuizCurrent.video_url;
    audio.currentTime   = 0;
    audio.volume        = .35;

    audio.removeAttribute("controls");

    audio.addEventListener("loadedmetadata", () => {
        const max           = Math.max(0, audio.duration - (s.sound || 20));
        audio.currentTime   = Math.min(Number(aniQuizCurrent.start_sample) || 0, max);
    }, {once: true});

    audio.play().catch(() => {});

    if (isMc)   aniQuizMakeChoices();
    else        document.getElementById("quiz-answer").focus();
}

let aniQuizMcEntries = [];

function aniQuizMakeBigrams(str) {
    const clean = String(str || "").toLowerCase().replace(/\s+/g, "");
    const set   = new Set();

    for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
    return set;
}

function aniQuizBigramSim(setA, setB, strA, strB) {
    if (strA === strB)              return 1;
    if (!setA.size || !setB.size)   return 0;

    let common = 0;
    const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    for (const g of smaller) if (larger.has(g)) common++;

    return (2 * common) / (setA.size + setB.size);
}

function aniQuizBuildMcIndex() {
    const seen = new Set();
    const list = [];

    for (const s of aniQuizSongs) {
        const jp        = s.romaji || s.english || "";
        const en        = s.english || s.romaji || "";
        const normJp    = aniQuizNorm(jp);
        const normEn    = aniQuizNorm(en);
        const key       = `${normJp}|${normEn}`;

        if ((!normJp && !normEn) || seen.has(key)) continue;

        seen.add    (key);
        list.push   ({jp, en, normJp, normEn, gramsJp: aniQuizMakeBigrams(jp), gramsEn: aniQuizMakeBigrams(en)});
    }

    aniQuizMcEntries = list;
}

function aniQuizChoiceLabel(choice) {
    const lang = typeof titleLang !== "undefined" ? titleLang : "JP";
    return lang === "JP" ? (choice.jp || choice.en || "") : (choice.en || choice.jp || "");
}

function aniQuizRefreshMcLanguage() {document.querySelectorAll("#quiz-mc-wrap button").forEach(b => {
    const label = aniQuizChoiceLabel({jp: b.dataset.jp, en: b.dataset.en});
    if (label) aniQuizSetSwipeText(b, label);
})}

function aniQuizMakeChoices() {
    const useJp             = (typeof titleLang !== "undefined" ? titleLang : "JP") === "JP";
    const correctJp         = aniQuizCurrent.romaji || aniQuizCurrent.english || "";
    const correctEn         = aniQuizCurrent.english || aniQuizCurrent.romaji || "";
    const correctChoice     = {jp: correctJp, en: correctEn, isCorrect: true};
    const correctDisplay    = useJp ? correctJp : correctEn;
    const correctGrams      = aniQuizMakeBigrams(correctDisplay);
    const acceptedSet       = new Set(aniQuizAccepted(aniQuizCurrent));
    const seenDisplay       = new Set();
    const candidates        = [];

    for (const entry of aniQuizMcEntries) {
        if (acceptedSet.has(entry.normJp) || acceptedSet.has(entry.normEn)) continue;

        const normDisp = useJp ? entry.normJp : entry.normEn;
        if (!normDisp || seenDisplay.has(normDisp)) continue;
        seenDisplay.add(normDisp);

        const disp  = useJp ? entry.jp      : entry.en;
        const grams = useJp ? entry.gramsJp : entry.gramsEn;

        candidates.push({jp: entry.jp, en: entry.en, grams, disp, isCorrect: false, score: aniQuizBigramSim(correctGrams, grams, correctDisplay, disp)});
    }

    candidates.sort((a, b) => b.score - a.score);

    const pool = candidates.slice(0, 50);
    const opts = [];

    if (pool.length > 0) {
        opts.push(pool.shift());
        const clusterWeight = 0.45;

        while (opts.length < 3 && pool.length > 0) {
            let bestIdx     = 0;
            let bestScore   = -Infinity;

            for (let i = 0; i < pool.length; i++) {
                const cand              = pool[i];
                const avgSimToChosen    = opts.reduce((sum, chosen) => sum + aniQuizBigramSim(cand.grams, chosen.grams, cand.disp, chosen.disp), 0) / opts.length;
                const combinedScore     = cand.score + clusterWeight * avgSimToChosen;

                if (combinedScore > bestScore) {
                    bestScore = combinedScore;
                    bestIdx   = i;
                }
            }

            opts.push(pool.splice(bestIdx, 1)[0]);
        }
    }

    opts.push(correctChoice);

    for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
    }

    const wrap      = document.getElementById("quiz-mc-wrap");
    wrap.innerHTML  = "";

    opts.forEach(opt => {
        const b             = document.createElement("button");
        b.type              = "button";
        b.dataset.jp        = opt.jp;
        b.dataset.en        = opt.en;
        b.dataset.correct   = opt.isCorrect ? "1" : "0";
        b.className         = "min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm font-semibold hover:border-indigo-500 text-left overflow-hidden transition";

        aniQuizSetSwipeText(b, aniQuizChoiceLabel(opt));

        b.addEventListener("click", () => {
            aniQuizSelectedMcBtn = b;
            aniQuizResolve(opt.isCorrect);
        });

        wrap.appendChild(b);
    });
}

function aniQuizResolve(correct) {
    if (aniQuizAnswered) return;

    aniQuizAnswered     = true;
    aniQuizRevealing    = true;

    aniQuizClearTimers();

    if (correct) {
        aniQuizCorrect++;
        aniQuizStreak++;
        aniQuizBestStreak = Math.max(aniQuizBestStreak, aniQuizStreak);

        if (["yes", "true", "1"].includes(String(aniQuizCurrent?.chanting ?? "no").toLowerCase())) aniQuizChantingCorrect++;
    } else aniQuizStreak = 0;

    aniQuizRun.answers.push({song: aniQuizCurrent, correct});

    document.getElementById("quiz-score")   .textContent = aniQuizCorrect;
    document.getElementById("quiz-streak")  .textContent = aniQuizStreak;
    document.getElementById("quiz-best")    .textContent = aniQuizBestStreak;

    aniQuizRenderMissions   ();
    aniQuizSyncMissions     ();

    const title             = aniQuizTitle(aniQuizCurrent);
    const type              = String(aniQuizCurrent.type || "").toUpperCase();
    const typeMatch         = type.match(/(OPENING|ENDING|INSERT)\s*(\d*)/i);
    const shortType         = (typeMatch ? ({ OPENING: "OP", ENDING: "ED", INSERT: "IN" }[typeMatch[1].toUpperCase()] || typeMatch[1]) : type).toUpperCase() + (typeMatch && typeMatch[2] ? typeMatch[2] : "");
    const fullMeta          = `${title} (${shortType}): ${aniQuizCurrent.song || ""} by ${aniQuizCurrent.artist_raw || ""}`;
    const answerInput       = document.getElementById("quiz-answer");
    const answerReveal      = document.getElementById("quiz-answer-reveal");
    answerInput.disabled    = true;

    answerInput.classList.add("hidden");
    answerReveal.className  = `w-full h-10 rounded-lg border px-3 text-sm font-bold flex items-center overflow-hidden ${correct ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`;

    aniQuizSetSwipeText(answerReveal, fullMeta);
    document.getElementById("quiz-suggestions").innerHTML = "";

    aniQuizFilteredNames    = [];
    aniQuizSuggestionIndex  = -1;

    document.getElementById("quiz-suggestions").classList.add("hidden");

    document.querySelectorAll("#quiz-mc-wrap button").forEach(b => {
        b.disabled          = true;
        const isRightOption = b.dataset.correct === "1";
        const isChosenWrong = !correct && b === aniQuizSelectedMcBtn;

        if      (isRightOption) b.className = "min-w-0 rounded-lg border border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 p-3 text-sm font-bold text-left overflow-hidden transition";
        else if (isChosenWrong) b.className = "min-w-0 rounded-lg border border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 p-3 text-sm font-bold text-left overflow-hidden transition";
        else                    b.className = "min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 opacity-50 p-3 text-sm font-semibold text-left overflow-hidden transition";
    });

    document.getElementById("quiz-skip").textContent = "Skip";
    document.getElementById("quiz-skip").classList.remove("hidden");

    const audio = document.getElementById("quiz-audio");
    audio.loop  = true;
    audio.muted = false;

    audio.play().catch(() => {});

    const s     = aniQuizRun.settings;
    const total = s.sound + s.extra;
    const start = performance.now();

    aniQuizUpdateTimerBars(s, 0, total);

    const tick = (now) => {
        const elapsed = (now - start) / 1000;
        aniQuizUpdateTimerBars(s, elapsed, total);

        if (elapsed >= total) {
            aniQuizClearTimers();
            aniQuizIndex++;
            aniQuizNext();
        } else aniQuizTimer = requestAnimationFrame(tick);
    };

    aniQuizTimer = requestAnimationFrame(tick);
}

function aniQuizAdvanceReveal() {
    if (!aniQuizRevealing) return;

    aniQuizClearTimers();
    document.getElementById("quiz-audio").pause();

    aniQuizIndex++;
    aniQuizNext();
}

async function aniQuizFinish() {
    aniQuizClearTimers();

    document.getElementById("quiz-active")  .classList.add      ("hidden");
    document.getElementById("quiz-setup")   .classList.remove   ("hidden");

    const s                 = aniQuizRun.settings;
    const m                 = aniQuizMultiplier(s, aniQuizBestStreak);
    const completed         = aniQuizRun.answers.length === aniQuizRun.songs.length;
    const bestRoundPct      = aniQuizRun.songs.length > 0 ? Math.floor((aniQuizCorrect / aniQuizRun.songs.length) * 100) : 0;
    const allOptionsEnabled = s.cats.length === 3 && s.chanting && s.vintageMin === null && s.vintageMax === null && s.diffMin === null && s.diffMax === null;

    const missionStats = {
        songsPlayed         : aniQuizRun.answers.length,
        roundSongs          : aniQuizRun.songs.length,
        correct             : aniQuizCorrect,
        bestStreak          : aniQuizBestStreak,
        chantingCorrect     : aniQuizChantingCorrect,
        bestRoundPct,
        allCategoriesQuiz   : s.cats.length === 3,
        entryQuiz           : s.mode === "entry",
        shortTimeQuiz       : (s.sound !== 20 || s.extra !== 0),
        allOptionsQuiz      : allOptionsEnabled,
        completed
    };

    let reward          = 0;
    let missionState    = null;

    if (typeof currentUser !== "undefined" && currentUser) {
        const result = await sendGachaAction({
            action      : "QUIZ_COMPLETE",
            quizId      : aniQuizRun.id,
            correct     : aniQuizCorrect,

            settings: {
                categories  : s.cats,
                chanting    : s.chanting,
                sound       : s.sound,
                extra       : s.extra,
                mode        : s.mode,
                vintageMin  : s.vintageMin,
                vintageMax  : s.vintageMax,
                diffMin     : s.diffMin,
                diffMax     : s.diffMax
            },

            bestStreak: aniQuizBestStreak,
            missionStats
        });

        if (result) {
            reward          = result.quizReward         || 0;
            missionState    = result.save?.quizDaily    || null;
        }
    }

    aniQuizCurrentReward = reward;
    if (missionState) aniQuizDaily = missionState;

    aniQuizRenderMissions();
}

function aniQuizAbortToHome() {
    aniQuizClearTimers();
    const audio = document.getElementById("quiz-audio");

    if (audio) {
        audio.pause             ();
        audio.removeAttribute   ("src");
        audio.load              ();
    }

    aniQuizRun              = null;
    aniQuizCurrent          = null;
    aniQuizIndex            = 0;
    aniQuizCorrect          = 0;
    aniQuizStreak           = 0;
    aniQuizBestStreak       = 0;
    aniQuizChantingCorrect  = 0;
    aniQuizAnswered         = false;
    aniQuizRevealing        = false;
    aniQuizAudioPlaying     = false;
    aniQuizSelectedMcBtn    = null;
    aniQuizFilteredNames    = [];
    aniQuizSuggestionIndex  = -1;

    document.getElementById("quiz-end-modal")?. classList.add("hidden");
    document.getElementById("quiz-active")?.    classList.add("hidden");
    document.getElementById("quiz-result")?.    classList.add("hidden");
    document.getElementById("quiz-setup")?.     classList.remove("hidden");

    const quizPage  = document.getElementById("quiz-page");
    const mainPage  = document.getElementById("main-page");
    const navBtn    = document.getElementById("page-nav-btn");
    const navIcon   = document.getElementById("page-nav-icon");

    if (quizPage && !quizPage.classList.contains("hidden")) {
        quizPage.   classList.add       ("hidden");
        mainPage?.  classList.remove    ("hidden");

        if (navBtn) {
            navBtn.setAttribute("aria-label", "Quiz");
            navBtn.title = "Quiz";
        }

        if (navIcon) navIcon.innerHTML = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
        window.scrollTo({top: 0, behavior: "instant"});
    }
}

let aniQuizSyncingMissions = false;

function aniQuizGetLiveProgress() {
    const d             = aniQuizDaily || {};
    const base          = d.progress || {};
    const inRun         = Boolean(aniQuizRun && !document.getElementById("quiz-active").classList.contains("hidden"));
    const synced        = (inRun && d.activeQuizProgress?.[aniQuizRun.id]) || {songsPlayed: 0, correct: 0, chantingCorrect: 0};
    const runCompleted  = inRun && aniQuizRun.answers.length === aniQuizRun.songs.length;
    const s             = aniQuizRun?.settings;
    const runPct        = (inRun && aniQuizRun.songs.length > 0) ? Math.floor((aniQuizCorrect / aniQuizRun.songs.length) * 100) : 0;

    return {
        songsPlayed     : Math.max(0, (base.songsPlayed || 0) - synced.songsPlayed) + (inRun ? aniQuizRun.answers.length : 0),
        correct         : Math.max(0, (base.correct || 0) - synced.correct) + (inRun ? aniQuizCorrect : 0),
        bestStreak      : Math.max(base.bestStreak || 0, inRun ? aniQuizBestStreak : 0),
        chantingCorrect : Math.max(0, (base.chantingCorrect || 0) - synced.chantingCorrect) + (inRun ? aniQuizChantingCorrect : 0),
        bestRoundPct    : Math.max(base.bestRoundPct || 0, runPct),
        shortTimeQuiz   : Boolean(base.shortTimeQuiz || (runCompleted && (s.sound !== 20 || s.extra !== 0))),
        entryQuiz       : Boolean(base.entryQuiz || (runCompleted && s.mode === "entry")),
        allOptionsQuiz  : Boolean(base.allOptionsQuiz || (runCompleted && s.cats.length === 3 && s.chanting && s.vintageMin === null && s.vintageMax === null && s.diffMin === null && s.diffMax === null))
    };
}

async function aniQuizSyncMissions() {
    if (typeof currentUser === "undefined" || !currentUser || !aniQuizRun || aniQuizSyncingMissions) return;

    const d             = aniQuizDaily || {};
    const claimed       = new Set(d.claimedMissions || []);
    const liveProgress  = aniQuizGetLiveProgress();
    const hasNewClaim   = ANI_QUIZ_MISSIONS.some(m => !claimed.has(m.id) && m.test(liveProgress));

    if (!hasNewClaim) return;
    aniQuizSyncingMissions = true;

    try {
        const s = aniQuizRun.settings;

        const result = await sendGachaAction({
            action: "QUIZ_MISSION_PROGRESS",
            quizId: aniQuizRun.id,

            missionStats: {
                ...liveProgress,
                songsPlayed     : aniQuizRun.answers.length,
                roundSongs      : aniQuizRun.songs.length,
                correct         : aniQuizCorrect,
                bestStreak      : aniQuizBestStreak,
                chantingCorrect : aniQuizChantingCorrect,
                completed       : aniQuizRun.answers.length === aniQuizRun.songs.length
            },

            settings: {
                categories  : s.cats,
                chanting    : s.chanting,
                sound       : s.sound,
                extra       : s.extra,
                mode        : s.mode,
                vintageMin  : s.vintageMin,
                vintageMax  : s.vintageMax,
                diffMin     : s.diffMin,
                diffMax     : s.diffMax
            }
        });

        if (result?.save?.quizDaily) {
            aniQuizDaily = result.save.quizDaily;
            aniQuizRenderMissions();
        }
    } finally {
        aniQuizSyncingMissions = false;
    }
}

function aniQuizRenderMissions() {
    const wrap = document.getElementById("quiz-missions");
    if (!wrap) return;

    const d             = aniQuizDaily || {};
    const liveProgress  = aniQuizGetLiveProgress();

    wrap.innerHTML = "";

    ANI_QUIZ_MISSIONS.forEach(m => {
        const done          = Boolean(d.claimedMissions?.includes(m.id)) || m.test(liveProgress);
        const card          = document.createElement("div");
        card.className      = "rounded-lg border border-slate-200 dark:border-slate-700 p-2 flex items-center justify-between gap-2";
        const label         = document.createElement("div");
        label.className     = "mr-3 flex flex-col justify-center gap-0.5";
        label.innerHTML     = `<div class="font-semibold leading-tight">${m.name}</div><div class="text-slate-900 dark:text-slate-100 font-semibold leading-tight flex items-center gap-1"><span class="leading-none">★</span><span>${m.reward}</span></div>`;
        const status        = document.createElement("span");
        status.className    = "shrink-0 self-stretch min-w-[4.75rem] flex items-center justify-center px-2.5 py-1 rounded text-sm leading-none font-bold " + (done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300");
        status.textContent  = done ? "Done" : (m.progress ? m.progress(liveProgress) : "Pending");

        card.append(label, status);
        wrap.append(card);
    });

    let liveMissionEarned = d.missionEarned || 0;

    ANI_QUIZ_MISSIONS.forEach(m => {
        if (!d.claimedMissions?.includes(m.id) && m.test(liveProgress) && liveMissionEarned + m.reward <= 120) {
            liveMissionEarned += m.reward;
        }
    });

    const quizEarned = d.quizEarned || 0;
    document.getElementById("quiz-earned").textContent          = `${quizEarned}/120`;
    document.getElementById("quiz-mission-earned").textContent  = `${liveMissionEarned}/120`;
}

document.addEventListener("keydown", e => {if (e.key === "Enter" && aniQuizRevealing && document.activeElement?.id !== "quiz-answer") {
    e.preventDefault        ();
    aniQuizAdvanceReveal    ();
}});

const quizAudio = document.getElementById("quiz-audio");

if (quizAudio) {
    quizAudio.addEventListener("playing", () => {
        aniQuizAudioPlaying = true;

        if (aniQuizTimer === null && aniQuizRun && !aniQuizAnswered) {
            const s     = aniQuizRun.settings;
            const total = s.sound + s.extra;
            const start = performance.now();

            aniQuizUpdateTimerBars(s, 0, total);

            const tick = (now) => {
                const elapsed = (now - start) / 1000;
                aniQuizUpdateTimerBars(s, elapsed, total);
                if (elapsed >= s.sound) quizAudio.muted = true;

                if (elapsed >= total)   {
                    aniQuizTimer = null;
                    aniQuizResolve(false);
                } else aniQuizTimer = requestAnimationFrame(tick);
            };

            aniQuizTimer = requestAnimationFrame(tick);
        }
    });

    quizAudio.addEventListener("pause", () => {aniQuizAudioPlaying = false});
}

document.querySelectorAll("#quiz-setup-form select, #quiz-setup-form input").forEach(el => {el.addEventListener("change", () => {if (typeof aniQuizUpdateSettingsPreview === "function") aniQuizUpdateSettingsPreview()})});

document.getElementById("quiz-start")   .addEventListener("click", aniQuizStart);
document.getElementById("quiz-submit")  .addEventListener("click", () => aniQuizResolve(aniQuizAccepted(aniQuizCurrent).includes(aniQuizNorm(document.getElementById("quiz-answer").value))));

document.getElementById("quiz-answer").addEventListener("keydown", e => {if (e.key === "Enter") {
    e.preventDefault();
    if (aniQuizRevealing) { aniQuizAdvanceReveal(); return; }

    const suggestions   = document.getElementById("quiz-suggestions");
    const choices       = [...suggestions.querySelectorAll("button")];

    if (!suggestions.classList.contains("hidden") && aniQuizSuggestionIndex >= 0 && choices[aniQuizSuggestionIndex]) {
        choices[aniQuizSuggestionIndex].click();
        return;
    }

    document.getElementById("quiz-submit").click();
}});

document.getElementById("quiz-skip").addEventListener("click", () => { if (aniQuizRevealing) aniQuizAdvanceReveal(); else aniQuizResolve(false); });

let aniQuizEndToHome    = false;
const quizEndModal      = document.getElementById("quiz-end-modal");

const closeQuizEndModal = () => {
    aniQuizEndToHome = false;
    quizEndModal?.classList.add("hidden");
};

document.getElementById("quiz-end").addEventListener("click", () => {
    aniQuizEndToHome = false;
    quizEndModal?.classList.remove("hidden");
    document.getElementById("quiz-end-confirm")?.focus();
});

document.getElementById("quiz-end-cancel")?.addEventListener("click", closeQuizEndModal);
quizEndModal?.addEventListener("click", (e) => {if (e.target === quizEndModal) closeQuizEndModal()});

document.getElementById("quiz-end-confirm")?.addEventListener("click", () => {
    const goHome = aniQuizEndToHome;

    closeQuizEndModal   ();
    aniQuizClearTimers  ();

    document.getElementById("quiz-audio").pause();
    aniQuizIndex = aniQuizRun.songs.length;

    aniQuizFinish();
    if (goHome && pageNavBtn) pageNavBtn.click();
});

function aniQuizRankMatches(names, normQuery) {
    const matches = [];

    for (let i = 0; i < names.length; i++) {
        const {title, norm} = names[i];
        if (!norm.includes(normQuery)) continue;

        const matchTier = norm === normQuery ? 0 : norm.startsWith(normQuery) ? 1 : 2;
        matches.push({title, norm, matchTier});
    }

    matches.sort((a, b) => a.matchTier - b.matchTier || a.norm.length - b.norm.length || a.title.localeCompare(b.title));
    return matches.map(item => item.title);
}

let aniQuizSuggestionIndex      = -1;
let aniQuizFilteredNames        = [];
let aniQuizRenderedSugCount     = 0;
const ANI_QUIZ_SUG_BATCH_SIZE   = 50;

function aniQuizAppendSuggestionBatch(wrap, inputEl, targetCount) {
    const end = Math.min(aniQuizFilteredNames.length, targetCount);
    if (aniQuizRenderedSugCount >= end) return;

    const frag = document.createDocumentFragment();

    for (let i = aniQuizRenderedSugCount; i < end; i++) {
        const v         = aniQuizFilteredNames[i];
        const b         = document.createElement("button");
        b.type          = "button";
        b.className     = `block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 truncate ${i === aniQuizSuggestionIndex ? "bg-indigo-100 dark:bg-slate-800" : ""}`;
        b.textContent   = v;

        b.addEventListener("click", () => {
            inputEl.value           = v;
            aniQuizFilteredNames    = [];
            aniQuizSuggestionIndex  = -1;
            aniQuizRenderedSugCount = 0;

            wrap.classList.add("hidden");
        });

        frag.appendChild(b);
    }

    wrap.appendChild(frag);
    aniQuizRenderedSugCount = end;
}

function aniQuizRenderSuggestions(wrap, inputEl) {
    wrap.innerHTML          = "";
    wrap.scrollTop          = 0;
    aniQuizRenderedSugCount = 0;

    if (!aniQuizFilteredNames.length) {
        wrap.classList.add("hidden");
        return;
    }

    aniQuizAppendSuggestionBatch(wrap, inputEl, ANI_QUIZ_SUG_BATCH_SIZE);
    wrap.classList.remove("hidden");

    wrap.style.maxHeight = "10rem";
    wrap.style.overflowY = "auto";
}

document.getElementById("quiz-suggestions")?.addEventListener("scroll", (e) => {
    const wrap = e.currentTarget;

    if (aniQuizRenderedSugCount < aniQuizFilteredNames.length && wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 40) {
        aniQuizAppendSuggestionBatch(wrap, document.getElementById("quiz-answer"), aniQuizRenderedSugCount + ANI_QUIZ_SUG_BATCH_SIZE);
    }

}, {passive: true});

document.getElementById("quiz-answer").addEventListener("keydown", e => {
    const wrap  = document.getElementById("quiz-suggestions");
    const total = aniQuizFilteredNames.length;

    if (!total || wrap.classList.contains("hidden")) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();

        aniQuizSuggestionIndex = (aniQuizSuggestionIndex + (e.key === "ArrowDown" ? 1 : -1) + total) % total;
        if (aniQuizSuggestionIndex >= aniQuizRenderedSugCount) aniQuizAppendSuggestionBatch(wrap, e.currentTarget, aniQuizSuggestionIndex + ANI_QUIZ_SUG_BATCH_SIZE);

        const items = wrap.querySelectorAll("button");
        items.forEach((b, i) => b.classList.toggle("bg-indigo-100", i === aniQuizSuggestionIndex));
        items[aniQuizSuggestionIndex]?.scrollIntoView({ block: "nearest" });
    }

    if (e.key === "Escape") {
        wrap.classList.add("hidden");
        aniQuizSuggestionIndex = -1;
    }
});

document.getElementById("quiz-answer").addEventListener("input", e => {
    const wrap  = document.getElementById("quiz-suggestions");
    const q     = aniQuizNorm(e.target.value);

    aniQuizSuggestionIndex = -1;

    if (!q) {
        aniQuizFilteredNames    = [];
        wrap.innerHTML          = "";

        wrap.classList.add("hidden");
        return;
    }

    aniQuizFilteredNames = aniQuizRankMatches(aniQuizNames, q);
    aniQuizRenderSuggestions(wrap, e.target);
});

const pageNavBtn = document.getElementById("page-nav-btn");

if (pageNavBtn) pageNavBtn.addEventListener("click", () => {
    if (isSharedView && typeof exitSharedCollection === "function") {
        exitSharedCollection();
        return;
    }

    const quizPage      = document.getElementById("quiz-page");
    const mainPage      = document.getElementById("main-page");
    const openingQuiz   = quizPage.classList.contains("hidden");

    if (!openingQuiz && aniQuizRun && !document.getElementById("quiz-active").classList.contains("hidden")) {
        aniQuizEndToHome = true;
        quizEndModal?.classList.remove("hidden");
        document.getElementById("quiz-end-confirm")?.focus();
        return;
    }

    quizPage.classList.toggle("hidden", !openingQuiz);
    mainPage.classList.toggle("hidden", openingQuiz);

    if (openingQuiz) {
        aniQuizRenderMissions           ();
        aniQuizUpdateSettingsPreview    ();
        loadAniQuizData                 ();
    }

    pageNavBtn.setAttribute("aria-label", openingQuiz ? "Home" : "Quiz");
    pageNavBtn.title = openingQuiz ? "Home" : "Quiz";

    document.getElementById("page-nav-icon").innerHTML = openingQuiz
        ? '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'
        : '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';

    window.scrollTo({top: 0, behavior: "instant"});
});