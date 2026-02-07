(async function () {
  const settings = await getSettings();
  if (!settings.showBanner) return;

  processSearchResults(settings);

  const container = document.getElementById("search") || document.getElementById("rso") || document.body;
  new MutationObserver(() => processSearchResults(settings)).observe(container, { childList: true, subtree: true });
})();

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("settings", ({ settings }) => {
      resolve(settings || { autoRedirect: true, showBanner: true, openInNewTab: false, displayMode: "banner" });
    });
  });
}

// ── Cache ──────────────────────────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000;

async function getCached(slug) {
  return new Promise((resolve) => {
    chrome.storage.local.get(`cache_${slug}`, (r) => {
      const e = r[`cache_${slug}`];
      resolve(e && Date.now() - e.ts < CACHE_TTL ? e.data : null);
    });
  });
}

function setCache(slug, data) {
  chrome.storage.local.set({ [`cache_${slug}`]: { data, ts: Date.now() } });
}

// ── Process search results ─────────────────────────────────────
const seen = new Set();
const SKIP = ["Special:", "Talk:", "User:", "Wikipedia:", "File:", "Help:"];

function processSearchResults(settings) {
  for (const link of document.querySelectorAll('a[href*="en.wikipedia.org/wiki/"]')) {
    const href = link.href;
    if (seen.has(href)) continue;
    seen.add(href);

    const m = href.match(/en\.wikipedia\.org\/wiki\/([^#?]+)/);
    if (!m) continue;
    const slug = m[1];
    if (SKIP.some((p) => slug.startsWith(p))) continue;

    const container = link.closest("div.g") || link.closest("[data-hveid]") || link.parentElement;
    if (!container || container.previousElementSibling?.classList.contains("grokipedia-card")) continue;

    injectCard(slug, container, settings);
  }
}

// ── Card injection ─────────────────────────────────────────────
async function injectCard(slug, container, settings) {
  const target = settings.openInNewTab ? "_blank" : "_self";
  const readableTitle = decodeURIComponent(slug.replace(/_/g, " "));

  // Show card immediately with title from slug — no network wait
  const card = document.createElement("div");
  card.className = `grokipedia-card grokipedia-${settings.displayMode}`;
  card.innerHTML = `
    <div class="grokipedia-card-inner">
      <div class="grokipedia-card-header">
        <span class="grokipedia-logo">G</span>
        <span class="grokipedia-label">Grokipedia</span>
        <span class="grokipedia-badge">AI-Enhanced</span>
      </div>
      <div class="grokipedia-card-body">
        <h3 class="grokipedia-title">${escapeHtml(readableTitle)}</h3>
        <div class="grokipedia-loading">
          <div class="grokipedia-skeleton"></div>
          <div class="grokipedia-skeleton grokipedia-skeleton-short"></div>
        </div>
        <a href="https://grokipedia.com/page/${slug}" target="${target}" rel="noopener" class="grokipedia-read-more">
          Read more on Grokipedia &rarr;
        </a>
      </div>
    </div>`;
  container.parentElement.insertBefore(card, container);

  // Check cache first
  const cached = await getCached(slug);
  if (cached) {
    fillSummary(card, cached.title, cached.summary);
    return;
  }

  // Ask background to stream-fetch and parse
  const result = await chrome.runtime.sendMessage({ type: "FETCH_SUMMARY", slug });
  if (result?.ok) {
    setCache(slug, { title: result.title, summary: result.summary });
    fillSummary(card, result.title, result.summary);
  } else {
    // Remove skeleton, keep the title + link
    const loading = card.querySelector(".grokipedia-loading");
    if (loading) loading.remove();
  }
}

function fillSummary(card, title, summary) {
  const titleEl = card.querySelector(".grokipedia-title");
  if (titleEl && title) titleEl.textContent = title;

  const loading = card.querySelector(".grokipedia-loading");
  if (loading) {
    const p = document.createElement("p");
    p.className = "grokipedia-summary";
    p.textContent = summary;
    loading.replaceWith(p);
  }
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
