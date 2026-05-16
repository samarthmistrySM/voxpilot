/**
 * VoxPilot content — DOM utilities.
 *
 * Element collection, visibility checking, accessible name resolution,
 * and match scoring for named-target commands (click/find).
 *
 * Depends on: state.js (MAX_ACTIONABLE, MAX_SHADOW_HOST_SCAN,
 *             MAX_FROM_SHADOW_TOTAL, ACTIONABLE_CACHE_MS,
 *             actionableCache, actionableCacheTime)
 */

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Multi-pass selectors used by collectActionable() — order matters. */
const ACTION_SELECTOR_PARTS = [
  "button:not([disabled])",
  '[role="button"]:not([disabled])',
  "a[href]:not([disabled])",
  'input[type="button"]:not([disabled])',
  'input[type="submit"]:not([disabled])',
  'input[type="reset"]:not([disabled])',
  "summary",
  '[tabindex]:not([tabindex="-1"])',
];

/**
 * Single fast selector used by runNavigate (next / previous).
 * One querySelectorAll call, no per-element getBoundingClientRect loop —
 * avoids the 200 ms+ layout thrash on YouTube / heavy SPAs.
 */
const FOCUS_WALK_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  '[role="button"]:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

function visible(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  const st = window.getComputedStyle(el);
  if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width >= 1 && r.height >= 1;
}

// ---------------------------------------------------------------------------
// Accessible name
// ---------------------------------------------------------------------------

function getAccessibleName(el) {
  if (!(el instanceof HTMLElement)) return "";

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map((id) => {
      const n = document.getElementById(id);
      return n ? n.textContent?.trim() ?? "" : "";
    });
    const joined = parts.filter(Boolean).join(" ").trim();
    if (joined) return joined;
  }

  const al = el.getAttribute("aria-label");
  if (al?.trim()) return al.trim();

  const title = el.getAttribute("title");
  if (title?.trim()) return title.trim();

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    if (el.labels?.length) {
      return Array.from(el.labels)
        .map((l) => l.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
    }
    if (el.placeholder) return el.placeholder;
    if (el.name) return el.name;
    if (el.type) return el.type;
  }

  const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length > 120) return text.slice(0, 117) + "...";
  return text;
}

// ---------------------------------------------------------------------------
// Actionable element collection (for named-target commands)
// ---------------------------------------------------------------------------

function invalidateActionableCache() {
  actionableCache = null;
}

function collectActionableUncached() {
  const seen = new Set();
  /** @type {HTMLElement[]} */
  const out = [];

  for (const sel of ACTION_SELECTOR_PARTS) {
    if (out.length >= MAX_ACTIONABLE) break;
    let nodes;
    try {
      nodes = document.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (let i = 0; i < nodes.length && out.length < MAX_ACTIONABLE; i += 1) {
      const n = nodes[i];
      if (!(n instanceof HTMLElement)) continue;
      if (seen.has(n)) continue;
      if (!visible(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }

  const shadowBudget = Math.min(MAX_FROM_SHADOW_TOTAL, MAX_ACTIONABLE - out.length);
  if (shadowBudget > 0) {
    let shadowAdded = 0;
    const hosts = document.querySelectorAll("*");
    const hostMax = Math.min(hosts.length, MAX_SHADOW_HOST_SCAN);
    for (let i = 0; i < hostMax && shadowAdded < shadowBudget; i += 1) {
      const el = hosts[i];
      const root = el?.shadowRoot;
      if (!root) continue;
      try {
        for (const sel of ACTION_SELECTOR_PARTS) {
          if (shadowAdded >= shadowBudget) break;
          for (const n of root.querySelectorAll(sel)) {
            if (shadowAdded >= shadowBudget) break;
            if (!(n instanceof HTMLElement) || seen.has(n)) continue;
            if (!visible(n)) continue;
            seen.add(n);
            out.push(n);
            shadowAdded += 1;
          }
        }
      } catch {
        /* closed shadow root or strict mode */
      }
    }
  }

  return out;
}

function collectActionable() {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (actionableCache && now - actionableCacheTime < ACTIONABLE_CACHE_MS) {
    return actionableCache;
  }
  actionableCache = collectActionableUncached();
  actionableCacheTime = now;
  return actionableCache;
}

function collectByKind(listKind) {
  const all = collectActionable();
  if (listKind === "links") {
    return all.filter((el) => el.tagName === "A" || el.getAttribute("role") === "link");
  }
  return all.filter(
    (el) =>
      el.tagName === "BUTTON" ||
      el.getAttribute("role") === "button" ||
      (el.tagName === "INPUT" &&
        ["button", "submit", "reset"].includes(/** @type {HTMLInputElement} */ (el).type))
  );
}

// ---------------------------------------------------------------------------
// Match scoring (for named-target commands)
// ---------------------------------------------------------------------------

function scoreMatch(nameNorm, queryNorm) {
  if (!queryNorm) return 0;
  if (nameNorm === queryNorm) return 100;
  if (nameNorm.includes(queryNorm)) return 80;
  const qWords = queryNorm.split(" ").filter(Boolean);
  if (!qWords.length) return 0;
  let hits = 0;
  for (const w of qWords) {
    if (w.length > 1 && nameNorm.includes(w)) hits += 1;
  }
  return Math.min(70, (hits / qWords.length) * 70);
}

function findBestMatches(query) {
  const q = normalize(query);
  const items = collectActionable();
  const scored = items.map((el) => {
    const name = getAccessibleName(el);
    return { el, name, score: scoreMatch(normalize(name), q) };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored.filter((x) => x.score > 0);
  return { scored, best };
}
