async function initDatabase() {
    try {
        const res = await fetch("./supabase/functions/AniGacha-Japan/client-data.json");
        if (!res.ok) throw new Error(`Failed to fetch client-data.json (HTTP ${res.status})`);

        const {animes, chars: rawChars, themedOptions}  = await res.json();
        const rarityByTier                              = new Map(RARITIES.map(r => [r.tier, r]));
        const fallbackRarity                            = RARITIES[RARITIES.length - 1];
        const hydratedAnimes                            = new Map();

        for (const [id, a] of Object.entries(animes)) hydratedAnimes.set(id, {
            animeRomaji : a[0],
            animeEnglish: a[1],
            animeCount  : a[10],
            animeDate   : a[3],
            rawDateInt  : a[4],
            animeYear   : a[4] ? Math.floor(a[4] / 10000) : null,
            rootAnimeId : a[5],
            genres      : new Set(a[6]),
            tags        : new Set(a[7]),
            studios     : new Set(a[8]),
            source      : a[9]
        });

        const chars = rawChars.map(([uniqueKey, name, animeId, imgSuffix, count, tier, deckRank, deckSuit]) => {
            const a         = animeId   ? hydratedAnimes.get(animeId)                                                               : null;
            const imageUrl  = imgSuffix ? (imgSuffix.startsWith("http") ? imgSuffix : IMAGE_PREFIX + imgSuffix.replace(/^\/+/, "")) : null;

            return {
                uniqueKey,
                name,
                animeId,
                rootAnimeId     : a ? a.rootAnimeId         :   animeId,
                animeRomaji     : a ? a.animeRomaji         :   null,
                animeEnglish    : a ? a.animeEnglish        :   null,
                imageUrl,
                count,
                animeCount      : a ? a.animeCount          :   0,
                animeDate       : a ? a.animeDate           :   null,
                rawDateInt      : a ? a.rawDateInt          :   null,
                animeYear       : a ? a.animeYear           :   null,
                genres          : a ? a.genres              :   new Set(),
                tags            : a ? a.tags                :   new Set(),
                studios         : a ? a.studios             :   new Set(),
                source          : a ? a.source              :   null,
                rarity          : rarityByTier.get(tier)    ||  fallbackRarity,
                deckRank        : deckRank                  ||  "2",
                deckSuit        : deckSuit                  ||  "Spades"
            };
        });

        characterPool = chars;
        characterMap  = new Map(chars.map(c => [c.uniqueKey, c]));

        rebuildAnilistEligibleKeys();
        ALL_THEMED_KEYS.forEach(key => {THEMED_BANNERS[key].allOptions = (themedOptions[key] || []).map(opt => ({...opt, eligibleKeys: new Set(opt.idxs.map(idx => chars[idx]?.uniqueKey).filter(Boolean))}))});

        databaseReady = true;
        tabiWarmUp();

        if (isSharedView) {
            await loadSharedCollection(sharedUserId);

            if (currentUser) await loadCloudSave(currentUser);
            else {
                updateHeaderProfileUI   ();
                updateStarsUI           ();
            }
        } else {
            applyDailyBanners(getClientDailyBanners());
            if (currentUser) await loadCloudSave(currentUser);

            updateHeaderProfileUI       ();
            updateSparkButtonsUI        ();
            updateFiftyFiftyButtonsUI   ();
            updateStarsUI               ();
            renderInventory             ();
            hintBannerSwipe             ();
        }
    } catch (err) {
        console.error(err);

        const errorDetailEl = document.getElementById("error-detail");
        if (errorDetailEl) errorDetailEl.textContent = err.message;
    }
}