/* global chrome, HTMLInputElement */

const DEFAULT_APP_ORIGIN = "https://a11ygarden.org";

const appOriginInput = document.getElementById("app-origin");
const statusEl = document.getElementById("status");
const scanButton = document.getElementById("scan-button");
const currentTabTitleEl = document.getElementById("current-tab-title");
const currentTabUrlEl = document.getElementById("current-tab-url");
const lastResultCardEl = document.getElementById("last-result-card");
const lastResultNameEl = document.getElementById("last-result-name");
const lastResultSummaryEl = document.getElementById("last-result-summary");
const openResultButton = document.getElementById("open-result-button");

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function getSelectedMode() {
  const selected = document.querySelector('input[name="mode"]:checked');
  return selected instanceof HTMLInputElement ? selected.value : "fast";
}

function setSelectedMode(mode) {
  const candidate = document.querySelector(
    `input[name="mode"][value="${mode}"]`,
  );
  if (candidate instanceof HTMLInputElement) {
    candidate.checked = true;
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function renderLastResult(result) {
  if (!result) {
    lastResultCardEl.hidden = true;
    return;
  }

  lastResultCardEl.hidden = false;
  lastResultNameEl.textContent = result.pageTitle || "Private result ready";
  lastResultSummaryEl.textContent =
    result.totalViolations === 1
      ? "1 issue found. Hosted result opened in a new tab."
      : `${result.totalViolations} issues found. Hosted result opened in a new tab.`;

  openResultButton.onclick = () => {
    chrome.tabs.create({ url: result.resultsUrl });
  };
}

async function loadPopupState() {
  try {
    const response = await sendRuntimeMessage({ type: "A11Y_GARDEN_GET_POPUP_STATE" });
    const prefs = response?.prefs ?? {};
    appOriginInput.value = prefs.appOrigin || DEFAULT_APP_ORIGIN;
    setSelectedMode(prefs.mode || "fast");
    renderLastResult(response?.lastResult ?? null);

    const tab = response?.activeTab;
    currentTabTitleEl.textContent = tab?.title || "Untitled tab";
    currentTabUrlEl.textContent = tab?.url || "";
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Failed to load extension state.",
    );
  }
}

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;
  setStatus("Scanning current tab…");

  try {
    const response = await sendRuntimeMessage({
      type: "A11Y_GARDEN_SCAN_ACTIVE_TAB",
      appOrigin: appOriginInput.value.trim() || DEFAULT_APP_ORIGIN,
      mode: getSelectedMode(),
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }

    renderLastResult(response.summary);
    setStatus("Scan complete. Hosted result opened in a new tab.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Scan failed.");
  } finally {
    scanButton.disabled = false;
  }
});

void loadPopupState();
