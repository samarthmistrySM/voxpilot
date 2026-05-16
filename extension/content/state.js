/**
 * VoxPilot content — shared mutable state.
 *
 * Loaded first in the content_scripts array so every subsequent module can
 * read and write these variables directly (all content scripts in one group
 * share the same execution scope).
 *
 * Mutable variables use `var` so a rare second injection (via executeScript)
 * doesn't throw "already declared" errors. Constants stay `const`.
 */

// ---------------------------------------------------------------------------
// Speech pipeline state
// ---------------------------------------------------------------------------

/** Active SpeechRecognition instance, or null when not running. */
// eslint-disable-next-line no-var
var recognition = null;

/** The getUserMedia stream — kept open across recognition restarts. */
// eslint-disable-next-line no-var
var mediaStream = null;

/**
 * True while the user has started listening and has not yet stopped.
 * Checked before every command dispatch and every recognition event.
 */
// eslint-disable-next-line no-var
var listeningSessionActive = false;

/**
 * Fallback debounce (ms) — only used when speech doesn't yet parse to a
 * known command. Recognised commands fire immediately with zero delay.
 */
const SILENCE_MS_BEFORE_ACTION = 400;

// eslint-disable-next-line no-var
var commandSilenceTimer = null;

// eslint-disable-next-line no-var
var latestFinalForCommand = "";

/** Pending auto-restart timer after recognition.onend fires mid-session. */
// eslint-disable-next-line no-var
var restartTimer = null;

// ---------------------------------------------------------------------------
// DOM scanning state
// ---------------------------------------------------------------------------

/** Max controls to collect — keeps scans fast on huge DOMs. */
const MAX_ACTIONABLE = 450;

/** How many light-DOM nodes to check for open shadow roots. */
const MAX_SHADOW_HOST_SCAN = 900;

/** Max elements pulled from open shadow trees (closed shadows are inaccessible). */
const MAX_FROM_SHADOW_TOTAL = 120;

/** Short cache so repeated commands do not rescan the whole page. */
const ACTIONABLE_CACHE_MS = 120;

// eslint-disable-next-line no-var
var actionableCache = null;

// eslint-disable-next-line no-var
var actionableCacheTime = 0;

// ---------------------------------------------------------------------------
// Focus-traversal state
// ---------------------------------------------------------------------------

/** The last element focused by a VoxPilot navigate / find / click command. */
// eslint-disable-next-line no-var
var lastFocusedActionable = null;
