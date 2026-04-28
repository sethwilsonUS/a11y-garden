/* global chrome */

import { saveAudit } from "./db.js";
import {
  ALL_URLS_PERMISSION,
  DEFAULT_PREFS,
  LAST_RESULT_KEY,
  PENDING_MOBILE_SCAN_KEY,
  PREFS_KEY,
  isScannableUrl,
  mobileScanPermissionPattern,
  normalizePrefs,
  originPermissionPattern,
} from "./shared.js";

const COMPREHENSIVE_SCAN_MODE = "deep";
const ENGINE_SCRIPT_FILES = [
  { engine: "axe", file: "vendor/axe.min.js" },
  { engine: "htmlcs", file: "vendor/HTMLCS.js" },
  { engine: "ace", file: "vendor/ace.js" },
];
const SCANNER_MAIN_SCRIPT_FILE = "scan-main.js";
const MAX_EXTENSION_ERROR_LENGTH = 900;
const MOBILE_SCAN_VIEWPORT = {
  width: 390,
  height: 844,
};
const SCREENSHOT_SIZE_LIMITS = {
  desktop: { maxWidth: 1440, maxHeight: 900 },
  mobile: {
    maxWidth: MOBILE_SCAN_VIEWPORT.width,
    maxHeight: MOBILE_SCAN_VIEWPORT.height,
  },
  screenshot: { maxWidth: 1440, maxHeight: 900 },
};
const PENDING_MOBILE_SCAN_MAX_AGE_MS = 2 * 60 * 1000;
let pendingMobileScanPromise = null;

function truncateErrorMessage(message) {
  if (message.length <= MAX_EXTENSION_ERROR_LENGTH) return message;
  return `${message.slice(0, MAX_EXTENSION_ERROR_LENGTH).trim()}...`;
}

function stripInjectedSourceDump(message) {
  const sourceMarkers = ["/*! axe", "!function a(window)", "axe.version="];
  const firstSourceIndex = sourceMarkers
    .map((marker) => message.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstSourceIndex === undefined) return message;
  return message.slice(0, firstSourceIndex).trim();
}

function formatExtensionError(error, fallback = "Extension action failed.") {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  if (/user gesture/i.test(rawMessage)) {
    return "Chrome needs site access to be approved from the extension popup before mobile clone scanning can start.";
  }
  const withoutSourceDump = stripInjectedSourceDump(rawMessage);
  const message = withoutSourceDump || fallback;
  return truncateErrorMessage(message);
}

function screenshotLimitsForLabel(label) {
  return SCREENSHOT_SIZE_LIMITS[label] || SCREENSHOT_SIZE_LIMITS.screenshot;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function resizeScreenshotDataUrl(dataUrl, label) {
  const limits = screenshotLimitsForLabel(label);

  if (
    !dataUrl?.startsWith("data:image/") ||
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return dataUrl;
  }

  let bitmap;
  try {
    const imageBlob = await fetch(dataUrl).then((response) => response.blob());
    bitmap = await createImageBitmap(imageBlob);
    const scale = Math.min(1, limits.maxWidth / bitmap.width, limits.maxHeight / bitmap.height);

    if (scale >= 1) return dataUrl;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) return dataUrl;

    context.drawImage(bitmap, 0, 0, width, height);
    const resizedBlob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.82,
    });

    return await blobToDataUrl(resizedBlob);
  } catch (error) {
    console.warn("[A11y Garden] Screenshot resize failed; using original image:", error);
    return dataUrl;
  } finally {
    bitmap?.close?.();
  }
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

async function getActiveTab() {
  const tabs = await chromeCall((done) =>
    chrome.tabs.query({ active: true, currentWindow: true }, done),
  );
  return tabs?.[0] ?? null;
}

async function getTabById(tabId) {
  if (!tabId) return null;
  try {
    return await chromeCall((done) => chrome.tabs.get(tabId, done));
  } catch {
    return null;
  }
}

async function storageGet(area, key) {
  const result = await area.get(key);
  return result[key];
}

async function storageSet(area, key, value) {
  await area.set({ [key]: value });
}

async function storageRemove(area, key) {
  await area.remove(key);
}

async function getPrefs() {
  return normalizePrefs(await storageGet(chrome.storage.local, PREFS_KEY));
}

async function savePrefs(prefs) {
  await storageSet(chrome.storage.local, PREFS_KEY, normalizePrefs(prefs));
}

async function injectScannerScript(tabId, file, { required = true } = {}) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file],
      world: "ISOLATED",
    });
    return null;
  } catch (error) {
    const message = formatExtensionError(
      error,
      "Chrome rejected the scanner script.",
    );
    if (!required) return { file, message };
    throw new Error(`Could not inject ${file}: ${message}`);
  }
}

async function executeScanner(tabId, mode) {
  const engineInjectionErrors = [];
  for (const { engine, file } of ENGINE_SCRIPT_FILES) {
    const injectionError = await injectScannerScript(tabId, file, {
      required: false,
    });
    if (injectionError) {
      engineInjectionErrors.push({ engine, ...injectionError });
    }
  }

  await injectScannerScript(tabId, SCANNER_MAIN_SCRIPT_FILE);

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      args: [engineInjectionErrors],
      func: (errors) => {
        window.__A11yGardenEngineInjectionErrors = errors;
      },
    });
  } catch (error) {
    throw new Error(
      `Could not pass scanner diagnostics: ${formatExtensionError(error)}`,
    );
  }

  let injectionResult;
  try {
    injectionResult = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      args: [mode],
      func: async (scanMode) => {
        if (typeof window.__A11yGardenRunScan !== "function") {
          throw new Error("A11y Garden scan runner did not initialize.");
        }
        return await window.__A11yGardenRunScan(scanMode);
      },
    });
  } catch (error) {
    throw new Error(
      `Scanner runner failed: ${formatExtensionError(error, "The injected scan runner failed.")}`,
    );
  }

  const [{ result } = {}] = injectionResult || [];
  if (!result) throw new Error("Scan failed.");
  return result;
}

async function captureTabScreenshot(tab, label = "screenshot") {
  if (!tab?.windowId) {
    return {
      dataUrl: null,
      warning: `Chrome did not provide a window for the ${label} screenshot.`,
    };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 82,
    });
    const resizedDataUrl = await resizeScreenshotDataUrl(dataUrl, label);
    return { dataUrl: resizedDataUrl, warning: null };
  } catch (error) {
    console.warn("[A11y Garden] Screenshot capture failed:", error);
    return {
      dataUrl: null,
      warning: `Chrome could not capture the ${label} screenshot: ${formatExtensionError(error, "Screenshot capture failed.")}`,
    };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function focusTabForCapture(tabId, windowId) {
  try {
    await chromeCall((done) => chrome.tabs.update(tabId, { active: true }, done));
    await chromeCall((done) => chrome.windows.update(windowId, { focused: true }, done));
    await delay(350);
  } catch (error) {
    console.warn("[A11y Garden] Could not focus tab before screenshot:", error);
  }
}

async function hasOriginPermission(url) {
  const origins = [originPermissionPattern(url)];
  if (await chrome.permissions.contains({ origins })) return true;
  return await hasAllUrlsPermission();
}

async function hasAllUrlsPermission() {
  return await chrome.permissions.contains({ origins: [ALL_URLS_PERMISSION] });
}

async function hasMobileScanPermission(url, prefs) {
  const origin = mobileScanPermissionPattern(prefs, url);
  if (origin === ALL_URLS_PERMISSION) return await hasAllUrlsPermission();
  return await hasOriginPermission(url);
}

function waitForTabComplete(tabId, timeoutMs = 20_000) {
  return new Promise((resolve) => {
    let done = false;
    const timeout = setTimeout(() => finish(), timeoutMs);

    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function scanMobileClone(sourceTab, prefs) {
  const allowed = await hasMobileScanPermission(sourceTab.url, prefs);
  if (!allowed) {
    throw new Error(
      "Mobile clone scanning needs temporary site access. Start the scan from the popup and approve access for this site.",
    );
  }

  let createdWindow;
  try {
    createdWindow = await chrome.windows.create({
      url: sourceTab.url,
      type: "popup",
      width: MOBILE_SCAN_VIEWPORT.width,
      height: MOBILE_SCAN_VIEWPORT.height,
      focused: true,
    });
    const mobileTab = createdWindow.tabs?.[0];
    if (!mobileTab?.id) throw new Error("Could not open the mobile clone tab.");
    await waitForTabComplete(mobileTab.id);
    await delay(750);
    const scan = await executeScanner(mobileTab.id, COMPREHENSIVE_SCAN_MODE);
    if (prefs.captureScreenshot) {
      await focusTabForCapture(mobileTab.id, createdWindow.id);
    }
    const latestMobileTab = (await getTabById(mobileTab.id)) || mobileTab;
    const screenshot = prefs.captureScreenshot
      ? await captureTabScreenshot({ ...latestMobileTab, windowId: createdWindow.id }, "mobile")
      : null;
    return {
      ...scan,
      viewportWidth: scan.viewportWidth || MOBILE_SCAN_VIEWPORT.width,
      viewportHeight: scan.viewportHeight || MOBILE_SCAN_VIEWPORT.height,
      ...(screenshot?.dataUrl ? { screenshotDataUrl: screenshot.dataUrl } : {}),
      ...(screenshot?.warning ? { screenshotWarning: screenshot.warning } : {}),
    };
  } finally {
    if (createdWindow?.id) {
      chrome.windows.remove(createdWindow.id).catch(() => {});
    }
  }
}

function buildAuditRecord({ id, sourceTab, desktopScan, mobileScan, prefs }) {
  const scannedAt = Date.now();

  return {
    id,
    url: desktopScan.url || sourceTab.url,
    pageTitle: desktopScan.pageTitle || sourceTab.title || "A11y Garden scan",
    platform: desktopScan.platform || mobileScan?.platform,
    scannedAt,
    scanSource: "extension",
    scanMode: desktopScan.scanMode || "full",
    viewportMode: mobileScan ? "paired" : "live",
    settings: {
      mode: COMPREHENSIVE_SCAN_MODE,
      captureScreenshot: prefs.captureScreenshot,
      includeMobile: prefs.includeMobile,
      aiInsights: prefs.aiInsights,
      appOrigin: prefs.appOrigin,
    },
    desktop: desktopScan,
    ...(mobileScan ? { mobile: mobileScan } : {}),
    exportMetadata: {},
  };
}

function countAuditFindings(audit, countKey) {
  return Number(audit.desktop?.[countKey]?.total || 0) +
    Number(audit.mobile?.[countKey]?.total || 0);
}

async function openResultTab(auditId) {
  const url = chrome.runtime.getURL(`result.html#audit=${encodeURIComponent(auditId)}`);
  await chrome.tabs.create({ url });
}

async function getScanSourceTab(options = {}) {
  if (options.sourceTabId) {
    const tab = await getTabById(options.sourceTabId);
    if (tab) return tab;
    throw new Error("The tab queued for mobile scanning is no longer available.");
  }
  return await getActiveTab();
}

function isFreshPendingMobileScan(pending) {
  return Boolean(
    pending?.id &&
      pending?.sourceTabId &&
      isScannableUrl(pending.sourceTabUrl) &&
      Date.now() - Number(pending.createdAt || 0) < PENDING_MOBILE_SCAN_MAX_AGE_MS,
  );
}

async function claimPendingMobileScan(allowedOrigins = null) {
  const pending = await storageGet(chrome.storage.local, PENDING_MOBILE_SCAN_KEY);
  if (!pending) return null;

  if (!isFreshPendingMobileScan(pending)) {
    await storageRemove(chrome.storage.local, PENDING_MOBILE_SCAN_KEY);
    return null;
  }

  if (Array.isArray(allowedOrigins) && !allowedOrigins.includes(pending.origin)) {
    return null;
  }

  await storageRemove(chrome.storage.local, PENDING_MOBILE_SCAN_KEY);
  return {
    ...pending,
    prefs: normalizePrefs(pending.prefs),
  };
}

async function startPendingMobileScan(allowedOrigins = null) {
  if (pendingMobileScanPromise) return pendingMobileScanPromise;

  pendingMobileScanPromise = (async () => {
    const pending = await claimPendingMobileScan(allowedOrigins);
    if (!pending) return null;

    const allowed = await hasMobileScanPermission(pending.sourceTabUrl, pending.prefs);
    if (!allowed) {
      throw new Error(
        "Mobile clone scanning needs temporary site access. Start the scan from the popup and approve access for this site.",
      );
    }

    return await runScan(pending.prefs, {
      sourceTabId: pending.sourceTabId,
      sourceTabUrl: pending.sourceTabUrl,
    });
  })();

  try {
    return await pendingMobileScanPromise;
  } finally {
    pendingMobileScanPromise = null;
  }
}

async function runScan(input = {}, options = {}) {
  const currentPrefs = await getPrefs();
  const prefs = normalizePrefs({ ...currentPrefs, ...input });
  const tab = await getScanSourceTab(options);

  if (!tab?.id || !isScannableUrl(tab.url)) {
    throw new Error("Open a regular http(s) page before scanning.");
  }

  if (options.sourceTabUrl && tab.url !== options.sourceTabUrl) {
    throw new Error("The tab queued for mobile scanning changed before the scan could start.");
  }

  await savePrefs(prefs);
  if (prefs.includeMobile) {
    const allowed = await hasMobileScanPermission(tab.url, prefs);
    if (!allowed) {
      throw new Error(
        "Mobile clone scanning needs temporary site access. Start the scan from the popup and approve access for this site.",
      );
    }
  }

  const desktopScan = await executeScanner(tab.id, COMPREHENSIVE_SCAN_MODE);
  const desktopScreenshot = prefs.captureScreenshot
    ? await captureTabScreenshot(tab, "desktop")
    : null;
  const desktopWithScreenshot = {
    ...desktopScan,
    ...(desktopScreenshot?.dataUrl ? { screenshotDataUrl: desktopScreenshot.dataUrl } : {}),
    ...(desktopScreenshot?.warning ? { screenshotWarning: desktopScreenshot.warning } : {}),
  };

  const mobileScan = prefs.includeMobile
    ? await scanMobileClone(tab, prefs)
    : null;

  const auditId = crypto.randomUUID();
  const audit = buildAuditRecord({
    id: auditId,
    sourceTab: tab,
    desktopScan: desktopWithScreenshot,
    mobileScan,
    prefs,
  });

  await saveAudit(audit);

  const summary = {
    auditId,
    resultsUrl: chrome.runtime.getURL(`result.html#audit=${encodeURIComponent(auditId)}`),
    pageTitle: audit.pageTitle,
    url: audit.url,
    totalViolations: countAuditFindings(audit, "violations"),
    totalReviewViolations: countAuditFindings(audit, "reviewViolations"),
    scannedAt: audit.scannedAt,
  };

  await storageSet(chrome.storage.local, LAST_RESULT_KEY, summary);
  await openResultTab(auditId);
  return summary;
}

async function openHistory() {
  await chrome.tabs.create({ url: chrome.runtime.getURL("result.html") });
}

chrome.runtime.onInstalled.addListener(() => {
  getPrefs()
    .then((prefs) => savePrefs({ ...DEFAULT_PREFS, ...prefs }))
    .catch(() => {});
});

chrome.permissions.onAdded.addListener((permissions) => {
  const origins = Array.isArray(permissions?.origins) ? permissions.origins : [];
  if (!origins.length) return;

  startPendingMobileScan().catch((error) => {
    console.error("[A11y Garden] Pending mobile scan failed:", error);
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "scan-current-tab") return;
  runScan()
    .catch((error) => {
      console.error("[A11y Garden] Keyboard scan failed:", error);
    });
});

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
          prefs: DEFAULT_PREFS,
          activeTab: null,
          lastResult: null,
          error: formatExtensionError(error, "Failed to load popup state."),
        });
      });
    return true;
  }

  if (message?.type === "A11Y_GARDEN_SAVE_PREFS") {
    savePrefs(message.prefs)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: formatExtensionError(error, "Failed to save settings."),
        }),
      );
    return true;
  }

  if (message?.type === "A11Y_GARDEN_SCAN_ACTIVE_TAB") {
    runScan(message.prefs)
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: formatExtensionError(error, "Scan failed."),
        }),
      );
    return true;
  }

  if (message?.type === "A11Y_GARDEN_RESUME_PENDING_MOBILE_SCAN") {
    startPendingMobileScan()
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: formatExtensionError(error, "Scan failed."),
        }),
      );
    return true;
  }

  if (message?.type === "A11Y_GARDEN_CLEAR_PENDING_MOBILE_SCAN") {
    storageRemove(chrome.storage.local, PENDING_MOBILE_SCAN_KEY)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: formatExtensionError(error, "Failed to clear pending mobile scan."),
        }),
      );
    return true;
  }

  if (message?.type === "A11Y_GARDEN_OPEN_HISTORY") {
    openHistory()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: formatExtensionError(error, "Failed to open history."),
        }),
      );
    return true;
  }

  return false;
});
