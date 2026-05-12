/**
 * VoxPilot MV3 service worker — message hub between popup and content scripts.
 *
 * - Popup sends START_LISTENING / STOP_LISTENING here (not directly to tabs).
 * - Content sends TRANSCRIPT / RECOGNITION_* here; we relay to open extension UIs.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Relay anything from a tab (content script) to extension pages (popup, etc.)
  if (sender.tab?.id && typeof message === "object" && message !== null) {
    void chrome.runtime.sendMessage(message).catch(() => {
      // Popup closed — ignore
    });
    return false;
  }

  if (message?.type === "START_LISTENING") {
    void forwardToActiveTab({ type: "VOXPILOT_START_LISTENING" })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true;
  }

  if (message?.type === "STOP_LISTENING") {
    void forwardToActiveTab({ type: "VOXPILOT_STOP_LISTENING" })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

async function forwardToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab");
  }

  const url = tab.url ?? "";
  if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
    throw new Error("Voice does not run on this page type. Open a normal website tab.");
  }

  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, payload);
  }
}
