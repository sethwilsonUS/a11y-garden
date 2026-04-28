/* global chrome */

import {
  ALL_URLS_PERMISSION,
  DEFAULT_PREFS,
  PENDING_MOBILE_SCAN_KEY,
  isScannableUrl,
  mobileScanPermissionPattern,
  normalizePrefs,
} from "./shared.js";

const appOriginInput = document.getElementById("app-origin");
const statusEl = document.getElementById("status");
const scanButton = document.getElementById("scan-button");
const historyButton = document.getElementById("history-button");
const currentTabTitleEl = document.getElementById("current-tab-title");
const currentTabUrlEl = document.getElementById("current-tab-url");
const lastResultCardEl = document.getElementById("last-result-card");
const lastResultNameEl = document.getElementById("last-result-name");
const lastResultSummaryEl = document.getElementById("last-result-summary");
const openResultButton = document.getElementById("open-result-button");
const captureScreenshotInput = document.getElementById("capture-screenshot");
const includeMobileInput = document.getElementById("include-mobile");
const aiInsightsInput = document.getElementById("ai-insights");
const acceptAiTermsInput = document.getElementById("accept-ai-terms");
let activeTabSnapshot = null;
let pendingPermissionRequest = null;

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

function chromeCall(invoker) {
  return new Promise((resolve, reject) => {
    invoker((result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result);
    });
  });
}

function setStatus(message) {
  statusEl.textContent = message;
}

function formatPopupError(error, fallback = "Scan failed.") {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/user gesture/i.test(message)) {
    return "Chrome needs site access to be approved from the Scan button before mobile clone scanning can start.";
  }
  return message || fallback;
}

function isAllUrlsPermission(permissionOrigin) {
  return permissionOrigin === ALL_URLS_PERMISSION;
}

async function requestMobileOriginPermission(url, prefs) {
  if (!isScannableUrl(url)) {
    throw new Error("Open a regular http(s) page before scanning.");
  }

  const origins = [mobileScanPermissionPattern(prefs, url)];
  return await chromeCall((done) => chrome.permissions.request({ origins }, done));
}

async function hasPermissionOrigin(origin) {
  return await chromeCall((done) => chrome.permissions.contains({ origins: [origin] }, done));
}

async function hasMobileOriginPermission(url, prefs) {
  if (!isScannableUrl(url)) {
    throw new Error("Open a regular http(s) page before scanning.");
  }

  const origin = mobileScanPermissionPattern(prefs, url);
  if (await hasPermissionOrigin(origin)) return true;
  return !isAllUrlsPermission(origin) && await hasPermissionOrigin(ALL_URLS_PERMISSION);
}

function buildPendingMobileScan(prefs, url) {
  if (!activeTabSnapshot?.id || !isScannableUrl(url)) {
    throw new Error("Open a regular http(s) page before scanning.");
  }

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    origin: mobileScanPermissionPattern(prefs, url),
    prefs,
    sourceTabId: activeTabSnapshot.id,
    sourceTabUrl: url,
  };
}

async function preparePendingMobileScan(prefs, url) {
  const pendingScan = buildPendingMobileScan(prefs, url);
  await chromeCall((done) =>
    chrome.storage.local.set({ [PENDING_MOBILE_SCAN_KEY]: pendingScan }, done),
  );
  return pendingScan;
}

async function clearPendingMobileScan() {
  await chromeCall((done) => chrome.storage.local.remove(PENDING_MOBILE_SCAN_KEY, done));
}

function resetPermissionPreflight() {
  pendingPermissionRequest = null;
  scanButton.textContent = "Scan Current Tab";
}

function mobilePermissionPreflightMessage(prefs) {
  if (prefs.captureScreenshot) {
    return "Chrome requires all-sites screenshot access to capture the temporary mobile clone tab. A11y Garden only uses it for local screenshot capture during this scan and does not edit any site.";
  }

  return "Chrome will ask for temporary read access to this site so the mobile clone can be scanned locally. The wording says \"change,\" but A11y Garden does not edit the site.";
}

function currentPrefs() {
  return normalizePrefs({
    appOrigin: appOriginInput.value,
    captureScreenshot: captureScreenshotInput.checked,
    includeMobile: includeMobileInput.checked,
    aiInsights: aiInsightsInput.checked,
    acceptedAiTermsAt: acceptAiTermsInput.checked ? Date.now() : null,
  });
}

function setControlsFromPrefs(prefs) {
  appOriginInput.value = prefs.appOrigin;
  captureScreenshotInput.checked = prefs.captureScreenshot;
  includeMobileInput.checked = prefs.includeMobile;
  aiInsightsInput.checked = prefs.aiInsights;
  acceptAiTermsInput.checked = Boolean(prefs.acceptedAiTermsAt);
}

function renderLastResult(result) {
  if (!result) {
    lastResultCardEl.hidden = true;
    return;
  }

  lastResultCardEl.hidden = false;
  lastResultNameEl.textContent = result.pageTitle || "Local result ready";
  const confirmedTotal = Number(result.totalViolations || 0);
  const reviewTotal = Number(result.totalReviewViolations || 0);
  const issueLabel = confirmedTotal === 1 ? "issue" : "issues";
  lastResultSummaryEl.textContent =
    `${confirmedTotal} confirmed ${issueLabel}, ${reviewTotal} needs review.`;

  openResultButton.onclick = () => {
    chrome.tabs.create({ url: result.resultsUrl });
  };
}

async function persistPrefs() {
  await sendRuntimeMessage({
    type: "A11Y_GARDEN_SAVE_PREFS",
    prefs: currentPrefs(),
  });
}

async function loadPopupState() {
  try {
    const response = await sendRuntimeMessage({ type: "A11Y_GARDEN_GET_POPUP_STATE" });
    const prefs = normalizePrefs(response?.prefs ?? DEFAULT_PREFS);
    setControlsFromPrefs(prefs);
    renderLastResult(response?.lastResult ?? null);

    const tab = response?.activeTab;
    activeTabSnapshot = tab || null;
    currentTabTitleEl.textContent = tab?.title || "Untitled tab";
    currentTabUrlEl.textContent = tab?.url || "";
  } catch (error) {
    setStatus(formatPopupError(error, "Failed to load extension state."));
  }
}

for (const control of [
  appOriginInput,
  captureScreenshotInput,
  includeMobileInput,
  aiInsightsInput,
  acceptAiTermsInput,
]) {
  control.addEventListener("change", () => {
    resetPermissionPreflight();
    persistPrefs().catch(() => {});
  });
}

scanButton.addEventListener("click", async () => {
  scanButton.disabled = true;

  const prefs = currentPrefs();
  const sourceUrl = activeTabSnapshot?.url || currentTabUrlEl.textContent;
  const mobileText = prefs.includeMobile ? " and mobile clone" : "";
  setStatus(`Scanning current tab${mobileText}...`);

  try {
    let pendingMobileScan = null;
    let mobilePermission = Promise.resolve(true);
    if (prefs.includeMobile) {
      const hasPermission = pendingPermissionRequest?.sourceUrl === sourceUrl
        ? false
        : await hasMobileOriginPermission(sourceUrl, prefs);

      if (!hasPermission && pendingPermissionRequest?.sourceUrl !== sourceUrl) {
        pendingPermissionRequest = { sourceUrl };
        scanButton.textContent = "Grant Access & Scan";
        setStatus(mobilePermissionPreflightMessage(prefs));
        return;
      }

      if (!hasPermission) {
        pendingMobileScan = preparePendingMobileScan(prefs, sourceUrl);
        pendingMobileScan.catch(() => {});
        mobilePermission = requestMobileOriginPermission(sourceUrl, prefs);
      }
    }

    const hasMobilePermission = await mobilePermission;
    if (!hasMobilePermission) {
      await clearPendingMobileScan();
      resetPermissionPreflight();
      throw new Error("Mobile clone scanning needs temporary access to this site.");
    }

    if (prefs.includeMobile) {
      resetPermissionPreflight();
      if (pendingMobileScan) await pendingMobileScan;
      const response = pendingMobileScan
        ? await sendRuntimeMessage({ type: "A11Y_GARDEN_RESUME_PENDING_MOBILE_SCAN" })
        : await sendRuntimeMessage({ type: "A11Y_GARDEN_SCAN_ACTIVE_TAB", prefs });

      if (!response?.ok) {
        throw new Error(response?.error || "Scan failed.");
      }

      if (response.summary) {
        renderLastResult(response.summary);
        setStatus("Scan complete. Local result opened in a new tab.");
      } else {
        setStatus("Mobile scan started. The local result will open when it is ready.");
      }
      return;
    }

    resetPermissionPreflight();
    const response = await sendRuntimeMessage({
      type: "A11Y_GARDEN_SCAN_ACTIVE_TAB",
      prefs,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }

    renderLastResult(response.summary);
    setStatus("Scan complete. Local result opened in a new tab.");
  } catch (error) {
    setStatus(formatPopupError(error));
  } finally {
    scanButton.disabled = false;
  }
});

historyButton.addEventListener("click", async () => {
  try {
    await sendRuntimeMessage({ type: "A11Y_GARDEN_OPEN_HISTORY" });
  } catch (error) {
    setStatus(formatPopupError(error, "Failed to open history."));
  }
});

void loadPopupState();
