/* global chrome */

const DEFAULT_APP_ORIGIN = "https://a11ygarden.org";
const PREFS_KEY = "a11yGardenPrefs";
const LAST_RESULT_KEY = "a11yGardenLastResult";
const TOKENS_KEY = "a11yGardenTokens";

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

async function getActiveTab() {
  const tabs = await chromeCall((done) =>
    chrome.tabs.query({ active: true, currentWindow: true }, done),
  );
  return tabs?.[0] ?? null;
}

async function executeScript(tabId, files) {
  return await chrome.scripting.executeScript({
    target: { tabId },
    files,
    world: "ISOLATED",
  });
}

async function storageGet(area, key) {
  const result = await area.get(key);
  return result[key];
}

async function storageSet(area, key, value) {
  await area.set({ [key]: value });
}

async function getPrefs() {
  return (
    (await storageGet(chrome.storage.local, PREFS_KEY)) ?? {
      appOrigin: DEFAULT_APP_ORIGIN,
      mode: "fast",
    }
  );
}

async function savePrefs(prefs) {
  await storageSet(chrome.storage.local, PREFS_KEY, prefs);
}

async function getTokenMap() {
  return (await storageGet(chrome.storage.session, TOKENS_KEY)) ?? {};
}

async function setTokenRecord(auditId, record) {
  const tokens = await getTokenMap();
  tokens[auditId] = record;
  await storageSet(chrome.storage.session, TOKENS_KEY, tokens);
}

async function updateTokenRecord(auditId, updater) {
  const tokens = await getTokenMap();
  const current = tokens[auditId];
  if (!current) return;
  tokens[auditId] = updater(current);
  await storageSet(chrome.storage.session, TOKENS_KEY, tokens);
}

function isScannableUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

async function runScan({ appOrigin, mode }) {
  const tab = await getActiveTab();
  if (!tab?.id || !isScannableUrl(tab.url)) {
    throw new Error("Open a regular http(s) page before scanning.");
  }

  await savePrefs({
    appOrigin,
    mode,
  });

  await executeScript(tab.id, [
    "vendor/axe.min.js",
    "vendor/HTMLCS.js",
    "vendor/ace.js",
    "scan-main.js",
  ]);
  const [{ result: scanPayload }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "ISOLATED",
    args: [mode],
    func: async (scanMode) => {
      if (typeof window.__A11yGardenRunScan !== "function") {
        throw new Error("A11y Garden scan runner did not initialize.");
      }
      return await window.__A11yGardenRunScan(scanMode);
    },
  });
  if (!scanPayload) {
    throw new Error("Scan failed.");
  }

  const response = await fetch(`${appOrigin.replace(/\/$/, "")}/api/extension/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scanPayload),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || "Failed to save the hosted result.");
  }

  const ingestResult = await response.json();
  await setTokenRecord(ingestResult.auditId, {
    viewToken: ingestResult.viewToken,
    claimToken: ingestResult.claimToken,
    resultsUrl: ingestResult.resultsUrl,
    appOrigin,
    createdAt: Date.now(),
  });

  const summary = {
    auditId: ingestResult.auditId,
    resultsUrl: ingestResult.resultsUrl,
    pageTitle: scanPayload.pageTitle || tab.title || "Private result",
    totalViolations: scanPayload.violations.total,
  };
  await storageSet(chrome.storage.local, LAST_RESULT_KEY, summary);

  await chrome.tabs.create({ url: ingestResult.resultsUrl });
  return summary;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "A11Y_GARDEN_GET_POPUP_STATE") {
    Promise.all([
      getPrefs(),
      getActiveTab(),
      storageGet(chrome.storage.local, LAST_RESULT_KEY),
    ])
      .then(([prefs, activeTab, lastResult]) => {
        sendResponse({ prefs, activeTab, lastResult });
      })
      .catch((error) => {
        sendResponse({
          prefs: { appOrigin: DEFAULT_APP_ORIGIN, mode: "fast" },
          activeTab: null,
          lastResult: null,
          error: error instanceof Error ? error.message : "Failed to load popup state.",
        });
      });
    return true;
  }

  if (message?.type === "A11Y_GARDEN_SCAN_ACTIVE_TAB") {
    runScan({
      appOrigin:
        typeof message.appOrigin === "string" && message.appOrigin
          ? message.appOrigin
          : DEFAULT_APP_ORIGIN,
      mode: message.mode === "deep" ? "deep" : "fast",
    })
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Scan failed.",
        }),
      );
    return true;
  }

  if (message?.type === "A11Y_GARDEN_FETCH_VIEW_TOKEN") {
    getTokenMap()
      .then((tokens) => {
        sendResponse({ viewToken: tokens[message.auditId]?.viewToken ?? null });
      })
      .catch(() => sendResponse({ viewToken: null }));
    return true;
  }

  if (message?.type === "A11Y_GARDEN_FETCH_CLAIM_TOKEN") {
    getTokenMap()
      .then((tokens) => {
        sendResponse({ claimToken: tokens[message.auditId]?.claimToken ?? null });
      })
      .catch(() => sendResponse({ claimToken: null }));
    return true;
  }

  if (message?.type === "A11Y_GARDEN_MARK_CLAIMED") {
    updateTokenRecord(message.auditId, (record) => ({
      ...record,
      claimToken: null,
    }))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});
