/**
 * VoxPilot content — command parser.
 *
 * Normalises raw speech transcript and extracts a typed command object that
 * the action layer can dispatch without knowing about raw strings.
 *
 * Depends on: (none)
 */

function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param  {string} raw - Raw speech transcript.
 * @returns {{ kind: string, rest?: string, listKind?: string, text?: string, dir?: string } | null}
 */
function parseCommand(raw) {
  const t = normalize(raw);
  if (!t) return null;

  // --- list ---
  if (/^(list|show|what)\s+(buttons?|links?)$/.test(t)) {
    const m = t.match(/(buttons?|links?)/);
    const kind = m[1].startsWith("link") ? "links" : "buttons";
    return { kind: "list", listKind: kind };
  }

  // --- focus walk: next ---
  if (/^(which\s+is\s+)?next(\s+(button|element|control|item))?$/.test(t)) {
    return { kind: "next" };
  }

  // --- focus walk: previous ---
  if (
    /^(which\s+is\s+)?(previous|prev|back)(\s+(button|element|control|item))?$/.test(t)
  ) {
    return { kind: "previous" };
  }

  // --- click current focused element (no named target) ---
  if (/^(click|press|tap|activate)(\s+(this|it|current))?$/.test(t)) {
    return { kind: "click-current" };
  }

  // --- read focused element ---
  if (/^(read|read\s+this|what\s+is\s+this|what's\s+this|describe)$/.test(t)) {
    return { kind: "read" };
  }

  // --- focus a text input ---
  if (/^(focus|go\s+to)\s+(input|search|text|field|box)$/.test(t)) {
    return { kind: "focus-input" };
  }

  // --- type text into the focused input ---
  const typeMatch = t.match(/^(type|enter|write|input)\s+(.+)$/);
  if (typeMatch) {
    return { kind: "type", text: typeMatch[2].trim() };
  }

  // --- scroll ---
  if (/^(scroll\s+down|page\s+down|go\s+down|move\s+down)$/.test(t)) {
    return { kind: "scroll", dir: "down" };
  }
  if (/^(scroll\s+up|page\s+up|go\s+up|move\s+up)$/.test(t)) {
    return { kind: "scroll", dir: "up" };
  }

  // --- browser back ---
  if (/^(go\s+back|navigate\s+back|back)$/.test(t)) {
    return { kind: "go-back" };
  }

  // --- click named target ---
  const clickMatch = t.match(/^(click|press|tap)\s+(.+)$/);
  if (clickMatch) {
    return { kind: "click", rest: clickMatch[2].trim() };
  }

  // --- find / focus named target ---
  const findMatch = t.match(/^(find|show|locate|focus)\s+(.+)$/);
  if (findMatch) {
    return { kind: "find", rest: findMatch[2].trim() };
  }

  return null;
}
