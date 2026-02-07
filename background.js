const RULESET_ID = "wikipedia_redirect_ruleset";

const DEFAULT_SETTINGS = {
  autoRedirect: true,
  showBanner: true,
  openInNewTab: false,
  displayMode: "banner"
};

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
  const { settings } = await chrome.storage.sync.get("settings");
  await syncRedirectRuleset((settings || DEFAULT_SETTINGS).autoRedirect);
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "sync" || !changes.settings) return;
  const newSettings = changes.settings.newValue;
  const oldSettings = changes.settings.oldValue || DEFAULT_SETTINGS;
  if (newSettings.autoRedirect !== oldSettings.autoRedirect) {
    await syncRedirectRuleset(newSettings.autoRedirect);
  }
});

async function syncRedirectRuleset(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled ? { enableRulesetIds: [RULESET_ID] } : { disableRulesetIds: [RULESET_ID] }
  );
}

// Fetch + parse in background. Stream response, abort as soon as we extract content.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FETCH_SUMMARY") {
    fetchSummary(message.slug).then(sendResponse).catch(() =>
      sendResponse({ ok: false })
    );
    return true;
  }
});

async function fetchSummary(slug) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(`https://grokipedia.com/page/${slug}`, {
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    // Stream the response — read chunks until we find the content
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let html = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });

      // Check if we have enough to extract — look for markdown heading + paragraph
      const result = tryExtract(html, slug);
      if (result) {
        reader.cancel(); // Stop downloading — we have what we need
        clearTimeout(timeout);
        return { ok: true, ...result };
      }

      // Safety: don't accumulate more than 1MB
      if (html.length > 1000000) break;
    }

    clearTimeout(timeout);
    // Final attempt with everything we got
    const result = tryExtract(html, slug);
    if (result) return { ok: true, ...result };
    return { ok: false };
  } catch {
    clearTimeout(timeout);
    return { ok: false };
  }
}

function tryExtract(html, slug) {
  // Find markdown heading: "# Title\n\n" (escaped in JS as \\n)
  const headingMatch = html.match(/# ([^\n\\]{3,})\\n\\n/);
  if (!headingMatch) return null;

  const rawTitle = headingMatch[1];
  const afterHeading = html.substring(headingMatch.index + headingMatch[0].length);

  // Grab text up to the first double-newline (end of first paragraph)
  const paraEnd = afterHeading.indexOf("\\n\\n");
  let chunk = paraEnd !== -1 ? afterHeading.substring(0, paraEnd) : afterHeading.substring(0, 1000);

  // Stop at script boundaries
  for (const marker of ['"])', "</script"]) {
    const pos = chunk.indexOf(marker);
    if (pos !== -1) chunk = chunk.substring(0, pos);
  }

  // Unescape and clean
  let text = chunk
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 50) return null;

  if (text.length > 400) {
    text = text.substring(0, 400).replace(/\s+\S*$/, "") + "...";
  }

  // Decode title
  let title = rawTitle.replace(/\\u0027/g, "'").replace(/\\"/g, '"');

  return { title, summary: text };
}
