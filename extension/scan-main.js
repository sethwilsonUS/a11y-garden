(function () {
  const SAFE_RULES = [
    "image-alt",
    "image-redundant-alt",
    "input-image-alt",
    "area-alt",
    "label",
    "form-field-multiple-labels",
    "select-name",
    "input-button-name",
    "link-name",
    "button-name",
    "document-title",
    "html-has-lang",
    "html-lang-valid",
    "valid-lang",
    "page-has-heading-one",
    "bypass",
    "td-headers-attr",
    "th-has-data-cells",
    "table-fake-caption",
    "landmark-one-main",
    "region",
    "heading-order",
    "empty-heading",
    "duplicate-id",
    "duplicate-id-active",
    "duplicate-id-aria",
    "aria-allowed-attr",
    "aria-hidden-body",
    "aria-hidden-focus",
    "aria-required-attr",
    "aria-required-children",
    "aria-required-parent",
    "aria-roles",
    "aria-valid-attr",
    "aria-valid-attr-value",
    "tabindex",
    "focus-order-semantics",
    "video-caption",
    "audio-caption",
    "meta-viewport",
    "meta-refresh",
    "blink",
    "marquee",
    "server-side-image-map",
  ];

  const SERIOUS_CRITERIA = new Set([
    "1.1.1",
    "1.3.1",
    "1.3.2",
    "1.4.3",
    "1.4.4",
    "1.4.10",
    "1.4.11",
    "2.1.1",
    "2.1.2",
    "2.4.1",
    "2.4.3",
    "2.4.4",
    "2.4.6",
    "2.4.7",
    "2.5.3",
    "3.3.1",
    "3.3.2",
    "4.1.2",
    "4.1.3",
  ]);

  const MINOR_CRITERIA = new Set(["2.4.2", "3.1.1", "3.2.4"]);
  const FALLBACK_SERIOUS_ID_RE =
    /alt|label|name|heading|focus|keyboard|lang|role|aria|caption|contrast|title|tabindex|skip|landmark|duplicate/i;
  const HTMLCS_TRANSLATION_FALLBACKS = {
    "4_1_2_attribute": "attribute",
  };

  function normalizeTextToken(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function computeFindingDedupKey(disposition, selector, wcagCriteria, fallbackId) {
    const selectorKey = String(selector || "document").trim().toLowerCase() || "document";
    const wcagKey = Array.isArray(wcagCriteria) && wcagCriteria.length > 0
      ? [...wcagCriteria].sort().join("|")
      : normalizeTextToken(fallbackId) || "generic";
    return `${disposition}:${selectorKey}:${wcagKey}`;
  }

  function extractWcagCriteriaFromAxeTags(tags) {
    const criteria = new Set();
    for (const tag of tags || []) {
      const match = String(tag).match(/^wcag(\d)(\d)(\d)$/i);
      if (match) criteria.add(`${match[1]}.${match[2]}.${match[3]}`);
    }
    return [...criteria].sort();
  }

  function normalizeWcagCriterion(raw) {
    const cleaned = String(raw || "").replace(/_/g, ".").trim();
    const match = cleaned.match(/^(\d)\.(\d)\.(\d)$/);
    return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
  }

  function extractWcagCriteriaFromHtmlcsCode(code) {
    const criteria = new Set();
    const matches = String(code || "").matchAll(/Guideline\d+_\d+\.(\d+_\d+_\d+)/g);
    for (const match of matches) {
      const criterion = normalizeWcagCriterion(match[1]);
      if (criterion) criteria.add(criterion);
    }
    return [...criteria].sort();
  }

  function baseHeuristicImpact(ruleId, wcagCriteria) {
    if ((wcagCriteria || []).some((criterion) => SERIOUS_CRITERIA.has(criterion))) {
      return "serious";
    }
    if ((wcagCriteria || []).some((criterion) => MINOR_CRITERIA.has(criterion))) {
      return "minor";
    }
    if (FALLBACK_SERIOUS_ID_RE.test(String(ruleId || ""))) {
      return "serious";
    }
    return "moderate";
  }

  function inferHeuristicImpact(ruleId, wcagCriteria, disposition) {
    if (disposition === "needs-review") {
      return baseHeuristicImpact(ruleId, wcagCriteria);
    }
    return baseHeuristicImpact(ruleId, wcagCriteria);
  }

  function normalizeImpact(value) {
    if (value === "critical") return "critical";
    if (value === "serious") return "serious";
    if (value === "moderate") return "moderate";
    return "minor";
  }

  function dedupeNodes(nodes) {
    const seen = new Set();
    const deduped = [];
    for (const node of nodes || []) {
      const key = [
        node.selector || "",
        Array.isArray(node.target) ? node.target.join(" ") : "",
        node.xpath || "",
        node.html || "",
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(node);
    }
    return deduped;
  }

  function getPrimarySelector(finding) {
    const selectorNode = (finding.nodes || []).find((node) => node.selector);
    if (selectorNode?.selector) return selectorNode.selector;
    const targetNode = (finding.nodes || []).find((node) => Array.isArray(node.target) && node.target.length > 0);
    return targetNode?.target?.join(" ") || "document";
  }

  function sortEngines(engines) {
    const order = { axe: 0, ace: 1, htmlcs: 2 };
    return [...new Set(engines || [])].sort((left, right) => order[left] - order[right]);
  }

  function getBestEngine(engines) {
    return sortEngines(engines)[0] || "axe";
  }

  function compareImpact(left, right) {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    return order[left] - order[right];
  }

  function normalizeAxeViolations(violations) {
    return (violations || []).map((violation) => {
      const wcagCriteria = extractWcagCriteriaFromAxeTags(violation.tags || []);
      const nodes = dedupeNodes(
        (violation.nodes || []).map((node) => ({
          selector: Array.isArray(node.target) ? node.target.join(" ") : "document",
          ...(Array.isArray(node.target) ? { target: [...node.target] } : {}),
          ...(node.html ? { html: node.html } : {}),
          ...(node.failureSummary ? { failureSummary: node.failureSummary } : {}),
        })),
      );

      return {
        id: violation.id,
        dedupKey: computeFindingDedupKey(
          "confirmed",
          nodes[0]?.selector || "document",
          wcagCriteria,
          violation.id,
        ),
        engines: ["axe"],
        engineRuleIds: { axe: [violation.id] },
        disposition: "confirmed",
        impact: normalizeImpact(violation.impact),
        help: violation.help || violation.id,
        description: violation.description || violation.help || violation.id,
        ...(violation.helpUrl ? { helpUrl: violation.helpUrl } : {}),
        wcagCriteria,
        wcagTags: [...(violation.tags || [])],
        nodes,
      };
    });
  }

  function escapeIdent(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildSelector(rawElement) {
    const element = rawElement && typeof rawElement.tagName === "string" ? rawElement : null;
    if (!element) return "document";
    if (element.id) return `#${escapeIdent(element.id)}`;

    const parts = [];
    let current = element;

    while (current && parts.length < 5) {
      if (typeof current.tagName !== "string") break;
      let part = current.tagName.toLowerCase();
      const classNames = Array.from(current.classList || [])
        .slice(0, 2)
        .map((item) => escapeIdent(item));
      if (classNames.length > 0) {
        part += `.${classNames.join(".")}`;
      }

      const parent = current.parentElement && typeof current.parentElement.tagName === "string"
        ? current.parentElement
        : null;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (candidate) => candidate.tagName === current.tagName,
        );
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }

      parts.unshift(part);
      current = parent;
    }

    return parts.join(" > ") || element.tagName.toLowerCase();
  }

  function helpUrlForCriteria(criteria) {
    const standard = criteria.length > 0 ? "WCAG2AA" : "WCAG2AA";
    return `https://squizlabs.github.io/HTML_CodeSniffer/Standards/${standard}/`;
  }

  function groupHtmlcsMessages(messages) {
    const grouped = new Map();
    for (const message of messages || []) {
      if (message.type === 3) continue;

      const disposition = message.type === 1 ? "confirmed" : "needs-review";
      const wcagCriteria = extractWcagCriteriaFromHtmlcsCode(message.code);
      const key = `${disposition}:${message.code}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.nodes.push({
          selector: message.selector || "document",
          ...(message.html ? { html: message.html } : {}),
        });
        continue;
      }

      grouped.set(key, {
        id: message.code,
        dedupKey: "",
        engines: ["htmlcs"],
        engineRuleIds: { htmlcs: [message.code] },
        disposition,
        impact: inferHeuristicImpact(message.code, wcagCriteria, disposition),
        help: message.msg,
        description: message.msg,
        helpUrl: helpUrlForCriteria(wcagCriteria),
        wcagCriteria,
        wcagTags: [],
        nodes: [
          {
            selector: message.selector || "document",
            ...(message.html ? { html: message.html } : {}),
          },
        ],
      });
    }

    return [...grouped.values()].map((finding) => ({
      ...finding,
      dedupKey: computeFindingDedupKey(
        finding.disposition,
        getPrimarySelector(finding),
        finding.wcagCriteria,
        finding.id,
      ),
    }));
  }

  function xpathToCssSelector(xpath) {
    if (!xpath) return "document";
    return String(xpath)
      .split("/")
      .filter(Boolean)
      .map((segment) => {
        const match = segment.match(/^([a-zA-Z0-9_-]+)(?:\[(\d+)\])?$/);
        if (!match) return "";
        return match[2]
          ? `${match[1].toLowerCase()}:nth-of-type(${match[2]})`
          : match[1].toLowerCase();
      })
      .filter(Boolean)
      .join(" > ") || "document";
  }

  function aceDispositionFromValue(value) {
    const kind = value?.[0];
    const outcome = value?.[1];
    if (outcome === "PASS") return null;
    if (kind === "VIOLATION" && outcome === "FAIL") return "confirmed";
    return "needs-review";
  }

  function softenImpactByOneLevel(impact) {
    if (impact === "serious") return "moderate";
    if (impact === "moderate") return "minor";
    return "minor";
  }

  function inferAceImpact(result, wcagCriteria, disposition) {
    const base = inferHeuristicImpact(result.ruleId, wcagCriteria, disposition);
    if (disposition !== "needs-review") return base;

    const policy = result.value?.[0];
    if (policy && policy !== "VIOLATION") {
      return softenImpactByOneLevel(base);
    }

    return base;
  }

  function normalizeAceResults(results) {
    const grouped = new Map();

    for (const result of results || []) {
      const disposition = aceDispositionFromValue(result.value);
      if (!disposition) continue;

      const engineRuleId = result.reasonId
        ? `${result.ruleId}#${result.reasonId}`
        : result.ruleId;
      const selector = xpathToCssSelector(result.path?.dom);
      const key = `${disposition}:${engineRuleId}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.nodes.push({
          selector,
          ...(result.snippet ? { html: result.snippet } : {}),
          ...(result.path?.dom ? { xpath: result.path.dom } : {}),
        });
        continue;
      }

      grouped.set(key, {
        id: result.ruleId,
        dedupKey: "",
        engines: ["ace"],
        engineRuleIds: { ace: [engineRuleId] },
        disposition,
        impact: inferAceImpact(result, [], disposition),
        help: result.message || result.ruleId,
        description: result.message || result.ruleId,
        wcagCriteria: [],
        wcagTags: [],
        nodes: [
          {
            selector,
            ...(result.snippet ? { html: result.snippet } : {}),
            ...(result.path?.dom ? { xpath: result.path.dom } : {}),
          },
        ],
      });
    }

    return [...grouped.values()].map((finding) => ({
      ...finding,
      dedupKey: computeFindingDedupKey(
        finding.disposition,
        getPrimarySelector(finding),
        finding.wcagCriteria,
        finding.id,
      ),
    }));
  }

  function dedupeStrings(values) {
    return [...new Set((values || []).filter(Boolean))].sort();
  }

  function findingIntent(finding) {
    if ((finding.wcagCriteria || []).length > 0) {
      return [...finding.wcagCriteria].sort().join("|");
    }
    return normalizeTextToken(finding.help || finding.id);
  }

  function selectorsOverlap(left, right) {
    const leftSelectors = new Set(
      (left.nodes || [])
        .map((node) => node.selector || (node.target || []).join(" ") || "")
        .filter(Boolean),
    );
    const rightSelectors = (right.nodes || [])
      .map((node) => node.selector || (node.target || []).join(" ") || "")
      .filter(Boolean);

    if (leftSelectors.size === 0 || rightSelectors.length === 0) {
      return getPrimarySelector(left) === getPrimarySelector(right);
    }

    return rightSelectors.some((selector) => leftSelectors.has(selector));
  }

  function shouldMergeFindings(left, right) {
    if (left.disposition !== right.disposition) return false;
    if (!selectorsOverlap(left, right)) return false;

    const leftCriteria = new Set(left.wcagCriteria || []);
    const sharedCriteria = (right.wcagCriteria || []).some((item) => leftCriteria.has(item));
    if (leftCriteria.size > 0 && (right.wcagCriteria || []).length > 0) {
      return sharedCriteria;
    }

    return findingIntent(left) === findingIntent(right);
  }

  function mergeEngineRuleIds(left, right) {
    const merged = { ...left };
    for (const [engine, ruleIds] of Object.entries(right || {})) {
      merged[engine] = dedupeStrings([...(merged[engine] || []), ...(ruleIds || [])]);
    }
    return merged;
  }

  function isPreferredMetadata(current, incoming) {
    const priority = { axe: 0, ace: 1, htmlcs: 2 };
    return priority[getBestEngine(incoming.engines)] < priority[getBestEngine(current.engines)];
  }

  function deduplicateFindings(findings) {
    const merged = [];

    for (const finding of findings || []) {
      const existing = merged.find((candidate) => shouldMergeFindings(candidate, finding));

      if (!existing) {
        merged.push({
          ...finding,
          engines: sortEngines(finding.engines),
          engineRuleIds: mergeEngineRuleIds({}, finding.engineRuleIds),
          wcagCriteria: dedupeStrings(finding.wcagCriteria),
          wcagTags: dedupeStrings(finding.wcagTags),
          nodes: dedupeNodes(finding.nodes),
        });
        continue;
      }

      existing.engines = sortEngines([...(existing.engines || []), ...(finding.engines || [])]);
      existing.engineRuleIds = mergeEngineRuleIds(existing.engineRuleIds, finding.engineRuleIds);
      existing.wcagCriteria = dedupeStrings([...(existing.wcagCriteria || []), ...(finding.wcagCriteria || [])]);
      existing.wcagTags = dedupeStrings([...(existing.wcagTags || []), ...(finding.wcagTags || [])]);
      existing.nodes = dedupeNodes([...(existing.nodes || []), ...(finding.nodes || [])]);

      if (compareImpact(finding.impact, existing.impact) < 0) {
        existing.impact = finding.impact;
      }

      if (isPreferredMetadata(existing, finding)) {
        existing.id = finding.id;
        existing.help = finding.help;
        existing.description = finding.description;
        existing.helpUrl = finding.helpUrl || existing.helpUrl;
      } else if (!existing.helpUrl && finding.helpUrl) {
        existing.helpUrl = finding.helpUrl;
      }
    }

    return merged
      .map((finding) => ({
        ...finding,
        dedupKey: computeFindingDedupKey(
          finding.disposition,
          getPrimarySelector(finding),
          finding.wcagCriteria,
          finding.id,
        ),
      }))
      .sort((left, right) => {
        if (left.disposition !== right.disposition) {
          return left.disposition === "confirmed" ? -1 : 1;
        }
        const impactComparison = compareImpact(left.impact, right.impact);
        if (impactComparison !== 0) return impactComparison;
        return String(left.help).localeCompare(String(right.help));
      });
  }

  function emptyCounts() {
    return { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 };
  }

  function countFindings(findings, disposition) {
    const counts = emptyCounts();
    for (const finding of findings || []) {
      if (disposition && finding.disposition !== disposition) continue;
      counts[finding.impact] += 1;
      counts.total += 1;
    }
    return counts;
  }

  function summarizeFindings(findings) {
    return {
      confirmed: countFindings(findings, "confirmed"),
      review: countFindings(findings, "needs-review"),
    };
  }

  async function runAxe() {
    if (!window.axe || typeof window.axe.run !== "function") {
      throw new Error("axe-core did not load");
    }

    const root = document.body || document.documentElement;
    let usedSafeMode = false;
    let fullScanError = "";
    let results;

    window.axe.reset();
    try {
      results = await window.axe.run(root, {
        resultTypes: ["violations"],
        elementRef: false,
      });
    } catch (error) {
      usedSafeMode = true;
      fullScanError = error instanceof Error ? error.message : "Unknown axe error";
      window.axe.reset();
      results = await window.axe.run(root, {
        runOnly: { type: "rule", values: SAFE_RULES },
        resultTypes: ["violations"],
        elementRef: false,
      });
    }

    const violations = results.violations || [];
    const findings = normalizeAxeViolations(violations);
    const rulesRun = violations.length + (results.passes || []).length;

    return {
      findings,
      scanModeInfo: usedSafeMode
        ? {
            mode: "safe-rules",
            reason: `Full scan failed: ${fullScanError}. Fell back to safe rule subset.`,
            rulesRun,
            skippedCategories: [],
          }
        : {
            mode: "full",
            rulesRun,
            skippedCategories: [],
          },
    };
  }

  async function runHtmlcs() {
    if (!window.HTMLCS) {
      throw new Error("HTML CodeSniffer did not load");
    }

    // HTML CodeSniffer 2.6.0 references 4_1_2_attribute but omits the en translation.
    // Patch the lookup locally so deep scans on complex apps like Gmail do not spam
    // extension errors for a vendor bug.
    if (
      typeof window.HTMLCS.getTranslation === "function" &&
      window.__A11yGardenHtmlcsCompatApplied !== true
    ) {
      const originalGetTranslation = window.HTMLCS.getTranslation.bind(window.HTMLCS);
      window.HTMLCS.getTranslation = (key) => {
        if (Object.prototype.hasOwnProperty.call(HTMLCS_TRANSLATION_FALLBACKS, key)) {
          return HTMLCS_TRANSLATION_FALLBACKS[key];
        }
        return originalGetTranslation(key);
      };
      window.__A11yGardenHtmlcsCompatApplied = true;
    }

    const messages = await new Promise((resolve) => {
      window.HTMLCS.process("WCAG2AA", document, () => {
        const rawMessages = window.HTMLCS.getMessages();
        resolve(
          rawMessages.map((message) => ({
            type: message.type,
            code: message.code,
            msg: message.msg,
            selector: buildSelector(message.element),
            html:
              message.element && typeof message.element.outerHTML === "string"
                ? message.element.outerHTML
                : undefined,
          })),
        );
      });
    });

    return groupHtmlcsMessages(messages);
  }

  async function runAce() {
    if (!window.ace || typeof window.ace.Checker !== "function") {
      throw new Error("ACE did not load");
    }

    const checker = new window.ace.Checker();
    const report = await checker.check(document, ["WCAG_2_2"]);
    return normalizeAceResults(report.results || report.report?.results || []);
  }

  function buildCompletedSummary(engine, findings, durationMs, note) {
    const counts = summarizeFindings(findings);
    return {
      engine,
      status: "completed",
      durationMs,
      confirmedCount: counts.confirmed.total,
      reviewCount: counts.review.total,
      ...(note ? { note } : {}),
    };
  }

  function buildFailureSummary(engine, durationMs, error) {
    return {
      engine,
      status: "failed",
      durationMs,
      confirmedCount: 0,
      reviewCount: 0,
      note: error instanceof Error ? error.message : "Unknown engine error",
    };
  }

  async function runScan(mode) {
    const engineProfile = mode === "deep" ? "comprehensive" : "strict";
    const selectedEngines = engineProfile === "comprehensive"
      ? ["axe", "htmlcs", "ace"]
      : ["axe"];
    const findings = [];
    const summaries = [];
    let scanModeInfo = { mode: "full", rulesRun: 0, skippedCategories: [] };

    const axeStart = Date.now();
    try {
      const axeResult = await runAxe();
      findings.push(...axeResult.findings);
      scanModeInfo = axeResult.scanModeInfo;
      summaries.push(
        buildCompletedSummary(
          "axe",
          axeResult.findings,
          Date.now() - axeStart,
          axeResult.scanModeInfo.reason,
        ),
      );
    } catch (error) {
      summaries.push(buildFailureSummary("axe", Date.now() - axeStart, error));
    }

    if (selectedEngines.includes("htmlcs")) {
      const start = Date.now();
      try {
        const htmlcsFindings = await runHtmlcs();
        findings.push(...htmlcsFindings);
        summaries.push(
          buildCompletedSummary("htmlcs", htmlcsFindings, Date.now() - start),
        );
      } catch (error) {
        summaries.push(buildFailureSummary("htmlcs", Date.now() - start, error));
      }
    }

    if (selectedEngines.includes("ace")) {
      const start = Date.now();
      try {
        const aceFindings = await runAce();
        findings.push(...aceFindings);
        summaries.push(
          buildCompletedSummary("ace", aceFindings, Date.now() - start),
        );
      } catch (error) {
        summaries.push(buildFailureSummary("ace", Date.now() - start, error));
      }
    }

    if (
      findings.length === 0 &&
      summaries.length > 0 &&
      summaries.every((summary) => summary.status === "failed")
    ) {
      throw new Error("All accessibility engines failed");
    }

    const deduplicated = deduplicateFindings(findings);
    const counts = summarizeFindings(deduplicated);

    return {
      url: window.location.href,
      pageTitle: document.title || window.location.hostname,
      engineProfile,
      findingsVersion: 2,
      rawFindings: JSON.stringify(deduplicated),
      violations: counts.confirmed,
      reviewViolations: counts.review,
      engineSummary: {
        selectedEngines,
        engines: summaries,
      },
      scanMode:
        scanModeInfo.mode === "safe-rules" ? "safe" : "full",
      scanModeDetail: JSON.stringify(scanModeInfo),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  window.__A11yGardenRunScan = async function __A11yGardenRunScan(mode) {
    return await runScan(mode);
  };
})();
