/**
 * VoxPilot — legacy entry point (no longer active).
 *
 * This file has been refactored into focused modules under content/:
 *
 *   content/state.js      — shared mutable state
 *   content/messaging.js  — chrome.runtime.sendMessage helpers
 *   content/parser.js     — normalize() + parseCommand()
 *   content/dom.js        — DOM utilities, element collection, match scoring
 *   content/actions.js    — command executors (runClick, runNavigate, …)
 *   content/pipeline.js   — speech pipeline + message listener
 *
 * manifest.json and background.js now reference those files directly.
 * Do NOT add logic here.
 */
