// AniGacha Music Quiz — adapted from Stats-Archive quiz data and answer rules.
let aniQuizSongs = [];
let aniQuizNames = [];
let aniQuizIndex = 0, aniQuizCorrect = 0, aniQuizStreak = 0, aniQuizBestStreak = 0;
let aniQuizCurrent = null, aniQuizTimer = null, aniQuizAudioTimer = null;
let aniQuizAnswered = false, aniQuizRevealing = false, aniQuizRun = null, aniQuizDaily = null;
let aniQuizCurrentReward = 0;
let aniQuizChantingCorrect = 0;
let aniQuizAudioPlaying = false;
let aniQuizSelectedMcBtn = null;
const ANI_QUIZ_MISSIONS = [
    {id:"played20", name:"Play 20 songs", reward:10, test:s=>s.songsPlayed>=20, progress:s=>`${Math.min(s.songsPlayed,20)}/20`},
    {id:"played40", name:"Play 40 songs", reward:10, test:s=>s.songsPlayed>=40, progress:s=>`${Math.min(s.songsPlayed,40)}/40`},
    {id:"correct10", name:"Get 10 correct answers", reward:10, test:s=>s.correct>=10, progress:s=>`${Math.min(s.correct,10)}/10`},
    {id:"correct20", name:"Get 20 correct answers", reward:10, test:s=>s.correct>=20, progress:s=>`${Math.min(s.correct,20)}/20`},
    {id:"streak5", name:"Get a 5-song streak", reward:10, test:s=>s.bestStreak>=5, progress:s=>`${Math.min(s.bestStreak,5)}/5`},
    {id:"streak10", name:"Get a 10-song streak", reward:10, test:s=>s.bestStreak>=10, progress:s=>`${Math.min(s.bestStreak,10)}/10`},
    {id:"acc25", name:"Get at least 25% in a round", reward:10, test:s=>s.bestRoundPct>=25, progress:s=>`${Math.min(s.bestRoundPct,25)}/25`},
    {id:"acc50", name:"Get at least 50% in a round", reward:10, test:s=>s.bestRoundPct>=50, progress:s=>`${Math.min(s.bestRoundPct,50)}/50`},
    {id:"chanting", name:"Get a chanting song right", reward:10, test:s=>s.chantingCorrect>=1, progress:s=>`${Math.min(s.chantingCorrect,1)}/1`},
    {id:"shorttime", name:"Complete a quiz below 20+0", reward:10, test:s=>s.shortTimeQuiz},
    {id:"entry", name:"Complete a quiz in Entry mode", reward:10, test:s=>s.entryQuiz},
    {id:"alloptions", name:"Complete a quiz with all options enabled", reward:10, test:s=>s.allOptionsQuiz}
];
const aniQuizNorm = s => String(s || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g,"").replace(/&/g,"and").replace(/[^a-z0-9]/g,"");
function aniQuizTitle(song) {
    const lang = typeof titleLang !== "undefined" ? titleLang : "JP";
    return lang === "JP" ? (song.romaji || song.english || "") : (song.english || song.romaji || "");
}
function aniQuizAccepted(song) {
    return [song.romaji, song.english, ...(Array.isArray(song.alts) ? song.alts : [])].filter(Boolean).map(aniQuizNorm);
}
async function loadAniQuizData() {
    const loading = document.getElementById("quiz-loading");
    try {
        const treeRes = await fetch("https://api.github.com/repos/Frittutisna/Stats-Archive/git/trees/main?recursive=1");
        if (!treeRes.ok) throw new Error("Could not list Stats-Archive files ("+treeRes.status+")");
        const tree = await treeRes.json();
        const paths = (tree.tree || []).map(x=>x.path);
        const timestampDirs = [...new Set(paths.map(p=>p.match(/^(\d{10,})\/jsons\/search\.json$/)?.[1]).filter(Boolean))].sort();
        const namePaths = paths.filter(p=>/^\d{10,}\/jsons\/name\.json$/.test(p)).sort();
        if (!timestampDirs.length || !namePaths.length) throw new Error("No timestamped quiz JSON files were found.");
        const base = "https://raw.githubusercontent.com/Frittutisna/Stats-Archive/main/";
        const all = [];
        for (let i=0;i<timestampDirs.length;i+=5) {
            const batch = await Promise.all(timestampDirs.slice(i,i+5).map(async ts=>{
                const r=await fetch(base+ts+"/jsons/search.json");
                if (!r.ok) return [];
                const d=await r.json();
                return Array.isArray(d)?d:[];
            }));
            batch.forEach(a=>all.push(...a));
        }
        const nr=await fetch(base+namePaths[namePaths.length-1]);
        if (!nr.ok) throw new Error("Could not load the newest anime title list.");
        const rawNames = await nr.json();
        const pooledTitles = [];
        const seenNormTitles = new Set();
        const addPooledTitle = (t) => {
            const trimmed = String(t || "").trim();
            const norm = aniQuizNorm(trimmed);
            if (!trimmed || !norm || seenNormTitles.has(norm)) return;
            seenNormTitles.add(norm);
            pooledTitles.push(trimmed);
        };

        for (const entry of (Array.isArray(rawNames) ? rawNames : [])) {
            for (const part of String(entry || "").split(" || ")) {
                addPooledTitle(part);
            }
        }
        for (const s of all) {
            addPooledTitle(s?.romaji);
            addPooledTitle(s?.english);
            if (Array.isArray(s?.alts)) {
                for (const alt of s.alts) addPooledTitle(alt);
            }
        }
        aniQuizNames = pooledTitles;

        const seen=new Set();
        aniQuizSongs=all.filter(s=>{
            if (!s?.video_url || !s?.romaji && !s?.english) return false;
            const key=String(s.video_url).trim();
            if (key.toLowerCase().split("?")[0].endsWith(".webm")) return false;
            if(seen.has(key)) return false;
            seen.add(key); return true;
        });
        document.getElementById("quiz-loading").classList.add("hidden");
        aniQuizRenderMissions();
        aniQuizUpdateSettingsPreview();
    } catch(e) {
        loading.textContent="Quiz data could not be loaded: "+e.message;
        console.error(e);
    }
}
const VINTAGE_CHECKPOINTS = [1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];
const DIFF_CHECKPOINTS = [20, 25, 30, 35];
const DIFF_SPAN_MODS = [0.4, 0.2, 0, -0.2, -0.4];

function aniQuizSettings() {
    const cats=["op","ed","in"].filter(k=>document.getElementById("quiz-"+k).checked);
    const [sound,extra]=document.getElementById("quiz-time").value.split(",").map(Number);
    const vMinRaw = document.getElementById("quiz-vintage-min")?.value;
    const vMaxRaw = document.getElementById("quiz-vintage-max")?.value;
    const dMinRaw = document.getElementById("quiz-diff-min")?.value;
    const dMaxRaw = document.getElementById("quiz-diff-max")?.value;
    return {
        cats,
        chanting: document.getElementById("quiz-chanting").checked,
        sound,
        extra,
        mode: document.getElementById("quiz-mode").value,
        count: Number(document.getElementById("quiz-count").value),
        vintageMin: vMinRaw ? Number(vMinRaw) : null,
        vintageMax: vMaxRaw ? Number(vMaxRaw) : null,
        diffMin: dMinRaw ? Number(dMinRaw) : null,
        diffMax: dMaxRaw ? Number(dMaxRaw) : null
    };
}
function aniQuizVintageM(vMin, vMax) {
    const startIdx = vMin === null ? 0 : VINTAGE_CHECKPOINTS.indexOf(vMin) + 1;
    const endIdx = vMax === null ? VINTAGE_CHECKPOINTS.length + 1 : VINTAGE_CHECKPOINTS.indexOf(vMax) + 1;
    const excludedSpans = 11 - (endIdx - startIdx);
    return Math.max(0.5, Number((1 - excludedSpans * 0.05).toFixed(2)));
}
function aniQuizDiffM(dMin, dMax) {
    const startIdx = dMin === null ? 0 : DIFF_CHECKPOINTS.indexOf(dMin) + 1;
    const endIdx = dMax === null ? DIFF_CHECKPOINTS.length + 1 : DIFF_CHECKPOINTS.indexOf(dMax) + 1;
    let mod = 0;
    for (let i = startIdx; i < endIdx; i++) mod += DIFF_SPAN_MODS[i];
    return Math.max(0.2, Number((1 + mod).toFixed(2)));
}
function aniQuizMultiplier(settings,best) {
    const catM=settings.cats.length===3?1:settings.cats.length===2?.8:.6;
    const chantM=settings.chanting?1:.8;
    const timeM=settings.sound===20?1:settings.sound===15?1.2:settings.sound===5?1.6:1.4;
    const modeM=settings.mode==="entry"?1:.4;
    const streakM=best>=15?1.6:best>=10?1.4:best>=5?1.2:1;
    const vintageM=aniQuizVintageM(settings.vintageMin, settings.vintageMax);
    const diffM=aniQuizDiffM(settings.diffMin, settings.diffMax);
    return {value:catM*chantM*timeM*modeM*streakM*vintageM*diffM, parts:{catM,chantM,timeM,modeM,streakM,vintageM,diffM}};
}
function aniQuizUpdateTimerBars(s, elapsed, total) {
    const isTwoEight = s.sound === 2 && s.extra === 8;
    const singleWrap = document.getElementById("quiz-timer-single");
    const splitWrap = document.getElementById("quiz-timer-2-8");
    if (isTwoEight) {
        singleWrap.classList.add("hidden");
        splitWrap.classList.remove("hidden");
        const shortRem = Math.max(0, Math.min(2, 2 - elapsed));
        const longRem = Math.max(0, Math.min(8, 8 - Math.max(0, elapsed - 2)));
        document.getElementById("quiz-time-bar-extra").style.width = `${(shortRem / 2) * 100}%`;
        document.getElementById("quiz-time-bar-sound").style.width = `${(longRem / 8) * 100}%`;
    } else {
        splitWrap.classList.add("hidden");
        singleWrap.classList.remove("hidden");
        const remaining = Math.max(0, total - elapsed);
        document.getElementById("quiz-time-bar").style.width = `${(remaining / total) * 100}%`;
    }
}
function aniQuizGetFilteredPool(settings) {
    if (!settings.cats.length) return [];
    return aniQuizSongs.filter(s => {
        const t = String(s.type || "").toLowerCase();
        const category = t.includes("opening") ? "op" : t.includes("ending") ? "ed" : t.includes("insert") ? "in" : null;
        if (!category || !settings.cats.includes(category)) return false;
        const hasChanting = ["yes", "true", "1"].includes(String(s.chanting ?? "no").toLowerCase());
        if (!settings.chanting && hasChanting) return false;

        if (settings.vintageMin !== null || settings.vintageMax !== null) {
            const yearMatch = String(s.vintage || "").match(/\b(19\d{2}|20\d{2})\b/);
            if (!yearMatch) return false;
            const year = Number(yearMatch[1]);
            if (settings.vintageMin !== null && year < settings.vintageMin) return false;
            if (settings.vintageMax !== null && year >= settings.vintageMax) return false;
        }

        if (settings.diffMin !== null || settings.diffMax !== null) {
            const diff = parseFloat(s.difficulty);
            if (!Number.isFinite(diff)) return false;
            if (settings.diffMin !== null && diff < settings.diffMin) return false;
            if (settings.diffMax !== null && diff >= settings.diffMax) return false;
        }

        return true;
    });
}

function aniQuizUpdateSettingsPreview() {
    const settings = aniQuizSettings();
    const { value, parts } = aniQuizMultiplier(settings, 0);

    const fmtLeg = (n) => `×${Number(n.toFixed(2))}`;
    const setLeg = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = fmtLeg(val);
    };

    setLeg("quiz-leg-time", parts.timeM);
    setLeg("quiz-leg-mode", parts.modeM);
    setLeg("quiz-leg-vintage", parts.vintageM);
    setLeg("quiz-leg-diff", parts.diffM);
    setLeg("quiz-leg-type", parts.catM);
    setLeg("quiz-leg-chant", parts.chantM);

    const multEl = document.getElementById("quiz-mult-preview");
    if (multEl) {
        const rounded = Math.round(value * 100) / 100;
        multEl.textContent = `×${rounded}`;
        const multColor = rounded > 1
            ? "text-indigo-600 dark:text-indigo-400"
            : rounded < 1
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-700 dark:text-slate-200";
        multEl.className = `font-bold tabular-nums ${multColor}`;
    }

    if (!aniQuizSongs.length) return;

    const poolCount = aniQuizGetFilteredPool(settings).length;
    const isValid = poolCount >= 100 && poolCount >= settings.count;

    const poolEl = document.getElementById("quiz-pool-count");
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
    if (pool.length < 100) { alert(`Only ${pool.length} songs match these settings. At least 100 valid songs are required.`); return; }
    if (pool.length < settings.count) { alert(`Only ${pool.length} songs match these settings. Broaden your filters or select more categories.`); return; }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    aniQuizRun={settings, songs:pool.slice(0,settings.count), answers:[], id:crypto.randomUUID?.()||String(Date.now())+"-"+Math.random()};
    aniQuizIndex=0;aniQuizCorrect=0;aniQuizStreak=0;aniQuizBestStreak=0;aniQuizChantingCorrect=0;
    document.getElementById("quiz-setup").classList.add("hidden");
    document.getElementById("quiz-result").classList.add("hidden");
    document.getElementById("quiz-active").classList.remove("hidden");
    aniQuizNext();
}
function aniQuizClearTimers(){if(aniQuizTimer!==null)cancelAnimationFrame(aniQuizTimer);clearTimeout(aniQuizAudioTimer);aniQuizTimer=null;aniQuizAudioTimer=null;}
function aniQuizSetSwipeText(el, text) {
    el.innerHTML = "";
    const span = document.createElement("span");
    span.className = "inline-block whitespace-nowrap";
    span.textContent = text;
    el.appendChild(span);
    requestAnimationFrame(() => {
        const style = getComputedStyle(el);
        const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const innerWidth = el.getBoundingClientRect().width - padX - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
        const textWidth = span.getBoundingClientRect().width;
        const overflow = Math.ceil(textWidth - innerWidth);
        if (overflow > 2) {
            const dist = overflow + 8;
            span.style.setProperty("--quiz-swipe-dist", `-${dist}px`);
            span.style.setProperty("--quiz-swipe-dur", `${Math.max(2.8, dist / 75 + 1.4).toFixed(1)}s`);
            span.classList.add("quiz-marquee-track");
        }
    });
}
function aniQuizNext() {
    aniQuizClearTimers();
    if(aniQuizIndex>=aniQuizRun.songs.length){aniQuizFinish();return;}
    aniQuizCurrent=aniQuizRun.songs[aniQuizIndex];aniQuizAnswered=false;aniQuizRevealing=false;aniQuizAudioPlaying=false;aniQuizSelectedMcBtn=null;
    const s=aniQuizRun.settings, audio=document.getElementById("quiz-audio");
    const total=s.sound+s.extra;
    aniQuizUpdateTimerBars(s, 0, total);
    document.getElementById("quiz-progress").textContent=`${aniQuizIndex+1}/${s.count}`;
    document.getElementById("quiz-score").textContent=aniQuizCorrect;
    document.getElementById("quiz-streak").textContent=aniQuizStreak;
    document.getElementById("quiz-best").textContent=aniQuizBestStreak;
    document.getElementById("quiz-suggestions").innerHTML="";
    document.getElementById("quiz-suggestions").classList.add("hidden");
    const answerInput = document.getElementById("quiz-answer");
    const answerReveal = document.getElementById("quiz-answer-reveal");
    answerInput.value="";
    answerInput.removeAttribute("title");
    answerInput.disabled=false;
    answerInput.className="w-full h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm font-bold";
    answerReveal.classList.add("hidden");
    answerReveal.innerHTML="";
    const isMc = s.mode === "mc";
    document.getElementById("quiz-entry-wrap").classList.toggle("hidden", isMc);
    document.getElementById("quiz-mc-wrap").classList.toggle("hidden", !isMc);
    const skipBtn = document.getElementById("quiz-skip");
    const endBtn = document.getElementById("quiz-end");
    skipBtn.textContent="Skip";
    skipBtn.className = isMc
        ? "h-10 sm:h-auto sm:row-span-2 sm:order-first px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition flex items-center justify-center"
        : "h-10 sm:order-first px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition";
    endBtn.className = isMc
        ? "h-10 sm:h-auto sm:row-span-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition flex items-center justify-center"
        : "h-10 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition";
    audio.loop=false;
    audio.muted=false;
    audio.src=aniQuizCurrent.video_url;audio.currentTime=0;audio.volume=.35;audio.removeAttribute("controls");
    audio.addEventListener("loadedmetadata",()=>{const max=Math.max(0,audio.duration-(s.sound||20));audio.currentTime=Math.min(Number(aniQuizCurrent.start_sample)||0,max);},{once:true});
    audio.play().catch(()=>{});
    if(isMc) aniQuizMakeChoices();
    else document.getElementById("quiz-answer").focus();
}
function aniQuizStringSimilarity(a,b){
    const s1=String(a||"").toLowerCase().replace(/\s+/g,""),s2=String(b||"").toLowerCase().replace(/\s+/g,"");
    if(s1===s2)return 1;if(s1.length<2||s2.length<2)return 0;
    const grams=s=>new Set(Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)));
    const x=grams(s1),y=grams(s2);let common=0;x.forEach(g=>{if(y.has(g))common++;});
    return 2*common/(x.size+y.size);
}
function aniQuizChoiceLabel(choice) {
    const lang = typeof titleLang !== "undefined" ? titleLang : "JP";
    return lang === "JP" ? (choice.jp || choice.en || "") : (choice.en || choice.jp || "");
}
function aniQuizRefreshMcLanguage() {
    document.querySelectorAll("#quiz-mc-wrap button").forEach(b => {
        const label = aniQuizChoiceLabel({ jp: b.dataset.jp, en: b.dataset.en });
        if (label) aniQuizSetSwipeText(b, label);
    });
}
function aniQuizMakeChoices(){
    const correctChoice = {
        jp: aniQuizCurrent.romaji || aniQuizCurrent.english || "",
        en: aniQuizCurrent.english || aniQuizCurrent.romaji || "",
        isCorrect: true
    };
    const correctDisplay = aniQuizChoiceLabel(correctChoice);
    const acceptedSet = new Set(aniQuizAccepted(aniQuizCurrent));
    const seenCandidates = new Set();
    const candidates = [];

    for (const s of aniQuizSongs) {
        const jp = s.romaji || s.english || "";
        const en = s.english || s.romaji || "";
        const display = aniQuizChoiceLabel({ jp, en });
        const normDisplay = aniQuizNorm(display);
        if (!display || acceptedSet.has(aniQuizNorm(jp)) || acceptedSet.has(aniQuizNorm(en)) || seenCandidates.has(normDisplay)) continue;
        seenCandidates.add(normDisplay);
        candidates.push({ jp, en, isCorrect: false, score: aniQuizStringSimilarity(correctDisplay, display) });
    }

    candidates.sort((a, b) => b.score - a.score);
    const pool = candidates.slice(0, 50);
    const opts = [];

    if (pool.length > 0) {
        // 1. Always pick the closest overall match first (e.g. "A-Channel")
        opts.push(pool.shift());

        // 2. Pick remaining distractors that match the answer AND cluster with already-picked distractors
        const clusterWeight = 0.45;
        while (opts.length < 3 && pool.length > 0) {
            let bestIdx = 0;
            let bestScore = -Infinity;

            for (let i = 0; i < pool.length; i++) {
                const cand = pool[i];
                const candText = aniQuizChoiceLabel(cand);
                const avgSimToChosen = opts.reduce(
                    (sum, chosen) => sum + aniQuizStringSimilarity(candText, aniQuizChoiceLabel(chosen)),
                    0
                ) / opts.length;

                const combinedScore = cand.score + clusterWeight * avgSimToChosen;
                if (combinedScore > bestScore) {
                    bestScore = combinedScore;
                    bestIdx = i;
                }
            }

            opts.push(pool.splice(bestIdx, 1)[0]);
        }
    }

    opts.push(correctChoice);
    for(let i=opts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[opts[i],opts[j]]=[opts[j],opts[i]];}

    const wrap=document.getElementById("quiz-mc-wrap");wrap.innerHTML="";
    opts.forEach(opt=>{
        const b=document.createElement("button");
        b.type="button";
        b.dataset.jp = opt.jp;
        b.dataset.en = opt.en;
        b.dataset.correct = opt.isCorrect ? "1" : "0";
        b.className="min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm font-semibold hover:border-indigo-500 text-left overflow-hidden transition";
        aniQuizSetSwipeText(b, aniQuizChoiceLabel(opt));
        b.addEventListener("click",()=>{
            aniQuizSelectedMcBtn=b;
            aniQuizResolve(opt.isCorrect);
        });
        wrap.appendChild(b);
    });
}
function aniQuizResolve(correct){
    if(aniQuizAnswered)return;
    aniQuizAnswered=true;aniQuizRevealing=true;aniQuizClearTimers();
    if(correct){
        aniQuizCorrect++;
        aniQuizStreak++;
        aniQuizBestStreak=Math.max(aniQuizBestStreak,aniQuizStreak);
        if(["yes","true","1"].includes(String(aniQuizCurrent?.chanting ?? "no").toLowerCase())) aniQuizChantingCorrect++;
    }else aniQuizStreak=0;
    aniQuizRun.answers.push({song:aniQuizCurrent,correct});
    document.getElementById("quiz-score").textContent=aniQuizCorrect;
    document.getElementById("quiz-streak").textContent=aniQuizStreak;
    document.getElementById("quiz-best").textContent=aniQuizBestStreak;
    aniQuizRenderMissions();
    const title=aniQuizTitle(aniQuizCurrent);
    const type=String(aniQuizCurrent.type||"").toUpperCase();
    const typeMatch=type.match(/(OPENING|ENDING|INSERT)\s*(\d*)/i);
    const shortType=(typeMatch?({OPENING:"OP",ENDING:"ED",INSERT:"IN"}[typeMatch[1].toUpperCase()]||typeMatch[1]):type).toUpperCase()+(typeMatch&&typeMatch[2]?typeMatch[2]:"");
    const fullMeta=`${title} (${shortType}): ${aniQuizCurrent.song||""} by ${aniQuizCurrent.artist_raw||""}`;
    
    const answerInput=document.getElementById("quiz-answer");
    const answerReveal=document.getElementById("quiz-answer-reveal");
    answerInput.disabled=true;
    answerInput.classList.add("hidden");
    answerReveal.className=`w-full h-10 rounded-lg border px-3 text-sm font-bold flex items-center overflow-hidden ${correct ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`;
    aniQuizSetSwipeText(answerReveal, fullMeta);

    document.getElementById("quiz-suggestions").innerHTML="";
    document.getElementById("quiz-suggestions").classList.add("hidden");
    document.querySelectorAll("#quiz-mc-wrap button").forEach(b=>{
        b.disabled=true;
        const isRightOption = b.dataset.correct === "1";
        const isChosenWrong = !correct && b === aniQuizSelectedMcBtn;
        if (isRightOption) {
            b.className = "min-w-0 rounded-lg border border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 p-3 text-sm font-bold text-left overflow-hidden transition";
        } else if (isChosenWrong) {
            b.className = "min-w-0 rounded-lg border border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 p-3 text-sm font-bold text-left overflow-hidden transition";
        } else {
            b.className = "min-w-0 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 opacity-50 p-3 text-sm font-semibold text-left overflow-hidden transition";
        }
    });
    document.getElementById("quiz-skip").textContent="Skip";
    document.getElementById("quiz-skip").classList.remove("hidden");
    const audio=document.getElementById("quiz-audio");
    audio.loop=true;
    audio.muted=false;
    audio.play().catch(()=>{});
    const s=aniQuizRun.settings, total=s.sound+s.extra, start=performance.now();
    aniQuizUpdateTimerBars(s, 0, total);
    const tick=(now)=>{
        const elapsed=(now-start)/1000;
        aniQuizUpdateTimerBars(s, elapsed, total);
        if(elapsed>=total){aniQuizClearTimers();aniQuizIndex++;aniQuizNext();}
        else{aniQuizTimer=requestAnimationFrame(tick);}
    };
    aniQuizTimer=requestAnimationFrame(tick);
}
function aniQuizAdvanceReveal(){
    if(!aniQuizRevealing)return;
    aniQuizClearTimers();document.getElementById("quiz-audio").pause();
    aniQuizIndex++;aniQuizNext();
}
async function aniQuizFinish(){
    aniQuizClearTimers();
    document.getElementById("quiz-active").classList.add("hidden");
    document.getElementById("quiz-setup").classList.remove("hidden");

    const s=aniQuizRun.settings, m=aniQuizMultiplier(s,aniQuizBestStreak);
    const completed=aniQuizRun.answers.length===aniQuizRun.songs.length;
    const bestRoundPct=aniQuizRun.songs.length>0 ? Math.floor((aniQuizCorrect/aniQuizRun.songs.length)*100) : 0;
    const allOptionsEnabled = s.cats.length===3 && s.chanting && s.vintageMin===null && s.vintageMax===null && s.diffMin===null && s.diffMax===null;
    const missionStats={songsPlayed:aniQuizRun.answers.length,roundSongs:aniQuizRun.songs.length,correct:aniQuizCorrect,bestStreak:aniQuizBestStreak,chantingCorrect:aniQuizChantingCorrect,bestRoundPct,allCategoriesQuiz:s.cats.length===3,entryQuiz:s.mode==="entry",shortTimeQuiz:(s.sound!==20||s.extra!==0),allOptionsQuiz:allOptionsEnabled,completed};
    let reward=0, missionState=null;
    if(typeof currentUser!=="undefined"&&currentUser){
        const result=await sendGachaAction({action:"QUIZ_COMPLETE",quizId:aniQuizRun.id,correct:aniQuizCorrect,settings:{categories:s.cats,chanting:s.chanting,sound:s.sound,extra:s.extra,mode:s.mode,vintageMin:s.vintageMin,vintageMax:s.vintageMax,diffMin:s.diffMin,diffMax:s.diffMax},bestStreak:aniQuizBestStreak,missionStats});
        if(result){reward=result.quizReward||0;missionState=result.save?.quizDaily||null;}
    }
    aniQuizCurrentReward=reward;
    if(missionState)aniQuizDaily=missionState;
    aniQuizRenderMissions();
}
function aniQuizAbortToHome() {
    aniQuizClearTimers();
    const audio = document.getElementById("quiz-audio");
    if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
    }
    aniQuizRun = null;
    aniQuizCurrent = null;
    aniQuizIndex = 0;
    aniQuizCorrect = 0;
    aniQuizStreak = 0;
    aniQuizBestStreak = 0;
    aniQuizChantingCorrect = 0;
    aniQuizAnswered = false;
    aniQuizRevealing = false;
    aniQuizAudioPlaying = false;
    aniQuizSelectedMcBtn = null;

    document.getElementById("quiz-end-modal")?.classList.add("hidden");
    document.getElementById("quiz-active")?.classList.add("hidden");
    document.getElementById("quiz-result")?.classList.add("hidden");
    document.getElementById("quiz-setup")?.classList.remove("hidden");

    const quizPage = document.getElementById("quiz-page");
    const mainPage = document.getElementById("main-page");
    const navBtn = document.getElementById("page-nav-btn");
    const navIcon = document.getElementById("page-nav-icon");

    if (quizPage && !quizPage.classList.contains("hidden")) {
        quizPage.classList.add("hidden");
        mainPage?.classList.remove("hidden");
        if (navBtn) {
            navBtn.setAttribute("aria-label", "Quiz");
            navBtn.title = "Quiz";
        }
        if (navIcon) {
            navIcon.innerHTML = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
        }
        window.scrollTo({ top: 0, behavior: "instant" });
    }
}
function aniQuizRenderMissions(){
    const wrap=document.getElementById("quiz-missions");if(!wrap)return;
    const d=aniQuizDaily||{}, base=d.progress||{};
    const inRun=Boolean(aniQuizRun && !document.getElementById("quiz-active").classList.contains("hidden"));
    const runCompleted=inRun && aniQuizRun.answers.length===aniQuizRun.songs.length;
    const s=aniQuizRun?.settings;
    const runPct=(inRun&&aniQuizRun.songs.length>0)?Math.floor((aniQuizCorrect/aniQuizRun.songs.length)*100):0;
    const liveProgress={
        songsPlayed:(base.songsPlayed||0)+(inRun?aniQuizRun.answers.length:0),
        correct:(base.correct||0)+(inRun?aniQuizCorrect:0),
        bestStreak:Math.max(base.bestStreak||0,inRun?aniQuizBestStreak:0),
        chantingCorrect:(base.chantingCorrect||0)+(inRun?aniQuizChantingCorrect:0),
        bestRoundPct:Math.max(base.bestRoundPct||0,runPct),
        shortTimeQuiz:Boolean(base.shortTimeQuiz||(runCompleted&&(s.sound!==20||s.extra!==0))),
        entryQuiz:Boolean(base.entryQuiz||(runCompleted&&s.mode==="entry")),
        allOptionsQuiz:Boolean(base.allOptionsQuiz||(runCompleted&&s.cats.length===3&&s.chanting&&s.vintageMin===null&&s.vintageMax===null&&s.diffMin===null&&s.diffMax===null))
    };
    wrap.innerHTML="";
    ANI_QUIZ_MISSIONS.forEach(m=>{
        const done=Boolean(d.claimedMissions?.includes(m.id))||m.test(liveProgress);
        const card=document.createElement("div");card.className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 flex items-center justify-between gap-2";
        const label=document.createElement("div");label.className="mr-3";label.innerHTML=`<div class="font-semibold">${m.name}</div><div class="text-slate-900 dark:text-slate-100 font-semibold"><span>★</span> ${m.reward}</div>`;
        const status=document.createElement("span");status.className="shrink-0 self-stretch min-w-[4.75rem] flex items-center justify-center px-2.5 py-1 rounded text-sm font-bold "+(done?"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300":"bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300");status.textContent=done?"Done":(m.progress?m.progress(liveProgress):"Pending");
        card.append(label,status);wrap.append(card);
    });
    let liveMissionEarned=d.missionEarned||0;
    ANI_QUIZ_MISSIONS.forEach(m=>{
        if(!d.claimedMissions?.includes(m.id) && m.test(liveProgress) && liveMissionEarned+m.reward<=120){
            liveMissionEarned+=m.reward;
        }
    });
    const quizEarned=d.quizEarned||0;
    document.getElementById("quiz-earned").textContent=`${quizEarned}/120`;
    document.getElementById("quiz-mission-earned").textContent=`${liveMissionEarned}/120`;
}
document.addEventListener("keydown",e=>{
    if(e.key==="Enter" && aniQuizRevealing && document.activeElement?.id!=="quiz-answer"){
        e.preventDefault();aniQuizAdvanceReveal();
    }
});
const quizAudio = document.getElementById("quiz-audio");
if(quizAudio){
    quizAudio.addEventListener("playing",()=>{
        aniQuizAudioPlaying=true;
        if(aniQuizTimer===null && aniQuizRun && !aniQuizAnswered){
            const s=aniQuizRun.settings;
            const total=s.sound+s.extra, start=performance.now();
            aniQuizUpdateTimerBars(s, 0, total);
            const tick=(now)=>{
                const elapsed=(now-start)/1000;
                aniQuizUpdateTimerBars(s, elapsed, total);
                if(elapsed>=s.sound){
                    quizAudio.muted=true;
                }
                if(elapsed>=total){aniQuizTimer=null;aniQuizResolve(false);}
                else{aniQuizTimer=requestAnimationFrame(tick);}
            };
            aniQuizTimer=requestAnimationFrame(tick);
        }
    });
    quizAudio.addEventListener("pause",()=>{
        aniQuizAudioPlaying=false;
    });
}
document.querySelectorAll("#quiz-setup-form select, #quiz-setup-form input").forEach(el => {
    el.addEventListener("change", () => {
        if (typeof aniQuizUpdateSettingsPreview === "function") aniQuizUpdateSettingsPreview();
    });
});
document.getElementById("quiz-start").addEventListener("click",aniQuizStart);
document.getElementById("quiz-submit").addEventListener("click",()=>aniQuizResolve(aniQuizAccepted(aniQuizCurrent).includes(aniQuizNorm(document.getElementById("quiz-answer").value))));
document.getElementById("quiz-answer").addEventListener("keydown",e=>{
    if(e.key==="Enter"){
        e.preventDefault();
        if(aniQuizRevealing){aniQuizAdvanceReveal();return;}
        const suggestions=document.getElementById("quiz-suggestions");
        const choices=[...suggestions.querySelectorAll("button")];
        if(!suggestions.classList.contains("hidden") && aniQuizSuggestionIndex>=0 && choices[aniQuizSuggestionIndex]){
            choices[aniQuizSuggestionIndex].click();return;
        }
        document.getElementById("quiz-submit").click();
    }
});
document.getElementById("quiz-skip").addEventListener("click",()=>{if(aniQuizRevealing)aniQuizAdvanceReveal();else aniQuizResolve(false);});
const quizEndModal = document.getElementById("quiz-end-modal");
const closeQuizEndModal = () => quizEndModal?.classList.add("hidden");

document.getElementById("quiz-end").addEventListener("click", () => {
    quizEndModal?.classList.remove("hidden");
    document.getElementById("quiz-end-confirm")?.focus();
});

document.getElementById("quiz-end-cancel")?.addEventListener("click", closeQuizEndModal);

quizEndModal?.addEventListener("click", (e) => {
    if (e.target === quizEndModal) closeQuizEndModal();
});

document.getElementById("quiz-end-confirm")?.addEventListener("click", () => {
    closeQuizEndModal();
    aniQuizClearTimers();
    document.getElementById("quiz-audio").pause();
    aniQuizIndex = aniQuizRun.songs.length;
    aniQuizFinish();
});
let aniQuizSuggestionIndex=-1;
document.getElementById("quiz-answer").addEventListener("keydown",e=>{
    const wrap=document.getElementById("quiz-suggestions"), items=[...wrap.querySelectorAll("button")];
    if(!items.length)return;
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){
        e.preventDefault();aniQuizSuggestionIndex=(aniQuizSuggestionIndex+(e.key==="ArrowDown"?1:-1)+items.length)%items.length;
        items.forEach((b,i)=>b.classList.toggle("bg-indigo-100",i===aniQuizSuggestionIndex));
        items[aniQuizSuggestionIndex].scrollIntoView({block:"nearest"});
    }
    if(e.key==="Escape"){wrap.classList.add("hidden");aniQuizSuggestionIndex=-1;}
});
document.getElementById("quiz-answer").addEventListener("input",e=>{
    const wrap=document.getElementById("quiz-suggestions"), q=aniQuizNorm(e.target.value);
    wrap.innerHTML="";aniQuizSuggestionIndex=-1;
    if(!q){wrap.classList.add("hidden");return;}
    const found=aniQuizNames.filter(v=>aniQuizNorm(v).includes(q)).slice(0,6);
    found.forEach(v=>{const b=document.createElement("button");b.type="button";b.className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 truncate";b.textContent=v;b.addEventListener("click",()=>{e.target.value=v;wrap.classList.add("hidden");aniQuizSuggestionIndex=-1;});wrap.append(b);});
    wrap.classList.toggle("hidden",!found.length);
});
const pageNavBtn=document.getElementById("page-nav-btn");
if(pageNavBtn) pageNavBtn.addEventListener("click",()=>{
    const quizPage=document.getElementById("quiz-page"), mainPage=document.getElementById("main-page");
    const openingQuiz=quizPage.classList.contains("hidden");
    if(!openingQuiz && aniQuizRun && aniQuizIndex < aniQuizRun.songs.length && !aniQuizAnswered){
        aniQuizClearTimers();
        document.getElementById("quiz-audio").pause();
        aniQuizIndex = aniQuizRun.songs.length;
        aniQuizFinish();
    }
    quizPage.classList.toggle("hidden",!openingQuiz);
    mainPage.classList.toggle("hidden",openingQuiz);
    pageNavBtn.setAttribute("aria-label",openingQuiz?"Home":"Quiz");
    pageNavBtn.title=openingQuiz?"Home":"Quiz";
    document.getElementById("page-nav-icon").innerHTML=openingQuiz
        ? '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'
        : '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
    window.scrollTo({top:0,behavior:"instant"});
});
loadAniQuizData();