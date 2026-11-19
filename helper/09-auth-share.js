async function loadSharedCollection(targetUserId) {
    const {data, error} = await sb.functions.invoke("AniGacha-Japan", {body: {action: "GET_SHARED_PROFILE", userId: targetUserId}});

    if (error || !data?.profile) {
        alert("Could not load shared collection; link may be invalid");
        window.location.href = window.location.origin + window.location.pathname;
        return;
    }

    const profile   = data.profile;
    inventory       = profile.inventory                 || {};
    lockedCards     = new Set(profile.lockedCards       || []);
    anilistUsername = profile.anilistUsername           || null;
    anilistAnimeIds = new Set((profile.anilistAnimeIds  || []).map(v => normalizeId(v)).filter(Boolean));

    rebuildAnilistEligibleKeys();

    const topSection = document.getElementById("gacha-top-section");
    topSection.classList.add("hidden");
    topSection.classList.remove("flex", "lg:grid");
    document.getElementById("sell-all-btn").classList.add("hidden");

    const sharedBanner = document.getElementById("shared-view-banner");
    sharedBanner.classList.remove("hidden");
    document.getElementById("shared-username").textContent = profile.displayName || "Player";

    const anilistLink = document.getElementById("shared-anilist-link");

    if (anilistUsername) {
        anilistLink.textContent = `AniList: ${anilistUsername}`;
        anilistLink.href        = `https://anilist.co/user/${encodeURIComponent(anilistUsername)}`;

        anilistLink.classList.remove("hidden");
    }

    const frame         = document.getElementById("shared-photo-frame");
    const img           = document.getElementById("shared-photo-img");
    const placeholder   = document.getElementById("shared-photo-placeholder");
    const photo         = profile.profilePhoto;
    frame.className     = `w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl overflow-hidden ${getRarityBgClass(photo?.tier)} ${getRarityBorderClass(photo?.tier)} flex items-center justify-center shrink-0`;
    const char          = photo?.uniqueKey ? characterMap.get(photo.uniqueKey) : null;

    if (char && char.imageUrl) {
        img.src             = char.imageUrl;
        img.style.cssText   = buildPhotoTransformStyle(photo);

        img         .classList.remove   ("hidden");
        placeholder .classList.add      ("hidden");
    }

    document.getElementById("unlocked-count").textContent = Object.keys(inventory).length.toLocaleString();
    renderInventory();
}

document.getElementById("exit-shared-btn")?.addEventListener("click", () => {window.location.href = window.location.origin + window.location.pathname});
const shareModal = document.getElementById("share-modal");

document.getElementById("share-collection-btn")?.addEventListener("click", async () => {
    if (!currentUser || !shareModal) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(currentUser.id)}`;

    try {
        await navigator.clipboard.writeText(shareUrl);
        shareModal.classList.remove("hidden");
    } catch {prompt("Copy your collection share link:", shareUrl)}
});

shareModal?.addEventListener("click", (e) => {if (e.target === shareModal) shareModal.classList.add("hidden")});

async function loadCloudSave(user) {
    currentUser = user;
    discordName = user.user_metadata?.full_name || user.user_metadata?.name || "Account";

    document.getElementById("header-username").textContent = displayName || discordName;

    document.getElementById("header-logged-out")    .classList.add      ("hidden");
    document.getElementById("header-logged-in")     .classList.remove   ("hidden");
    document.getElementById("share-collection-btn") .classList.remove   ("hidden");

    await sendGachaAction({action: "INIT", discordName});
}

sb.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
        const isSameUser    = currentUser?.id === session.user.id;
        currentUser         = session.user;

        if (event === "TOKEN_REFRESHED" && isSameUser)  return;
        if (databaseReady)                              loadCloudSave(session.user);
    } else {
        currentUser         = null;
        activeDailyJstDate  = null;

        if (typeof aniQuizAbortToHome === "function") aniQuizAbortToHome();

        document.getElementById("header-logged-in")     .classList.add      ("hidden");
        document.getElementById("header-logged-out")    .classList.remove   ("hidden");
        document.getElementById("share-collection-btn") .classList.add      ("hidden");
        document.getElementById("photo-modal")          .classList.add      ("hidden");

        if (isSharedView) {
            viewerAnilistUsername   = null;
            displayName             = null;
            profilePhoto            = null;

            updateHeaderProfileUI   ();
            updateStarsUI           ();

            return;
        }

        document.getElementById("results-section").classList.add("hidden");
        if (activeSparkBanner) exitSparkMode();

        applySaveState({
            stars                       : 0,
            inventory                   : {},
            lockedCards                 : [],
            sparkPoints                 : {STANDARD: 0, ERA: 0, FRANCHISE: 0, GENRE: 0, SOURCE: 0, STUDIO: 0, TAG: 0, HOF: 0, LIST: 0},
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
            lastAnilistChangeJstYear    : null
        });

        if (databaseReady) applyDailyBanners(getClientDailyBanners());
    }
});

initDatabase();