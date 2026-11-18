function buildClientGlobalBuckets() {
    const buckets = {};
    RARITIES.forEach(r => {buckets[r.tier] = []});

    for (const c of characterPool) {buckets[c.rarity.tier].push(c)}
    RARITIES.forEach(r => {if (buckets[r.tier].length === 0 && characterPool.length > 0) buckets[r.tier].push(characterPool[0])});

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
            if (tierMap[RARITIES[d].tier].length > 0) {
                tierMap[r.tier] = tierMap[RARITIES[d].tier];
                return;
            }
        }

        for (let u = idx - 1; u >= 0; u--) {
            if (tierMap[RARITIES[u].tier].length > 0) {
                tierMap[r.tier] = tierMap[RARITIES[u].tier];
                return;
            }
        }

        tierMap[r.tier] = globalBuckets[r.tier];
    });

    return tierMap;
}

function selectClientRarityTier(guaranteeTier, customRarities = RARITIES) {
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
        if (rand < cumulative) { selected = r.tier; break; }
    }

    return selected;
}

function handleGuestGachaAction(payload) {
    const action        = payload.action;
    const rolledResults = [];

    if (action === "SUMMON") {
        const bannerType    = payload.bannerType || "STANDARD";
        const isThemed      = ALL_THEMED_KEYS.includes(bannerType);
        const isListBanner  = bannerType === "LIST";

        if (isThemed        && !THEMED_BANNERS[bannerType]?.active)                     return null;
        if (isListBanner    && (!anilistUsername || anilistEligibleKeys.size === 0))    return null;

        const isHOF             = bannerType === "HOF";
        const customRarities    = isHOF ? HOF_RARITIES : RARITIES;
        const globalBuckets     = buildClientGlobalBuckets();

        const categoryTierMap = isThemed
            ? buildClientTierMapFromKeys(THEMED_BANNERS[bannerType].active.eligibleKeys, globalBuckets)
            : (isListBanner ? buildClientTierMapFromKeys(anilistEligibleKeys, globalBuckets) : null);

        for (let i = 0; i < 10; i++) {
            const guaranteeTier     = i === 0 ? (isHOF ? "A" : "B") : null;
            const isCategorySlot    = Boolean(categoryTierMap && i < 5);
            const tier              = selectClientRarityTier(guaranteeTier, customRarities);
            const pool              = isCategorySlot ? categoryTierMap[tier] : globalBuckets[tier];
            const chosen            = pool[Math.floor(Math.random() * pool.length)];
            const count             = (inventory[chosen.uniqueKey] || 0) + 1;

            inventory[chosen.uniqueKey] = count;
            if (AUTO_LOCK_TIERS.has(tier)) lockedCards.add(chosen.uniqueKey);
            sparkPoints[bannerType] = (sparkPoints[bannerType] || 0) + 1;

            if      (isThemed)      THEMED_BANNERS[bannerType].pulls++;
            else if (isListBanner)  listPulls++;
            else if (isHOF)         hofPulls++;
            else                    totalPulls++;

            rolledResults.push({ uniqueKey: chosen.uniqueKey, occurrenceCount: count });
        }
    } else if (action === "SELL") {
        const key = payload.uniqueKey;
        if (inventory[key] > 0 && !lockedCards.has(key)) delete inventory[key];
    } else if (action === "SELL_ALL") {
        for (const [key, count] of Object.entries(inventory)) {if (count > 0 && !lockedCards.has(key)) delete inventory[key]}
    } else if (action === "SPARK") {
        const {bannerType, uniqueKey}   = payload;
        const char                      = characterMap.get(uniqueKey);

        if (!char || !isCharacterSparkableInBanner(char, bannerType))   return null;
        if ((sparkPoints[bannerType] || 0) < char.rarity.sparkCost)     return null;

        sparkPoints [bannerType]    -=  char.rarity.sparkCost;
        inventory   [uniqueKey]     =   (inventory[uniqueKey] || 0) + 1;

        lockedCards.add(uniqueKey);
    } else if (action === "TOGGLE_LOCK") {
        const key = payload.uniqueKey;

        if (inventory[key]) {
            if (lockedCards.has(key))   lockedCards.delete  (key);
            else                        lockedCards.add     (key);
        }
    }

    document.getElementById("unlocked-count").textContent = Object.keys(inventory).length.toLocaleString();

    updateStarsUI           ();
    updateSparkButtonsUI    ();
    renderInventory         ();

    return {rolledResults};
}

let actionInFlight  = false;
let lockInFlight    = false;
let sellInFlight    = false;

function updateLockButtonsUI() {document.querySelectorAll(".lock-card-btn").forEach(btn => {btn.disabled = lockInFlight})}

function updateSellButtonsUI() {
    document.querySelectorAll(".sell-card-btn").forEach(btn => {
        const key       = btn.getAttribute("data-sell-key");
        btn.disabled    = sellInFlight || (key ? lockedCards.has(key) : false);
    });

    updateSellAllUI();
}

async function handleGuestLinkAnilist(username) {
    const query = `
        query ($userName: String) {
            MediaListCollection(userName: $userName, type: ANIME, status_in: [CURRENT, COMPLETED]) {
                user {name}
                lists {entries {mediaId}}
            }
        }
    `;

    const res = await fetch("https://graphql.anilist.co", {
        method  : "POST",
        headers : { "Content-Type": "application/json", "Accept": "application/json" },
        body    : JSON.stringify({query, variables: {userName: username}})
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || json?.errors || !json?.data?.MediaListCollection) {
        alert(json?.errors?.[0]?.message || "Could not fetch AniList user list");
        return null;
    }

    const collection    = json.data.MediaListCollection;
    const ids           = new Set();

    for (const list of collection.lists || []) {for (const entry of list.entries || []) if (entry?.mediaId) ids.add(normalizeId(entry.mediaId))}

    anilistUsername         = collection.user?.name || username;
    viewerAnilistUsername   = anilistUsername;
    anilistAnimeIds         = ids;

    rebuildAnilistEligibleKeys  ();
    applyDailyBanners           (lastDailyBannersPayload || getClientDailyBanners());
    updateHeaderProfileUI       ();
    renderInventory             ();

    if (lastResults.length > 0 && !document.getElementById("results-section").classList.contains("hidden")) renderResults(lastResults, false, lastBannerType);
    return {ok: true};
}

async function sendGachaAction(payload) {
    if (!currentUser) {
        if (!databaseReady)                     return null;
        if (payload.action === "LINK_ANILIST")  return await handleGuestLinkAnilist(payload.anilistUsername);

        return handleGuestGachaAction(payload);
    }

    if (actionInFlight) return null;
    actionInFlight = true;

    updateStarsUI           ();
    updateSparkButtonsUI    ();

    try {
        const {data, error} = await sb.functions.invoke("AniGacha-Japan", {body: payload});

        if (error || data?.error) {
            let serverMsg   = data?.error;
            let statusInfo  = "";

            if (!serverMsg && error?.context) {
                if (typeof error.context.text === "function") {
                    const status = error.context.status;
                    if (status) statusInfo = `HTTP ${status}`;

                    const rawText = await error.context.text().catch(() => "");

                    if (rawText) {
                        try {
                            const parsed    = JSON.parse(rawText);
                            serverMsg       = parsed?.error || parsed?.message || rawText;
                        } catch {serverMsg  = rawText.slice(0, 160);}
                    }
                } else if (error.context.message) serverMsg = error.context.message;
            }

            const detail    = serverMsg || error?.message || "Unknown error";
            const prefix    = [payload.action, statusInfo].filter(Boolean).join(" • ");
            const fullMsg   = `${prefix}: ${detail}`;

            console.error("Server action failed:", fullMsg, error);
            if (payload.action !== "INIT") alert(fullMsg)
            return null;
        }

        if (data.dailyBanners) lastDailyBannersPayload = data.dailyBanners;

        if      (data.save)         applySaveState      (data.save);
        else if (data.dailyBanners) applyDailyBanners   (data.dailyBanners);

        return data;
    } finally {
        actionInFlight = false;

        updateStarsUI           ();
        updateSparkButtonsUI    ();
    }
}

const ALL_THEMED_KEYS = Object.keys(THEMED_BANNERS);
ALL_THEMED_KEYS.forEach(key => document.getElementById(THEMED_BANNERS[key].cardElId).classList.add("hidden"));