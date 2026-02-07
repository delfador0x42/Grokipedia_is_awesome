(async function () {
  const settings = await getSettings();

  // If auto-redirect is ON, the declarativeNetRequest rule handles it.
  // This script only runs when redirect is OFF.
  if (settings.autoRedirect) return;

  const pathMatch = window.location.pathname.match(/^\/wiki\/(.+)/);
  if (!pathMatch) return;

  const slug = pathMatch[1];

  // Skip non-article pages
  if (slug.startsWith("Special:") || slug.startsWith("Talk:") ||
      slug.startsWith("User:") || slug.startsWith("Wikipedia:") ||
      slug.startsWith("File:") || slug.startsWith("Help:")) {
    return;
  }

  const grokipediaUrl = `https://grokipedia.com/page/${slug}`;
  const target = settings.openInNewTab ? "_blank" : "_self";

  switch (settings.displayMode) {
    case "floating":
      injectFloatingButton(grokipediaUrl, target);
      break;
    case "sidebar":
      injectSidebar(grokipediaUrl, target, slug);
      break;
    case "banner":
    default:
      injectTopBanner(grokipediaUrl, target);
      break;
  }
})();

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("settings", ({ settings }) => {
      resolve(
        settings || {
          autoRedirect: true,
          showBanner: true,
          openInNewTab: false,
          displayMode: "banner",
        }
      );
    });
  });
}

// Banner mode: full-width bar at top of page
function injectTopBanner(url, target) {
  const banner = document.createElement("div");
  banner.id = "grokipedia-wp-banner";
  banner.innerHTML = `
    <div class="grokipedia-wp-banner-inner">
      <span class="grokipedia-wp-banner-icon">G</span>
      <span class="grokipedia-wp-banner-text">
        Want an AI-enhanced perspective on this topic?
      </span>
      <a href="${escapeAttr(url)}" target="${target}" rel="noopener" class="grokipedia-wp-banner-btn">
        Show me the truth on Grokipedia
      </a>
      <button class="grokipedia-wp-banner-close" aria-label="Dismiss">&times;</button>
    </div>
  `;

  document.body.prepend(banner);

  banner
    .querySelector(".grokipedia-wp-banner-close")
    .addEventListener("click", () => banner.remove());
}

// Floating button mode: pill in bottom-right
function injectFloatingButton(url, target) {
  const btn = document.createElement("a");
  btn.id = "grokipedia-wp-float";
  btn.href = url;
  btn.target = target;
  btn.rel = "noopener";
  btn.innerHTML = `<span class="grokipedia-wp-float-icon">G</span> View on Grokipedia`;
  document.body.appendChild(btn);
}

// Sidebar mode: panel on right side
function injectSidebar(url, target, slug) {
  const sidebar = document.createElement("div");
  sidebar.id = "grokipedia-wp-sidebar";
  sidebar.innerHTML = `
    <div class="grokipedia-wp-sidebar-header">
      <span class="grokipedia-wp-sidebar-icon">G</span>
      <span>Grokipedia</span>
      <button class="grokipedia-wp-sidebar-close" aria-label="Close">&times;</button>
    </div>
    <div class="grokipedia-wp-sidebar-body">
      <p>Loading Grokipedia content...</p>
    </div>
    <a href="${escapeAttr(url)}" target="${target}" rel="noopener" class="grokipedia-wp-sidebar-link">
      Open full article &rarr;
    </a>
  `;

  document.body.appendChild(sidebar);

  sidebar
    .querySelector(".grokipedia-wp-sidebar-close")
    .addEventListener("click", () => sidebar.remove());

  fetchAndPopulateSidebar(slug, sidebar);
}

async function fetchAndPopulateSidebar(slug, sidebar) {
  const body = sidebar.querySelector(".grokipedia-wp-sidebar-body");

  try {
    const result = await chrome.runtime.sendMessage({ type: "FETCH_SUMMARY", slug });
    if (!result?.ok) throw new Error("fetch failed");
    body.innerHTML = `<p>${escapeHtml(result.summary)}</p>`;
  } catch {
    body.innerHTML = `<p>Could not load summary. Click below to visit Grokipedia directly.</p>`;
  }
}

function escapeHtml(text) {
  const el = document.createElement("div");
  el.textContent = text;
  return el.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
