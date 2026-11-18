const helperFiles = [
    "helper/01-state-banner.js",
    "helper/02-guest.js",
    "helper/03-ui-economy.js",
    "helper/04-database.js",
    "helper/05-summon-inventory.js",
    "helper/06-control-tooltip.js",
    "helper/07-search-response.js",
    "helper/08-profile-modal.js",
    "helper/09-auth-share.js",
];

function loadHelperScripts(index = 0) {
    if (index >= helperFiles.length) return;

    const script    = document.createElement("script");
    script.src      = helperFiles[index];

    script.onload   = () => loadHelperScripts   (index + 1);
    script.onerror  = () => console.error       (`Failed to load helper: ${helperFiles[index]}`);

    document.head.appendChild(script);
}

loadHelperScripts();