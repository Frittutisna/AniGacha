let lastIsMobile = window.innerWidth < 640;

window.addEventListener("resize", () => {
    const isMobile = window.innerWidth < 640;

    if (isMobile !== lastIsMobile) {
        lastIsMobile = isMobile;
        renderInventory();
    }
});

document.getElementById("pull-10").                 addEventListener("click", () => performSummon   (10, "STANDARD"));
document.getElementById("pull-era-10").             addEventListener("click", () => performSummon   (10, "ERA"));
document.getElementById("pull-franchise-10").       addEventListener("click", () => performSummon   (10, "FRANCHISE"));
document.getElementById("pull-genre-10").           addEventListener("click", () => performSummon   (10, "GENRE"));
document.getElementById("pull-source-10").          addEventListener("click", () => performSummon   (10, "SOURCE"));
document.getElementById("pull-studio-10").          addEventListener("click", () => performSummon   (10, "STUDIO"));
document.getElementById("pull-tag-10").             addEventListener("click", () => performSummon   (10, "TAG"));
document.getElementById("pull-hof-10").             addEventListener("click", () => performSummon   (10, "HOF"));
document.getElementById("pull-list-10")?.           addEventListener("click", () => performSummon   (10, "LIST"));
document.getElementById("spark-standard").          addEventListener("click", () => enterSparkMode  ("STANDARD"));
document.getElementById("spark-era").               addEventListener("click", () => enterSparkMode  ("ERA"));
document.getElementById("spark-franchise").         addEventListener("click", () => enterSparkMode  ("FRANCHISE"));
document.getElementById("spark-genre").             addEventListener("click", () => enterSparkMode  ("GENRE"));
document.getElementById("spark-source").            addEventListener("click", () => enterSparkMode  ("SOURCE"));
document.getElementById("spark-studio").            addEventListener("click", () => enterSparkMode  ("STUDIO"));
document.getElementById("spark-tag").               addEventListener("click", () => enterSparkMode  ("TAG"));
document.getElementById("spark-hof").               addEventListener("click", () => enterSparkMode  ("HOF"));
document.getElementById("spark-list")?.             addEventListener("click", () => enterSparkMode  ("LIST"));
document.getElementById("spark-mode-indicator").    addEventListener("click",  exitSparkMode);

const sellAllModal      = document.getElementById("sell-all-modal");
const closeSellAllModal = () => sellAllModal?.classList.add("hidden");

document.getElementById("sell-all-btn").addEventListener("click", () => {
    if (document.getElementById("sell-all-btn").disabled) return;
    document.getElementById("sell-all-modal-amount").textContent = document.getElementById("sell-all-amount").textContent;

    sellAllModal?.classList.remove("hidden");
    document.getElementById("sell-all-confirm")?.focus();
});

document.getElementById("sell-all-cancel")?.addEventListener("click", closeSellAllModal);

sellAllModal?.addEventListener("click", (e) => {if (e.target === sellAllModal) closeSellAllModal()});

document.getElementById("sell-all-confirm")?.addEventListener("click", () => {
    closeSellAllModal   ();
    sellAllUnlocked     ();
});

document.getElementById("results-grid").addEventListener("click", (e) => {
    const lockBtn = e.target.closest(".lock-card-btn");

    if (lockBtn && !lockBtn.disabled) {
        const key = lockBtn.getAttribute("data-lock-key");
        if (key) toggleCardLock(key);
    }
});

document.getElementById("inventory-grid").addEventListener("click", (e) => {
    const lockBtn = e.target.closest(".lock-card-btn");

    if (lockBtn && !lockBtn.disabled) {
        hideResultsSection();

        const key = lockBtn.getAttribute("data-lock-key");
        if (key) toggleCardLock(key);

        return;
    }

    const sparkBtn = e.target.closest(".spark-card-btn");

    if (sparkBtn && !sparkBtn.disabled) {
        hideResultsSection();

        const key = sparkBtn.getAttribute("data-spark-key");
        if (key) sparkCharacter(key);

        return;
    }

    const sellBtn = e.target.closest(".sell-card-btn");

    if (sellBtn && !sellBtn.disabled) {
        hideResultsSection();

        const key = sellBtn.getAttribute("data-sell-key");
        if (key) sellCharacter(key);
    }
});

document.getElementById("clear-results").addEventListener("click", hideResultsSection);

const searchInput       = document.getElementById("search-input");
const clearSearchBtn    = document.getElementById("clear-search");
let searchDebounceId    = null;

searchInput.addEventListener("input", () => {
    clearSearchBtn.classList.toggle("hidden", searchInput.value === "");
    clearTimeout(searchDebounceId);
    searchDebounceId = setTimeout(resetPageAndRender, 250);
});

clearSearchBtn.addEventListener("click", () => {
    clearTimeout(searchDebounceId);
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    searchInput.focus();
    resetPageAndRender();
});

document.querySelectorAll(".first-page").forEach(btn => btn.addEventListener("click", () => {if (currentPage > 1) {
    hideResultsSection();
    currentPage = 1;
    renderInventory();
}}));

document.querySelectorAll(".prev-page").forEach(btn => btn.addEventListener("click", () => {if (currentPage > 1) {
    hideResultsSection();
    currentPage--;
    renderInventory();
}}));

document.querySelectorAll(".next-page").forEach(btn => btn.addEventListener("click", () => {
    if (currentPage < totalPages) {
        hideResultsSection();
        currentPage++;
        renderInventory();
    }
}));

document.querySelectorAll(".last-page").forEach(btn => btn.addEventListener("click", () => {if (currentPage < totalPages) {
    hideResultsSection();
    currentPage = totalPages;
    renderInventory();
}}));

document.querySelectorAll(".page-input").forEach(input => input.addEventListener("change", (e) => {
    hideResultsSection();

    const val = parseInt(e.target.value, 10);
    if (!Number.isNaN(val)) currentPage = Math.min(Math.max(1, val), totalPages);

    renderInventory();
}));

function hintBannerSwipe() {
    const carousel = document.getElementById("banner-carousel");
    if (!carousel || window.innerWidth >= 1024 || carousel.scrollLeft > 0) return;

    let cancelled   = false;
    let rafId       = null;

    const cancel = () => {
        cancelled = true;
        if (rafId) cancelAnimationFrame(rafId);
        carousel.classList.add("snap-x");
    };

    carousel.addEventListener("touchstart", cancel, { once: true, passive: true });
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const animateScroll = (from, to, duration, onComplete) => {
        const start = performance.now();

        const step = (now) => {
            if (cancelled) return;

            const progress = Math.min((now - start) / duration, 1);
            carousel.scrollLeft = from + (to - from) * easeInOutCubic(progress);

            if      (progress < 1)  rafId = requestAnimationFrame(step);
            else if (onComplete)    onComplete();
        };

        rafId = requestAnimationFrame(step);
    };

    setTimeout(() => {
        if (cancelled) return;
        carousel.classList.remove("snap-x");

        const maxScroll = carousel.scrollWidth - carousel.clientWidth;

        if (maxScroll <= 0) {
            carousel.classList.add("snap-x");
            return;
        }

        animateScroll(0, maxScroll, 1500, () => {
            setTimeout(() => {
                if (cancelled) return;
                animateScroll(maxScroll, 0, 1400, () => {carousel.classList.add("snap-x")});
            }, 500);
        });
    }, 500);
}

document.getElementById("login-btn").addEventListener("click", async () => {await sb.auth.signInWithOAuth({
    provider    : "discord",
    options     : {redirectTo: window.location.origin + window.location.pathname}
})});

const logoutModal       = document.getElementById("logout-modal");
const closeLogoutModal  = () => logoutModal?.classList.add("hidden");

document.getElementById("logout-btn").addEventListener("click", () => {
    if (!currentUser) return;

    logoutModal?.classList.remove("hidden");
    document.getElementById("logout-confirm")?.focus();
});

document.getElementById("logout-cancel")?.addEventListener("click", closeLogoutModal);

logoutModal?.addEventListener("click", (e) => {if (e.target === logoutModal) closeLogoutModal()});

document.getElementById("logout-confirm")?.addEventListener("click", async () => {
    closeLogoutModal();
    document.getElementById("photo-modal")?.classList.add("hidden");
    if (currentUser) await sb.auth.signOut();
});

document.getElementById("daily-stars-btn").addEventListener("click", async () => {
    if (!currentUser) return;
    const todayJst = getCurrentJstDate();

    if (activeDailyJstDate && todayJst !== activeDailyJstDate) {
        await sendGachaAction({action: "INIT"});
        return;
    }

    await sendGachaAction({action: "CLAIM_DAILY_STARS"});
});