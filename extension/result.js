/* global chrome */

import { deleteAudit, getAudit, listAudits, updateAudit } from "./db.js";
import {
  DEFAULT_PREFS,
  PREFS_KEY,
  buildAgentPlanMarkdown,
  buildAiPayload,
  buildMarkdownReport,
  formatDateTime,
  formatEngineName,
  getAuditTitle,
  getAuditUrl,
  getConfirmedFindings,
  getFindingNodeCount,
  getHostLabel,
  getPrimarySelector,
  getReviewFindings,
  normalizeCounts,
  normalizePrefs,
  parseEngineSummary,
  safeFilename,
  severityLabel,
  SEVERITIES,
} from "./shared.js";
import { zipSync, strToU8 } from "./vendor/fflate.mjs";

const app = document.getElementById("app");
const historyNav = document.getElementById("history-nav");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashParams() {
  return new URLSearchParams(window.location.hash.replace(/^#/, ""));
}

function auditIdFromLocation() {
  return hashParams().get("audit");
}

function setHashAudit(id) {
  window.location.hash = id ? `audit=${encodeURIComponent(id)}` : "";
}

async function getPrefs() {
  const result = await chrome.storage.local.get(PREFS_KEY);
  return normalizePrefs(result[PREFS_KEY] ?? DEFAULT_PREFS);
}

async function getAuthState(prefs) {
  try {
    const response = await fetch(`${prefs.appOrigin}/api/extension/auth-status`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return { signedIn: false };
    const result = await response.json();
    return { signedIn: result?.signedIn === true };
  } catch {
    return { signedIn: false };
  }
}

async function savePrefs(prefs) {
  await chrome.storage.local.set({ [PREFS_KEY]: normalizePrefs(prefs) });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadText(text, filename, type = "text/markdown") {
  downloadBlob(new Blob([text], { type }), filename);
}

function dataUrlToBytes(dataUrl) {
  const [, payload = ""] = String(dataUrl).split(",");
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function renderSeverityCards(counts, ariaLabel = "Findings by severity") {
  const normalized = normalizeCounts(counts);
  return `
    <div class="severity-grid" role="list" aria-label="${escapeHtml(ariaLabel)}">
      ${SEVERITIES.map(
        (severity) => `
          <div class="severity-card severity-${severity}" role="listitem">
            <strong>${normalized[severity]}</strong>
            <span>${severityLabel(severity)}</span>
          </div>
        `,
      ).join("")}
    </div>
  `;
}

function renderIssueBeds(scan) {
  const confirmed = normalizeCounts(scan?.violations);
  const review = normalizeCounts(scan?.reviewViolations);

  return `
    <section id="issue-beds" class="panel" tabindex="-1">
      <h2>Issue Beds</h2>
      <div class="issue-section">
        <h3>Confirmed</h3>
        ${renderSeverityCards(confirmed, "Confirmed findings by severity")}
      </div>

      ${
        review.total > 0
          ? `
            <div class="issue-section">
              <h3>Needs Review</h3>
              <p class="section-note">
                Lower-confidence findings from warning-level or manual-review signals.
                Treat them as signals to verify by hand before changing code.
              </p>
              ${renderSeverityCards(review, "Needs-review findings by severity")}
            </div>
          `
          : `
            <div class="issue-section issue-section-empty">
              <h3>Needs Review</h3>
              <p class="muted">No manual-review findings were saved for this viewport.</p>
            </div>
          `
      }
    </section>
  `;
}

function renderHeroStats(scan) {
  const confirmed = normalizeCounts(scan?.violations);
  const review = normalizeCounts(scan?.reviewViolations);

  return `
    <div class="hero-stats" aria-label="Current viewport finding totals">
      <button class="hero-stat" type="button" data-scroll-target="issue-beds">
        <strong>${confirmed.total}</strong>
        <span>Confirmed issue${confirmed.total === 1 ? "" : "s"}</span>
      </button>
      <button class="hero-stat review" type="button" data-scroll-target="issue-beds">
        <strong>${review.total}</strong>
        <span>Needs review</span>
      </button>
    </div>
  `;
}

function engineStatusFor(summary, engineName) {
  return summary?.engines?.find((engine) => engine.engine === engineName)?.status;
}

function renderEngineHealth(summary) {
  const selectedEngines = Array.isArray(summary?.selectedEngines)
    ? summary.selectedEngines
    : [];
  const reviewEngines = selectedEngines.filter((engine) => engine !== "axe");
  const incomplete = reviewEngines.filter(
    (engine) => engineStatusFor(summary, engine) !== "completed",
  );

  if (incomplete.length > 0) {
    const labels = incomplete.map(formatEngineName).join(", ");
    return `
      <div class="engine-alert" role="note">
        ${escapeHtml(labels)} did not complete, so needs-review findings may be missing for this viewport.
      </div>
    `;
  }

  const reviewCount = (summary?.engines || [])
    .filter((engine) => engine.engine !== "axe")
    .reduce((total, engine) => total + Number(engine.reviewCount || 0), 0);

  if (reviewEngines.length > 0 && reviewCount === 0) {
    return `
      <div class="engine-alert neutral" role="note">
        HTML_CodeSniffer and IBM ACE completed but did not report manual-review findings for this viewport.
      </div>
    `;
  }

  return "";
}

function renderEngines(scan) {
  const summary = parseEngineSummary(scan?.engineSummary);
  if (!summary?.engines?.length) {
    return `<p class="muted">Engine details were not saved for this scan.</p>`;
  }

  const selectedEngines = Array.isArray(summary.selectedEngines)
    ? summary.selectedEngines
    : summary.engines.map((engine) => engine.engine);
  const engineRows = [
    ...summary.engines,
    ...selectedEngines
      .filter((engine) => !summary.engines.some((row) => row.engine === engine))
      .map((engine) => ({
        engine,
        status: "missing",
        durationMs: 0,
        confirmedCount: 0,
        reviewCount: 0,
        note: "The scan selected this engine, but no execution result was recorded.",
      })),
  ];

  return `
    <p class="engine-list-summary">
      This records which engines ran for this viewport. axe-core contributes confirmed
      violations; HTML_CodeSniffer and IBM ACE add review signals where available.
    </p>
    ${renderEngineHealth({ ...summary, engines: engineRows })}
    <p class="engine-list-summary">
      Selected: ${escapeHtml(selectedEngines.map(formatEngineName).join(", ") || "unknown")}
    </p>
    <div class="engine-list">
      ${engineRows
        .map(
          (engine) => `
            <div class="engine-item engine-status-${escapeHtml(engine.status)}">
              <div class="engine-item-header">
                <strong>${escapeHtml(formatEngineName(engine.engine))}</strong>
                <span class="status-badge">${escapeHtml(engine.status)}</span>
              </div>
              <p class="finding-meta">
                ${Number(engine.confirmedCount || 0)} confirmed,
                ${Number(engine.reviewCount || 0)} needs review,
                ${Number(engine.durationMs || 0)} ms
              </p>
              ${engine.note ? `<p class="muted">${escapeHtml(engine.note)}</p>` : ""}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderFindingList(title, findings) {
  if (!findings.length) {
    return `<p class="muted">No ${escapeHtml(title.toLowerCase())} in this viewport.</p>`;
  }

  return `
    <div class="finding-list">
      ${SEVERITIES.map((severity) => {
        const items = findings.filter((finding) => finding.impact === severity);
        if (!items.length) return "";
        return `
          <section aria-label="${escapeHtml(severityLabel(severity))} ${escapeHtml(title)}">
            <h3>${escapeHtml(severityLabel(severity))}</h3>
            ${items
              .map((finding) => {
                const selector = getPrimarySelector(finding);
                const nodeCount = getFindingNodeCount(finding);
                const engines = Array.isArray(finding.engines)
                  ? finding.engines.map(formatEngineName).join(", ")
                  : "";
                return `
                  <details class="finding">
                    <summary>${escapeHtml(finding.help || finding.id)}</summary>
                    <p class="finding-meta">
                      Rule <code>${escapeHtml(finding.id)}</code> -
                      ${nodeCount} affected node${nodeCount === 1 ? "" : "s"} -
                      ${escapeHtml(engines)}
                    </p>
                    <div class="finding-body">
                      <p>${escapeHtml(finding.description || "")}</p>
                      <p>Primary selector: <code>${escapeHtml(selector)}</code></p>
                      ${
                        Array.isArray(finding.wcagCriteria) && finding.wcagCriteria.length
                          ? `<p>WCAG: ${finding.wcagCriteria.map(escapeHtml).join(", ")}</p>`
                          : ""
                      }
                      ${
                        finding.helpUrl
                          ? `<p><a href="${escapeHtml(finding.helpUrl)}" target="_blank" rel="noreferrer">Rule reference</a></p>`
                          : ""
                      }
                    </div>
                  </details>
                `;
              })
              .join("")}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderScreenshot(scan, label, viewport = "desktop") {
  if (!scan?.screenshotDataUrl) {
    return `
      <div class="screenshot-note" role="note">
        <p>No ${escapeHtml(label.toLowerCase())} screenshot was captured for this scan.</p>
        ${scan?.screenshotWarning ? `<p>${escapeHtml(scan.screenshotWarning)}</p>` : ""}
      </div>
    `;
  }
  const screenshotClass = viewport === "mobile" ? "screenshot-mobile" : "screenshot-desktop";
  return `
    <img
      class="screenshot ${screenshotClass}"
      src="${escapeHtml(scan.screenshotDataUrl)}"
      alt="${escapeHtml(label)} screenshot captured during the extension scan"
    />
  `;
}

function renderScan(audit, viewport) {
  const scan = viewport === "mobile" ? audit.mobile : audit.desktop;
  const confirmed = getConfirmedFindings(scan);
  const review = getReviewFindings(scan);
  const label = viewport === "mobile" ? "Mobile clone" : "Desktop / current tab";

  return `
    <section class="panel">
      <h2>${label}</h2>
      <p class="meta">
        ${Number(scan?.viewportWidth || 0) || "?"}x${Number(scan?.viewportHeight || 0) || "?"}
        - ${escapeHtml(scan?.engineProfile === "comprehensive" ? "Comprehensive" : "Strict")} profile
      </p>
    </section>

    <details class="panel engine-disclosure">
      <summary>
        <span class="engine-disclosure-title">Scan coverage and engines</span>
        <span class="engine-disclosure-meta">
          ${escapeHtml(scan?.engineProfile === "comprehensive" ? "Comprehensive" : "Strict")}
        </span>
      </summary>
      <div class="engine-disclosure-body">
        ${renderEngines(scan)}
      </div>
    </details>

    ${renderIssueBeds(scan)}

    <section class="panel">
      <h2>Confirmed Findings (${confirmed.length})</h2>
      ${renderFindingList("Confirmed Findings", confirmed)}
    </section>

    <section class="panel">
      <h2>Needs Review Details (${review.length})</h2>
      <p class="section-note">
        These items should be manually reviewed before treating them as confirmed defects.
      </p>
      ${renderFindingList("Needs Review", review)}
    </section>

    <section class="panel">
      <h2>${label} Screenshot</h2>
      ${renderScreenshot(scan, label, viewport)}
    </section>
  `;
}

function renderAiPanel(audit, prefs) {
  const aiEnabled = prefs.aiInsights && prefs.acceptedAiTermsAt;
  const termsChecked = prefs.acceptedAiTermsAt ? "checked" : "";
  const origin = prefs.appOrigin;

  if (audit.aiSummary) {
    return `
      <section class="panel">
        <h2>AI Insights</h2>
        <p>${escapeHtml(audit.aiSummary)}</p>
        ${
          Array.isArray(audit.topIssues) && audit.topIssues.length
            ? `<ol class="top-issues">${audit.topIssues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ol>`
            : ""
        }
        ${audit.platformTip ? `<div class="ai-note">${escapeHtml(audit.platformTip)}</div>` : ""}
        <p class="muted">Generated with ${escapeHtml(audit.aiModel || "OpenAI")} from redacted local findings.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h2>AI Insights</h2>
      <div class="ai-note">
        AI is off by default. If you opt in, A11y Garden sends redacted rule metadata,
        counts, and selectors to ${escapeHtml(origin)} for analysis. HTML snippets and
        screenshots stay local.
      </div>
      <label class="terms-row">
        <input id="result-accept-ai" type="checkbox" ${termsChecked} />
        <span>I accept the AI terms and understand redacted findings may be processed by A11y Garden and OpenAI.</span>
      </label>
      <div class="toolbar">
        <button id="ai-generate" class="button" type="button" ${aiEnabled ? "" : "disabled"}>
          Generate AI Insights
        </button>
        <button id="ai-sign-in" class="button secondary" type="button">Sign In</button>
      </div>
      <p id="ai-status" class="muted" role="status" aria-live="polite"></p>
    </section>
  `;
}

async function renderResult(audit, activeViewport = "desktop") {
  const prefs = await getPrefs();
  const authState = await getAuthState(prefs);
  const canExportAgents = authState.signedIn;
  const title = getAuditTitle(audit);
  const url = getAuditUrl(audit);
  const hasMobile = Boolean(audit.mobile);
  const viewport = activeViewport === "mobile" && hasMobile ? "mobile" : "desktop";
  const activeScan = (viewport === "mobile" ? audit.mobile : audit.desktop) || audit.desktop || audit.mobile;

  app.innerHTML = `
    <section class="result-hero">
      <div>
        <p class="eyebrow">Local Extension Result</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(getHostLabel(url))}</p>
        <p class="meta">${escapeHtml(url)}</p>
        <p class="meta">Scanned ${escapeHtml(formatDateTime(audit.scannedAt))}</p>
      </div>
      ${renderHeroStats(activeScan)}
    </section>

    <div class="toolbar">
      <button id="copy-report" class="button" type="button">Copy Report</button>
      <button id="download-report" class="button secondary" type="button">Download Markdown</button>
      ${
        canExportAgents
          ? `<button id="download-agents" class="button secondary" type="button">Download AGENTS.md</button>`
          : ""
      }
      <button id="download-zip" class="button secondary" type="button">Download ZIP</button>
      <button id="delete-audit" class="button danger" type="button">Delete Local Result</button>
    </div>

    ${hasMobile ? `
      <div class="tabs" role="tablist" aria-label="Viewport results">
        <button class="tab" role="tab" type="button" data-viewport="desktop" aria-selected="${viewport === "desktop"}">Desktop</button>
        <button class="tab" role="tab" type="button" data-viewport="mobile" aria-selected="${viewport === "mobile"}">Mobile</button>
      </div>
    ` : ""}

    <div class="grid">
      <div class="stack">
        ${renderScan(audit, viewport)}
      </div>
      <aside class="stack side-stack">
        ${renderAiPanel(audit, prefs)}
        <section class="panel">
          <h2>Privacy</h2>
          <p class="muted">
            Core scan data, history, screenshots, and exports live in Chrome extension storage.
            Nothing is uploaded unless you explicitly generate AI insights.
          </p>
        </section>
      </aside>
    </div>
  `;

  wireResultActions(audit, viewport, canExportAgents);
  app.focus();
}

function wireResultActions(audit, viewport, canExportAgents) {
  const filenameBase = safeFilename(getHostLabel(getAuditUrl(audit)), "a11y-garden-report");

  document.getElementById("copy-report")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(buildMarkdownReport(audit));
  });

  document.getElementById("download-report")?.addEventListener("click", () => {
    downloadText(buildMarkdownReport(audit), `${filenameBase}-a11y-report.md`);
  });

  document.getElementById("download-agents")?.addEventListener("click", () => {
    downloadText(buildAgentPlanMarkdown(audit), "AGENTS.md");
  });

  document.getElementById("download-zip")?.addEventListener("click", () => {
    const files = {
      "a11y-report.md": strToU8(buildMarkdownReport(audit)),
      "audit.json": strToU8(JSON.stringify(redactAuditForJson(audit), null, 2)),
    };
    if (canExportAgents) {
      files["AGENTS.md"] = strToU8(buildAgentPlanMarkdown(audit));
    }
    if (audit.desktop?.screenshotDataUrl) {
      files["desktop-screenshot.jpg"] = dataUrlToBytes(audit.desktop.screenshotDataUrl);
    }
    if (audit.mobile?.screenshotDataUrl) {
      files["mobile-screenshot.jpg"] = dataUrlToBytes(audit.mobile.screenshotDataUrl);
    }
    const zipped = zipSync(files);
    downloadBlob(new Blob([zipped], { type: "application/zip" }), `${filenameBase}-a11y-garden.zip`);
  });

  document.getElementById("delete-audit")?.addEventListener("click", async () => {
    await deleteAudit(audit.id);
    setHashAudit("");
    await renderHistory();
  });

  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => {
      renderResult(audit, tab.dataset.viewport || viewport);
    });
  }

  for (const button of document.querySelectorAll("[data-scroll-target]")) {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.scrollTarget || "");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
  }

  document.getElementById("result-accept-ai")?.addEventListener("change", async (event) => {
    const prefs = await getPrefs();
    await savePrefs({
      ...prefs,
      aiInsights: event.currentTarget.checked,
      acceptedAiTermsAt: event.currentTarget.checked ? Date.now() : null,
    });
    await renderResult(audit, viewport);
  });

  document.getElementById("ai-sign-in")?.addEventListener("click", async () => {
    const prefs = await getPrefs();
    const url = `${prefs.appOrigin}/extension/auth?from=extension`;
    await chrome.tabs.create({ url });
  });

  document.getElementById("ai-generate")?.addEventListener("click", async () => {
    await generateAiInsights(audit, viewport);
  });
}

function redactAuditForJson(audit) {
  return {
    ...audit,
    desktop: audit.desktop
      ? { ...audit.desktop, screenshotDataUrl: audit.desktop.screenshotDataUrl ? "[stored in ZIP]" : undefined }
      : undefined,
    mobile: audit.mobile
      ? { ...audit.mobile, screenshotDataUrl: audit.mobile.screenshotDataUrl ? "[stored in ZIP]" : undefined }
      : undefined,
  };
}

async function generateAiInsights(audit, viewport) {
  const status = document.getElementById("ai-status");
  const button = document.getElementById("ai-generate");
  const prefs = await getPrefs();

  if (!prefs.aiInsights || !prefs.acceptedAiTermsAt) {
    if (status) status.textContent = "Accept the AI terms first.";
    return;
  }

  if (status) status.textContent = "Generating AI insights...";
  if (button) button.disabled = true;

  try {
    const response = await fetch(`${prefs.appOrigin}/api/extension/ai-summary`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildAiPayload(audit), viewport }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `AI request failed with HTTP ${response.status}.`);
    }

    const updated = await updateAudit(audit.id, {
      ...audit,
      aiSummary: result.summary,
      topIssues: Array.isArray(result.topIssues) ? result.topIssues : [],
      platformTip: result.platformTip,
      aiModel: result.model,
      aiGeneratedAt: Date.now(),
    });

    await renderResult(updated, viewport);
  } catch (error) {
    if (status) {
      status.textContent =
        error instanceof Error ? error.message : "AI insights failed.";
    }
  } finally {
    if (button) button.disabled = false;
  }
}

async function renderHistory() {
  const audits = await listAudits(100);
  if (!audits.length) {
    app.innerHTML = `
      <section class="empty-state">
        <p class="eyebrow">Local History</p>
        <h1>No scans yet</h1>
        <p class="lede">Use the extension popup or Alt+Shift+A on a regular http(s) page.</p>
      </section>
    `;
    return;
  }

  app.innerHTML = `
    <section class="page-heading">
      <p class="eyebrow">Local History</p>
      <h1>Your extension scans</h1>
      <p class="lede">Results are stored in this browser only.</p>
    </section>
    <section class="history-list" aria-label="Saved audits">
      ${audits
        .map((audit) => {
          const confirmedTotal = Number(audit.desktop?.violations?.total ?? 0);
          const reviewTotal = Number(audit.desktop?.reviewViolations?.total ?? 0);
          return `
            <article class="history-card">
              <div>
                <p class="eyebrow">Local Result</p>
                <h2>${escapeHtml(getAuditTitle(audit))}</h2>
                <p class="meta">${escapeHtml(getAuditUrl(audit))}</p>
                <p class="meta">
                  ${escapeHtml(formatDateTime(audit.scannedAt))} -
                  ${confirmedTotal} confirmed issue${confirmedTotal === 1 ? "" : "s"},
                  ${reviewTotal} needs review
                </p>
              </div>
              <div class="history-actions">
                <button class="button" type="button" data-open-audit="${escapeHtml(audit.id)}">Open</button>
                <button class="button danger" type="button" data-delete-audit="${escapeHtml(audit.id)}">Delete</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </section>
  `;

  for (const button of document.querySelectorAll("[data-open-audit]")) {
    button.addEventListener("click", () => {
      setHashAudit(button.dataset.openAudit);
    });
  }
  for (const button of document.querySelectorAll("[data-delete-audit]")) {
    button.addEventListener("click", async () => {
      await deleteAudit(button.dataset.deleteAudit);
      await renderHistory();
    });
  }
}

async function route() {
  const auditId = auditIdFromLocation();
  if (!auditId) {
    await renderHistory();
    return;
  }

  const audit = await getAudit(auditId);
  if (!audit) {
    app.innerHTML = `
      <section class="empty-state">
        <p class="eyebrow">Missing Result</p>
        <h1>That local scan is not available</h1>
        <p class="lede">It may have been deleted, or it belongs to another browser profile.</p>
      </section>
    `;
    return;
  }

  await renderResult(audit);
}

historyNav.addEventListener("click", () => {
  setHashAudit("");
  renderHistory().catch((error) => {
    app.textContent = error instanceof Error ? error.message : "Failed to load history.";
  });
});

window.addEventListener("hashchange", () => {
  route().catch((error) => {
    app.textContent = error instanceof Error ? error.message : "Failed to load result.";
  });
});

route().catch((error) => {
  app.textContent = error instanceof Error ? error.message : "Failed to load result.";
});
