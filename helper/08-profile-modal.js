const anilistModal      = document.getElementById("anilist-modal");
const anilistModalForm  = document.getElementById("anilist-modal-form");
const anilistModalInput = document.getElementById("anilist-modal-input");
const anilistModalError = document.getElementById("anilist-modal-error");
const submitAnilistBtn  = document.getElementById("submit-anilist-btn");

function closeAnilistModal() {
    anilistModal?.classList.add("hidden");
    if (anilistModalError) anilistModalError.classList.add("hidden");
}

document.getElementById("anilist-header-btn")?.addEventListener("click", () => {
    if (!databaseReady || anilistUsername || !anilistModal) return;

    anilistModalInput.value     = "";
    submitAnilistBtn.disabled   = true;

    anilistModalError   .classList.add      ("hidden");
    anilistModal        .classList.remove   ("hidden");

    anilistModalInput.focus();
});

anilistModalInput?.addEventListener("input", () => {
    submitAnilistBtn.disabled = anilistModalInput.value.trim() === "";
    anilistModalError.classList.add("hidden");
});

anilistModal?.addEventListener("click", (e) => {if (e.target === anilistModal) closeAnilistModal()});

anilistModalForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const trimmed = anilistModalInput.value.trim();
    if (!trimmed || submitAnilistBtn.disabled) return;

    submitAnilistBtn.disabled       = true;
    submitAnilistBtn.textContent    = "Linking";

    anilistModalError.classList.add("hidden");

    const res = await sendGachaAction({action: "LINK_ANILIST", anilistUsername: trimmed});

    submitAnilistBtn.textContent    = "Link";
    submitAnilistBtn.disabled       = anilistModalInput.value.trim() === "";

    if (res) closeAnilistModal();
    else {
        anilistModalError.textContent = "Could not fetch AniList user";
        anilistModalError.classList.remove("hidden");
    }
});

let draftPhoto = {uniqueKey: null, tier: null, x: 0, y: 0, zoom: 1, rotate: 0};

function snapTargets(val, targets, threshold) {
    for (const target of targets) {if (Math.abs(val - target) <= threshold) return target;}
    return val;
}

function clampVal(val, min, max, fallback) {return Number.isFinite(val) ? Math.min(Math.max(val, min), max) : fallback}

function updatePhotoModalPreview() {
    const frame             = document.getElementById("photo-preview-frame");
    const img               = document.getElementById("photo-preview-img");
    const placeholder       = document.getElementById("photo-preview-placeholder");
    const saveBtn           = document.getElementById("save-photo-btn");
    const nameInput         = document.getElementById("profile-name-input");
    const changesEl         = document.getElementById("name-changes-left");
    const anilistIcon       = document.getElementById("profile-anilist-icon");
    const anilistInput      = document.getElementById("profile-anilist-input");
    const unlinkBtn         = document.getElementById("unlink-anilist-btn");
    const anilistChanges    = document.getElementById("anilist-changes-left");
    const rawName           = nameInput.value.trim();
    const effective         = rawName || discordName;
    const currentName       = displayName || discordName;
    const nameChanged       = effective !== currentName;
    const isFreeName        = isFreeDiscordNameVariant(effective);
    const canCustom         = hasYearlyNameChangeAvailable();
    changesEl.textContent   = canCustom ? "1" : "0";

    changesEl.className = canCustom
        ? "text-emerald-600 dark:text-emerald-400 text-left font-bold tabular-nums"
        : "text-slate-400 text-left font-bold tabular-nums";

    const isLinked          = Boolean(anilistUsername);
    const rawAnilist        = anilistInput ? anilistInput.value.trim() : "";
    const anilistChanged    = isLinked && rawAnilist !== "" && rawAnilist !== anilistUsername;

    const isFreeAnilist = isLinked && rawAnilist !== "" && (
        rawAnilist.toLowerCase() === anilistUsername.toLowerCase() ||
        isFreeAnilistHistoryVariant(rawAnilist)
    );

    const canAnilistChange  = hasYearlyAnilistChangeAvailable();
    const anilistAllowed    = !anilistChanged || isFreeAnilist || canAnilistChange;

    if (anilistIcon && anilistInput && unlinkBtn && anilistChanges) {
        anilistIcon     .classList.toggle("hidden", !isLinked);
        anilistInput    .classList.toggle("hidden", !isLinked);
        unlinkBtn       .classList.toggle("hidden", !isLinked);
        anilistChanges  .classList.toggle("hidden", !isLinked);

        anilistChanges.textContent = canAnilistChange ? "1" : "0";

        anilistChanges.className   = `${isLinked ? "" : "hidden "}${canAnilistChange
            ? "text-emerald-600 dark:text-emerald-400 text-left font-bold tabular-nums"
            : "text-slate-400 text-left font-bold tabular-nums"}`;
    }

    document.getElementById("photo-x").value        = draftPhoto.x;
    document.getElementById("photo-y").value        = draftPhoto.y;
    document.getElementById("photo-zoom").value     = draftPhoto.zoom;
    document.getElementById("photo-rotate").value   = draftPhoto.rotate;

    if (document.activeElement?.id !== "photo-x-input")         document.getElementById("photo-x-input")        .value = draftPhoto.x;
    if (document.activeElement?.id !== "photo-y-input")         document.getElementById("photo-y-input")        .value = draftPhoto.y;
    if (document.activeElement?.id !== "photo-zoom-input")      document.getElementById("photo-zoom-input")     .value = draftPhoto.zoom;
    if (document.activeElement?.id !== "photo-rotate-input")    document.getElementById("photo-rotate-input")   .value = draftPhoto.rotate;

    const char      = draftPhoto.uniqueKey ? characterMap.get(draftPhoto.uniqueKey) : null;
    const tier      = char ? char.rarity.tier : draftPhoto.tier;
    frame.className = `h-0 min-h-full aspect-square rounded-xl overflow-hidden ${getRarityBgClass(tier)} ${getRarityBorderClass(tier)} flex items-center justify-center`;

    if (char && char.imageUrl) {
        img.src = char.imageUrl;
        img.style.cssText = buildPhotoTransformStyle(draftPhoto);

        img         .classList.remove   ("hidden");
        placeholder .classList.add      ("hidden");
    } else {
        img         .classList.add      ("hidden");
        placeholder .classList.remove   ("hidden");
    }

    const hasValidPhoto = Boolean(draftPhoto.uniqueKey && inventory[draftPhoto.uniqueKey] > 0);

    const photoChanged = hasValidPhoto && (
        !profilePhoto                                       ||
        profilePhoto.uniqueKey  !== draftPhoto.uniqueKey    ||
        profilePhoto.x          !== draftPhoto.x            ||
        profilePhoto.y          !== draftPhoto.y            ||
        profilePhoto.zoom       !== draftPhoto.zoom         ||
        profilePhoto.rotate     !== draftPhoto.rotate
    );

    const nameAllowed       = !nameChanged || isFreeName || canCustom;
    const hasSomethingSave  = (hasValidPhoto || !draftPhoto.uniqueKey) && (photoChanged || nameChanged || anilistChanged);
    saveBtn.disabled        = !nameAllowed || !anilistAllowed || !hasSomethingSave;
}

function renderPhotoPickerGrid() {
    const grid  = document.getElementById("photo-char-grid");
    const query = document.getElementById("photo-char-search").value.trim().toLowerCase();

    const ownedChars = characterPool.filter(c => {
        if (!(inventory[c.uniqueKey] > 0) || !c.imageUrl)   return false;
        if (!query)                                         return true;

        return c.name.toLowerCase().includes(query) ||
               (c.animeRomaji   && c.animeRomaji    .toLowerCase().includes(query)) ||
               (c.animeEnglish  && c.animeEnglish   .toLowerCase().includes(query));
    });

    if (ownedChars.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-6 text-xs text-slate-500">No owned characters found</div>`;
        return;
    }

    grid.innerHTML = ownedChars.slice(0, 100).map(c => {
        const selected = draftPhoto.uniqueKey === c.uniqueKey ? "ring-2 ring-indigo-500" : "";

        return `
            <button type="button" data-pick-photo="${escapeHTML(c.uniqueKey)}" title="${escapeHTML(c.name)}"
                class="aspect-square rounded-lg overflow-hidden ${c.rarity.border} ${selected} bg-slate-200 dark:bg-slate-800 hover:scale-105 transition">
                <img src="${c.imageUrl}" alt="${escapeHTML(c.name)}" loading="lazy" class="w-full h-full object-cover object-top"/>
            </button>
        `;
    }).join("");
}

document.getElementById("profile-btn").addEventListener("click", () => {
    if (!currentUser || !databaseReady) return;
    draftPhoto = profilePhoto ? {...profilePhoto} : {uniqueKey: null, tier: null, x: 0, y: 0, zoom: 1, rotate: 0};

    const nameInput         = document.getElementById("profile-name-input");
    nameInput.value         = displayName || discordName;
    nameInput.placeholder   = discordName;

    const anilistInput = document.getElementById("profile-anilist-input");
    if (anilistInput) anilistInput.value = anilistUsername || "";

    document.getElementById("photo-char-search").value = "";

    updatePhotoModalPreview ();
    renderPhotoPickerGrid   ();

    document.getElementById("photo-modal").classList.remove("hidden");
});

document.getElementById("profile-name-input").      addEventListener("input", updatePhotoModalPreview);
document.getElementById("profile-anilist-input")?.  addEventListener("input", updatePhotoModalPreview);

document.getElementById("unlink-anilist-btn")?.addEventListener("click", async () => {
    if (!currentUser || !anilistUsername) return;

    const res = await sendGachaAction({action: "UNLINK_ANILIST"});
    if (res) updatePhotoModalPreview();
});

document.getElementById("photo-modal")          .addEventListener("click", (e) => {if (e.target.id === "photo-modal") document.getElementById("photo-modal").classList.add("hidden")});
document.getElementById("photo-char-search")    .addEventListener("input", renderPhotoPickerGrid);

document.getElementById("photo-char-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick-photo]");
    if (!btn) return;

    const key = btn.getAttribute("data-pick-photo");

    const char = characterMap.get(key);
    if (!char) return;

    draftPhoto.uniqueKey    = key;
    draftPhoto.tier         = char.rarity.tier;

    updatePhotoModalPreview ();
    renderPhotoPickerGrid   ();
});

document.getElementById("photo-x").addEventListener("input", (e) => {
    draftPhoto.x = snapTargets(Number(e.target.value), [0], 6);
    updatePhotoModalPreview();
});

document.getElementById("photo-y").addEventListener("input", (e) => {
    draftPhoto.y = snapTargets(Number(e.target.value), [0], 6);
    updatePhotoModalPreview();
});

document.getElementById("photo-zoom").addEventListener("input", (e) => {
    draftPhoto.zoom = Number(e.target.value);
    updatePhotoModalPreview();
});

document.getElementById("photo-rotate").addEventListener("input", (e) => {
    draftPhoto.rotate = snapTargets(Number(e.target.value), [-90, 0, 90], 8);
    updatePhotoModalPreview();
});

document.getElementById("photo-x-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;

    draftPhoto.x = clampVal(Number(raw), -100, 100, 0);
    updatePhotoModalPreview();
});

document.getElementById("photo-x-input").addEventListener("change", (e) => {
    draftPhoto.x = clampVal(Number(e.target.value), -100, 100, 0);
    e.target.value = draftPhoto.x;
    updatePhotoModalPreview();
});

document.getElementById("photo-y-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;

    draftPhoto.y = clampVal(Number(raw), -100, 100, 0);
    updatePhotoModalPreview();
});

document.getElementById("photo-y-input").addEventListener("change", (e) => {
    draftPhoto.y = clampVal(Number(e.target.value), -100, 100, 0);
    e.target.value = draftPhoto.y;
    updatePhotoModalPreview();
});

document.getElementById("photo-zoom-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "") return;

    draftPhoto.zoom = clampVal(Number(raw), 1, 3, 1);
    updatePhotoModalPreview();
});

document.getElementById("photo-zoom-input").addEventListener("change", (e) => {
    draftPhoto.zoom = clampVal(Number(e.target.value), 1, 3, 1);
    e.target.value = draftPhoto.zoom;
    updatePhotoModalPreview();
});

document.getElementById("photo-rotate-input").addEventListener("input", (e) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") return;

    draftPhoto.rotate = clampVal(Number(raw), -180, 180, 0);
    updatePhotoModalPreview();
});

document.getElementById("photo-rotate-input").addEventListener("change", (e) => {
    draftPhoto.rotate = clampVal(Number(e.target.value), -180, 180, 0);
    e.target.value = draftPhoto.rotate;
    updatePhotoModalPreview();
});

document.getElementById("reset-photo-transform").addEventListener("click", () => {
    draftPhoto.x        = 0;
    draftPhoto.y        = 0;
    draftPhoto.zoom     = 1;
    draftPhoto.rotate   = 0;

    updatePhotoModalPreview();
});

document.getElementById("save-photo-btn").addEventListener("click", async () => {
    const rawName       = document.getElementById("profile-name-input").value.trim();
    const effective     = rawName || discordName;
    const currentName   = displayName || discordName;
    const nameChanged   = effective !== currentName;

    if (nameChanged && !isFreeDiscordNameVariant(effective) && !hasYearlyNameChangeAvailable()) {
        alert("You have already used your custom name change this year (resets Jan 1 JST)");
        return;
    }

    const rawAnilist        = document.getElementById("profile-anilist-input")?.value.trim() || "";
    const anilistChanged    = Boolean(anilistUsername && rawAnilist && rawAnilist !== anilistUsername);

    const isFreeAnilist = Boolean(anilistUsername && rawAnilist && (
        rawAnilist.toLowerCase() === anilistUsername.toLowerCase() ||
        isFreeAnilistHistoryVariant(rawAnilist)
    ));

    if (anilistChanged && !isFreeAnilist && !hasYearlyAnilistChangeAvailable()) {
        alert("You have already used your AniList account change this year (resets Jan 1 JST)");
        return;
    }

    const payload = {action: "SET_PROFILE", displayName: effective, discordName};
    if (anilistChanged) payload.anilistUsername = rawAnilist

    if (draftPhoto.uniqueKey && inventory[draftPhoto.uniqueKey] > 0) payload.photo = {
        uniqueKey   : draftPhoto.uniqueKey,
        x           : draftPhoto.x,
        y           : draftPhoto.y,
        zoom        : draftPhoto.zoom,
        rotate      : draftPhoto.rotate
    };

    const res = await sendGachaAction(payload);
    if (res) document.getElementById("photo-modal").classList.add("hidden");
});

