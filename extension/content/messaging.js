/**
 * VoxPilot content — message helpers.
 *
 * Thin wrappers around chrome.runtime.sendMessage so every other module
 * can emit typed events without repeating the sendMessage boilerplate.
 *
 * Depends on: (none)
 */

function notify(type, extra = {}) {
  void chrome.runtime.sendMessage({ type, ...extra });
}

function notifyError(error, message) {
  notify("RECOGNITION_ERROR", { error, message });
}

function notifyActionResult(status, message, detail = "") {
  notify("ACTION_RESULT", { status, message, detail });
}
