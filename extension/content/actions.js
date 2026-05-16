/**
 * VoxPilot content — command executors.
 *
 * One function per command kind. tryRunCommand() is the single dispatcher
 * called by the pipeline after a final transcript arrives.
 *
 * Depends on: state.js, messaging.js, parser.js, dom.js
 */

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

function tryRunCommand(phrase) {
  if (!listeningSessionActive) return;

  const cmd = parseCommand(phrase);
  if (!cmd) return;

  try {
    switch (cmd.kind) {
      case "list":          runList(cmd.listKind);         break;
      case "click":         runClick(cmd.rest ?? "");      break;
      case "find":          runFind(cmd.rest ?? "");        break;
      case "next":          runNavigate(1);                 break;
      case "previous":      runNavigate(-1);                break;
      case "click-current": runClickCurrent();              break;
      case "read":          runRead();                      break;
      case "focus-input":   runFocusInput();                break;
      case "type":          runType(cmd.text ?? "");        break;
      case "scroll":        runScroll(cmd.dir ?? "down");   break;
      case "go-back":       runGoBack();                    break;
      default:              break;
    }
  } catch (e) {
    notifyActionResult("error", "Action failed.", e?.message ?? String(e));
  }
}

// ---------------------------------------------------------------------------
// Named-target commands (use DOM scan + scoring)
// ---------------------------------------------------------------------------

function runList(listKind) {
  const els = collectByKind(listKind);
  const max = 12;
  const slice = els.slice(0, max);
  const lines = slice.map((el, i) => `${i + 1}. ${getAccessibleName(el) || el.tagName}`);
  const msg =
    lines.length === 0
      ? `No ${listKind} found on this page.`
      : `${listKind}: ${lines.length} shown${els.length > max ? ` of ${els.length}` : ""}. ${lines.join(". ")}`;
  notifyActionResult(lines.length ? "ok" : "not_found", msg, lines.join("\n"));
}

function runClick(query) {
  const { best } = findBestMatches(query);
  if (best.length === 0) {
    notifyActionResult("not_found", `Nothing matched "${query}".`, "");
    return;
  }
  const top = best[0];
  if (best.length > 1 && top.score === best[1].score && top.score < 100) {
    const names = best.slice(0, 4).map((x) => getAccessibleName(x.el)).join("; ");
    notifyActionResult("ambiguous", "Multiple matches. Be more specific.", names);
    return;
  }
  const el = top.el;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
  if (typeof el.click === "function") el.click();
  lastFocusedActionable = el;
  const name = getAccessibleName(el) || "control";
  notifyActionResult("ok", `Clicked: ${name}.`, name);
  invalidateActionableCache();
}

function runFind(query) {
  const { best } = findBestMatches(query);
  if (best.length === 0) {
    notifyActionResult("not_found", `Could not find "${query}".`, "");
    return;
  }
  const el = best[0].el;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
  lastFocusedActionable = el;
  const name = getAccessibleName(el) || "control";
  notifyActionResult("ok", `Focused: ${name}.`, name);
}

// ---------------------------------------------------------------------------
// Focus-walk commands (fast — single querySelectorAll, no visibility loop)
// ---------------------------------------------------------------------------

function runNavigate(delta) {
  const all = Array.from(document.querySelectorAll(FOCUS_WALK_SELECTOR));
  if (all.length === 0) {
    notifyActionResult("not_found", "No focusable elements found.", "");
    return;
  }
  const active = document.activeElement;
  let idx = active ? all.indexOf(active) : -1;
  if (idx < 0 && lastFocusedActionable) {
    idx = all.indexOf(lastFocusedActionable);
  }
  if (idx < 0) {
    idx = delta > 0 ? 0 : all.length - 1;
  } else {
    idx = (idx + delta + all.length) % all.length;
  }
  const el = /** @type {HTMLElement} */ (all[idx]);
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  el.focus({ preventScroll: true });
  lastFocusedActionable = el;
  const name = getAccessibleName(el) || el.tagName.toLowerCase();
  notifyActionResult("ok", `${delta > 0 ? "Next" : "Previous"}: ${name}.`, name);
}

/** Click whatever element is currently focused. */
function runClickCurrent() {
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (!el || el === document.body || el === document.documentElement) {
    notifyActionResult("not_found", "Nothing is focused. Say 'next' to move focus first.", "");
    return;
  }
  const name = getAccessibleName(el) || el.tagName.toLowerCase();
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (typeof el.click === "function") el.click();
  notifyActionResult("ok", `Clicked: ${name}.`, name);
  invalidateActionableCache();
}

/** Speak the accessible name + role of the currently focused element. */
function runRead() {
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (!el || el === document.body || el === document.documentElement) {
    notifyActionResult("not_found", "Nothing is focused.", "");
    return;
  }
  const name = getAccessibleName(el) || el.tagName.toLowerCase();
  const role = el.getAttribute("role") || el.tagName.toLowerCase();
  notifyActionResult("ok", `${name}. ${role}.`, name);
}

/** Jump to the first visible text input or textarea on the page. */
function runFocusInput() {
  const candidates = Array.from(
    document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
      ':not([type="checkbox"]):not([type="radio"]):not([disabled]),' +
      "textarea:not([disabled])"
    )
  ).filter(visible);
  if (candidates.length === 0) {
    notifyActionResult("not_found", "No text input found on this page.", "");
    return;
  }
  const el = /** @type {HTMLElement} */ (candidates[0]);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus();
  lastFocusedActionable = el;
  const name = getAccessibleName(el) || "input";
  notifyActionResult("ok", `Focused: ${name}.`, name);
}

/**
 * Type text into the currently focused input.
 * Uses the native HTMLInputElement value setter so React / Vue controlled
 * inputs fire their synthetic onChange events correctly.
 */
function runType(text) {
  const el = document.activeElement;
  if (!el || !("value" in el)) {
    notifyActionResult("not_found", "No text field is focused. Say 'focus input' first.", "");
    return;
  }
  const input = /** @type {HTMLInputElement} */ (el);
  input.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, text);
  } else {
    input.value = text;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  notifyActionResult("ok", `Typed: ${text}.`, text);
}

/** Scroll the page up or down by ~40 % of the viewport height. */
function runScroll(dir) {
  const amount = Math.round(window.innerHeight * 0.4);
  window.scrollBy({ top: dir === "down" ? amount : -amount, behavior: "smooth" });
  notifyActionResult("ok", dir === "down" ? "Scrolled down." : "Scrolled up.", "");
}

/** Navigate the browser back one step in history. */
function runGoBack() {
  history.back();
  notifyActionResult("ok", "Going back.", "");
}
