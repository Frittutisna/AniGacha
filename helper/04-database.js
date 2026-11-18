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

            const romaji        = getField(row, ["romaji", "title_romaji", "title"]);
            const english       = getField(row, ["english", "title_english"]);
            const animeCount    = parseFloat(getField(row, ["count", "favorites", "favourites", "popularity"])) || 0;
            const animeDate     = parseAnimeDate(row);
            const rawDateInt    = parseRawDateInt(row);
            const rootId        = normalizeId(getField(row, ["root_id", "root_anime_id", "root"]));
            const parentId      = normalizeId(getField(row, ["parent_id", "prequel_id", "parent_anime_id", "source_anime_id"]));
            const genres        = new Set(parseCSVList(getField(row, ["genres", "genre"])));
            const tags          = new Set(parseCSVList(getField(row, ["tags", "tag"])));
            const studios       = new Set(parseCSVList(getField(row, ["studios", "studio"])));
            const source        = getField(row, ["source"]);

            animeMap.set(id, {id, romaji, english, animeCount, animeDate, rawDateInt, rootId, parentId, genres, tags, studios, source});
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

        characterPool   = chars;
        characterMap    = new Map(chars.map(c => [c.uniqueKey, c]));

        rebuildAnilistEligibleKeys();

        const eraOptions = rawEras.map(row => {
            const title                 = getField(row, ["era", "name"]);
            const startRaw              = getField(row, ["start"]);
            const endRaw                = getField(row, ["end"]);
            const startYear             = startRaw !== null ? Math.floor(Number(startRaw)) : null;
            const endYear               = endRaw !== null ? Math.floor(Number(endRaw)) : null;
            const hasStart              = startYear !== null && !Number.isNaN(startYear);
            const hasEnd                = endYear !== null && !Number.isNaN(endYear);
            const startDate             = hasStart ? Number(`${startYear}0101`) : -Infinity;
            const endDate               = hasEnd ? Number(`${endYear}9999`) : Infinity;
            const matching              = chars.filter(c => c.rawDateInt !== null && c.rawDateInt >= startDate && c.rawDateInt <= endDate);
            const isUnboundedOrDecade   = title === "Pre-2000s" || title === "2000s";
            const hoverLabel            = (title && hasStart && hasEnd && !isUnboundedOrDecade) ? `${title} (${startYear}-${endYear})` : title;
            const sortOrder             = hasStart ? startYear : -Infinity;

            return title ? {
                title,
                hoverLabel,
                sortOrder,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);

        THEMED_BANNERS.ERA.allOptions = eraOptions;

        const franchiseOptions = rawFranchises.map(row => {
            const title         = getField(row, ["clean", "franchise", "name"]);
            const relatedIds    = new Set(parseCSVList(getField(row, ["related"])).map(normalizeId).filter(Boolean));

            const rootId = normalizeId(getField(row, ["id"]));
            if (rootId) relatedIds.add(rootId);

            const matching = chars.filter(c =>
                (c.animeId      && relatedIds.has(c.animeId)) ||
                (c.rootAnimeId  && relatedIds.has(c.rootAnimeId))
            );

            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);

        THEMED_BANNERS.FRANCHISE.allOptions = franchiseOptions;

        const genreOptions = rawGenres.map(row => {
            const title     = getField(row, ["genre", "name"]);
            const matching  = title ? chars.filter(c => c.genres.has(title)) : [];

            return title ? {
                title,
                eligibleKeys: new Set(matching.map(c => c.uniqueKey)),
            } : null;
        }).filter(Boolean);

        THEMED_BANNERS.GENRE.allOptions = genreOptions;

        const sourceOptions = rawSources.map(row => {
            const title     = getField(row, ["source", "name"]);
            const matching  = title ? chars.filter(c => c.source === title) : [];

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
            const rawTag    = getField(row, ["tag"]);
            const title     = getField(row, ["clean", "tag", "name"]);
            const matching  = rawTag ? chars.filter(c => c.tags.has(rawTag)) : [];

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

            if (currentUser) await loadCloudSave(currentUser);
            else {
                updateHeaderProfileUI   ();
                updateStarsUI           ();
            }
        } else {
            applyDailyBanners(getClientDailyBanners());
            if (currentUser) await loadCloudSave(currentUser);

            updateHeaderProfileUI   ();
            updateSparkButtonsUI    ();
            updateStarsUI           ();
            renderInventory         ();
            hintBannerSwipe         ();
        }
    } catch (err) {
        console.error(err);

        document.getElementById("error-banner").classList.remove("hidden");
        document.getElementById("error-detail").textContent = err.message;
    }
}