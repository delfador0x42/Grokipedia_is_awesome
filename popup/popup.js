const toggleRedirect = document.getElementById("toggle-redirect");
const toggleBanner = document.getElementById("toggle-banner");
const toggleNewTab = document.getElementById("toggle-newtab");
const radioButtons = document.querySelectorAll('input[name="displayMode"]');

const DEFAULT_SETTINGS = {
  autoRedirect: true,
  showBanner: true,
  openInNewTab: false,
  displayMode: "banner"
};

// Load current settings on popup open
document.addEventListener("DOMContentLoaded", async () => {
  const { settings } = await chrome.storage.sync.get("settings");
  const s = settings || DEFAULT_SETTINGS;

  toggleRedirect.checked = s.autoRedirect;
  toggleBanner.checked = s.showBanner;
  toggleNewTab.checked = s.openInNewTab;

  for (const radio of radioButtons) {
    radio.checked = (radio.value === s.displayMode);
  }
});

// Save on any change
toggleRedirect.addEventListener("change", saveSettings);
toggleBanner.addEventListener("change", saveSettings);
toggleNewTab.addEventListener("change", saveSettings);
for (const radio of radioButtons) {
  radio.addEventListener("change", saveSettings);
}

async function saveSettings() {
  const selectedMode = document.querySelector('input[name="displayMode"]:checked');
  const settings = {
    autoRedirect: toggleRedirect.checked,
    showBanner: toggleBanner.checked,
    openInNewTab: toggleNewTab.checked,
    displayMode: selectedMode ? selectedMode.value : "banner"
  };
  await chrome.storage.sync.set({ settings });
}
