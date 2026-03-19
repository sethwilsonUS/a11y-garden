# A11y Garden: Multi-Engine Scanning — Codex Implementation Plan

## Overview

A11y Garden currently uses axe-core as its sole scanning engine. axe-core guarantees zero false positives but catches roughly 57% of automatically-detectable WCAG issues. Research shows that HTML_CodeSniffer (used by Pa11y) and IBM's accessibility-checker-engine (ACE) each find issues the others miss — combining axe-core with HTML_CodeSniffer alone bumps coverage from ~27% to ~35% of known issues. Adding IBM ACE, which has its own W3C ACT-Rules-harmonized ruleset, extends coverage further.[^1][^2][^3]

This plan introduces two scanning modes:

- **Strict Mode** — axe-core only (current behavior, zero false positives guaranteed)
- **Comprehensive Mode** — axe-core + HTML_CodeSniffer + IBM ACE (maximum coverage, may include warnings/notices that need manual review)

***

## Why These Three Engines

| Engine | NPM Package | What It Catches | False Positive Policy | Standard |
|--------|-------------|-----------------|----------------------|----------|
| **axe-core** (current) | `axe-core` | ~57% WCAG issues | Zero false positives guaranteed | WCAG 2.2 A/AA[^3] |
| **HTML_CodeSniffer** | `@pa11y/html_codesniffer` | ~20% of issues (different set from axe) | Returns errors, warnings, and notices — warnings/notices need manual review[^4] | WCAG 2.1 A/AA/AAA, Section 508[^5] |
| **IBM ACE** | `accessibility-checker-engine` | IBM Accessibility ruleset, harmonized with W3C ACT-Rules | Returns violations, needs-review, and recommendations[^6] | IBM Accessibility, WCAG 2.2/2.1/2.0 A/AA[^1] |

The key insight: each tool finds things the others do not. In a controlled comparison of 142 issues, 20 were found by axe-core but not Pa11y, and 10 were found by Pa11y but not axe-core. IBM ACE adds a third dimension with its own unique ruleset based on IBM Accessibility Requirements.[^2][^7]

***

## Architecture Decisions

### Engine Integration Strategy

Both HTML_CodeSniffer and IBM ACE are pure JavaScript engines that can be injected into a DOM — no separate browser sessions are needed. This means:[^5][^6]

- **Playwright path (BaaS/local):** Inject all three engines into the same `page.evaluate()` call. The page is already loaded; each engine runs its checks against the live DOM.
- **BQL + JSDOM path:** All three engines work with JSDOM. axe-core already runs server-side this way. HTML_CodeSniffer explicitly supports JSDOM. IBM ACE's `ace.Checker.check(document, ...)` accepts any DOM object.[^6][^8][^9]
- **No extra browser sessions, no extra Browserless units, no extra latency** — the engines piggyback on the existing scan.

### Result Normalization

Each engine returns a different format. A normalization layer converts all results into a unified schema, then deduplicates across engines using CSS selector + rule-intent matching.

### Mode Selection

The mode is a user-facing toggle that controls which engines run. The default stays **Strict Mode** (current behavior) so nothing changes for existing users.

***

## Implementation Plan

### Phase 1: Engine Abstraction Layer

**Goal:** Decouple the scanning logic from axe-core so multiple engines can plug in.

#### Task 1.1 — Define Unified Violation Interface

Create `src/lib/engines/types.ts`:

```typescript
export type EngineName = 'axe-core' | 'htmlcs' | 'ibm-ace';
export type ScanMode = 'strict' | 'comprehensive';

export interface UnifiedViolation {
  id: string;                    // Normalized rule ID
  engine: EngineName;            // Which engine found this
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;           // Human-readable description
  help: string;                  // Short help text
  helpUrl?: string;              // Link to documentation
  wcagCriteria: string[];        // e.g., ["1.1.1", "4.1.2"]
  selector: string;              // CSS selector of the offending element
  html: string;                  // Snippet of the offending HTML
  needsReview: boolean;          // true for HTMLCS warnings/notices, IBM needs-review
  engineRawCode: string;         // Original rule code from the engine
}

export interface EngineResult {
  engine: EngineName;
  violations: UnifiedViolation[];
  scanDurationMs: number;
  rulesRun: number;
}
```

#### Task 1.2 — Create Engine Runner Interface

Create `src/lib/engines/engine-runner.ts`:

```typescript
export interface EngineRunner {
  name: EngineName;
  // For Playwright: runs inside page.evaluate()
  getBrowserScript(): string;
  parseBrowserResult(raw: unknown): UnifiedViolation[];
  // For JSDOM: runs server-side
  runOnDocument?(document: Document): Promise<UnifiedViolation[]>;
}
```

#### Task 1.3 — Wrap Existing axe-core as an Engine Runner

Create `src/lib/engines/axe-runner.ts` — extract the current axe-core logic from the scan route into this runner. The existing `page.evaluate()` axe injection code moves here. The existing JSDOM axe logic moves into the `runOnDocument` method.

***

### Phase 2: Add HTML_CodeSniffer Engine

**Goal:** Integrate HTML_CodeSniffer (the engine Pa11y uses by default).[^10][^11]

#### Task 2.1 — Install Dependencies

```bash
npm install @pa11y/html_codesniffer
```

Use the `@pa11y/html_codesniffer` fork (v2.6.0) which is actively maintained and includes the latest WCAG 2.1 updates.[^12][^13]

#### Task 2.2 — Create HTMLCS Runner

Create `src/lib/engines/htmlcs-runner.ts`:

**Browser injection approach:** Bundle the HTMLCS source as a string (it's a single-file JS library), inject it into the page via `page.evaluate()`, call `HTMLCS.process('WCAG2AA', document, callback)`, then collect messages via `HTMLCS.getMessages()`.[^5]

**JSDOM approach:** Load HTMLCS in the same JSDOM window used for the axe-core structural scan. HTMLCS explicitly supports running server-side with JSDOM.[^9]

**Result mapping:**

| HTMLCS Message Type | Maps To |
|---------------------|---------|
| `ERROR` (type 1) | `needsReview: false`, impact based on WCAG level |
| `WARNING` (type 2) | `needsReview: true`, impact `'moderate'` |
| `NOTICE` (type 3) | Filtered out in Comprehensive Mode (too noisy) |

**WCAG criteria extraction:** HTMLCS codes follow the pattern `WCAG2AA.Principle1.Guideline1_1.1_1_1.H37` — parse the guideline portion to extract the WCAG success criterion (e.g., `1.1.1`).[^14]

#### Task 2.3 — Deduplication Logic

HTMLCS and axe-core frequently overlap on ~13% of issues. Build a deduplication function in `src/lib/engines/dedup.ts`:[^2]

1. Group violations by CSS selector
2. Within each selector group, compare WCAG criteria
3. If two violations from different engines target the same element and same WCAG criterion, keep the one with the richer metadata (prefer axe-core, which has better help URLs), and tag it as `confirmedByEngines: ['axe-core', 'htmlcs']`
4. Unique findings from each engine pass through unmerged

***

### Phase 3: Add IBM ACE Engine

**Goal:** Integrate IBM's accessibility-checker-engine.[^6]

#### Task 3.1 — Install Dependencies

```bash
npm install accessibility-checker-engine
```

#### Task 3.2 — Create ACE Runner

Create `src/lib/engines/ace-runner.ts`:

**Browser injection approach:** The engine is available as a single `ace.js` file that can be injected via `<script>` tag or inlined. In `page.evaluate()`:[^6]

```typescript
const checker = new ace.Checker();
const report = await checker.check(document, ["WCAG_2_2"]);
```

**JSDOM approach:** Same API — pass the JSDOM `document` object. Use `["WCAG_2_2"]` as the ruleset for alignment with axe-core's WCAG 2.2 coverage.[^1]

**Result mapping:**

| IBM ACE Level | Maps To |
|---------------|---------|
| `violation` | `needsReview: false`, impact from rule metadata |
| `potentialviolation` / `recommendation` | `needsReview: true` |
| `pass` | Filtered out |

**WCAG criteria extraction:** IBM ACE results include `ruleId` and mapped requirements — extract WCAG success criteria from the `reasonId` and requirement mappings.[^7]

#### Task 3.3 — Extend Deduplication

Update `dedup.ts` to handle three-way deduplication. Same logic: group by selector + WCAG criterion, merge duplicates, keep richest metadata.

***

### Phase 4: Orchestration & Mode Toggle

**Goal:** Wire the engines together with mode selection.

#### Task 4.1 — Create Scan Orchestrator

Create `src/lib/engines/orchestrator.ts`:

```typescript
export async function runEngines(
  mode: ScanMode,
  context: PlaywrightContext | JSDOMDocument
): Promise<{
  violations: UnifiedViolation[];
  engineResults: EngineResult[];
}> {
  const engines: EngineRunner[] = [axeRunner];

  if (mode === 'comprehensive') {
    engines.push(htmlcsRunner, aceRunner);
  }

  // Run all engines in parallel
  const results = await Promise.all(
    engines.map(engine => engine.run(context))
  );

  const allViolations = results.flatMap(r => r.violations);
  const deduplicated = deduplicateViolations(allViolations);

  return { violations: deduplicated, engineResults: results };
}
```

#### Task 4.2 — Update Scan API Route

Modify `app/api/scan/route.ts`:

1. Accept a `mode` parameter (`'strict'` | `'comprehensive'`) from the request body
2. Pass `mode` to the orchestrator instead of calling axe-core directly
3. Both Playwright and BQL/JSDOM paths use the same orchestrator
4. The response shape stays the same — `desktopViolations` / `mobileViolations` arrays now contain `UnifiedViolation` objects

#### Task 4.3 — Update Grading System

Modify the grading logic to account for `needsReview` flags:

- **Strict Mode:** No change — axe-core violations are all confirmed.
- **Comprehensive Mode:** Only count `needsReview: false` violations toward the grade. Show `needsReview: true` items in a separate "Needs Review" section. This prevents warnings/notices from unfairly tanking the grade.

#### Task 4.4 — Update CLI

Add a `--mode` flag to the CLI:

```bash
npm run cli -- example.com --mode comprehensive
npm run cli -- example.com --mode strict    # default
```

Map the flag to the `ScanMode` type and pass it into the orchestrator.

***

### Phase 5: UI Changes

**Goal:** Add the mode toggle and display engine attribution.

#### Task 5.1 — Scan Form Mode Toggle

Add a toggle/segmented control to the scan form:

- **Strict Mode** (default) — "Zero false positives. Guaranteed accurate results."
- **Comprehensive Mode** — "Maximum coverage using 3 engines. Some items may need manual review."

Store the user's preference in localStorage for persistence.

#### Task 5.2 — Results Page Updates

- Add an engine badge to each violation showing which engine(s) found it (e.g., `axe`, `htmlcs`, `ibm-ace`, or `axe + htmlcs` for confirmed duplicates)
- Add a "Needs Review" section/tab for items flagged `needsReview: true`, visually distinct from confirmed violations
- Add a scan info badge showing which mode was used
- Update the summary stats to show: "X confirmed violations, Y items needing review (from 3 engines)"

#### Task 5.3 — AI Summary Update

Update the OpenAI prompt to include:

- Which mode was used
- Which engine found each issue
- Instructions to deprioritize "needs review" items in the summary
- Note when multiple engines agree on an issue (higher confidence)

#### Task 5.4 — Markdown Export Update

Update the markdown report template to include mode info, engine attribution, and a separate "Needs Review" section.

***

### Phase 6: Database & Storage

**Goal:** Persist mode and engine metadata.

#### Task 6.1 — Schema Updates

Update the Convex `audits` table schema:

```typescript
// New fields
scanMode: v.string(),           // 'strict' | 'comprehensive'
enginesUsed: v.array(v.string()), // ['axe-core'] or ['axe-core', 'htmlcs', 'ibm-ace']
```

The `desktopViolations` and `mobileViolations` arrays already accept arbitrary objects, so the new `UnifiedViolation` shape is backward-compatible. Older audits without `scanMode` default to `'strict'`.

#### Task 6.2 — Community Garden Filtering

Add a mode filter to the Community Garden browse/search page so users can filter by Strict or Comprehensive results.

***

### Phase 7: Unit Tests

- Test each engine runner independently with known HTML fixtures
- Test deduplication logic with overlapping violations
- Test the unified violation interface mapping for each engine
- Test grading with `needsReview` flag handling
- Test orchestrator mode selection (strict returns only axe-core results, comprehensive returns all three)

### End-of-Phase Verification (Every Phase)

At the end of **every phase**, run the following before moving on. This catches type errors, lint violations, and regressions early — especially important since Phases 2 and 3 can be parallelized.

```bash
npm run lint
npx tsc --noEmit
npm run test:run
```

Each phase should result in a clean, lint-passing, type-safe state. Do not proceed to the next phase if any of these commands fail.

***

## File Structure Summary

```
src/lib/engines/
├── types.ts              # UnifiedViolation, EngineResult, ScanMode, EngineName
├── engine-runner.ts      # EngineRunner interface
├── axe-runner.ts         # axe-core adapter (extracted from current code)
├── htmlcs-runner.ts      # HTML_CodeSniffer adapter
├── ace-runner.ts         # IBM ACE adapter
├── dedup.ts              # Cross-engine deduplication
├── orchestrator.ts       # Mode-aware engine dispatcher
└── __tests__/
    ├── axe-runner.test.ts
    ├── htmlcs-runner.test.ts
    ├── ace-runner.test.ts
    ├── dedup.test.ts
    └── orchestrator.test.ts
```

**Files to modify:**

| File | Change |
|------|--------|
| `app/api/scan/route.ts` | Accept `mode` param, use orchestrator instead of direct axe-core |
| `src/cli/index.ts` (or equivalent) | Add `--mode` flag |
| Convex schema file | Add `scanMode`, `enginesUsed` fields |
| Scan form component | Add mode toggle |
| Results page component | Add engine badges, "Needs Review" section |
| AI summary prompt | Include mode, engine attribution, review-item guidance |
| Grading utility | Handle `needsReview` flag |
| Markdown export | Include mode/engine metadata |

***

## Implementation Order & Estimated Effort

| Phase | Description | Estimated Effort | Dependencies |
|-------|-------------|-----------------|--------------|
| **1** | Engine abstraction layer + axe-core refactor | Medium | None |
| **2** | HTML_CodeSniffer integration | Medium | Phase 1 |
| **3** | IBM ACE integration | Medium | Phase 1 |
| **4** | Orchestration + mode toggle (API, CLI, grading) | Medium | Phases 1-3 |
| **5** | UI changes (form, results, AI, export) | Large | Phase 4 |
| **6** | Database/schema updates | Small | Phase 4 |
| **7** | Unit tests | Medium | Phases 1-6 |

**Important:** Run `npm run lint`, `npx tsc --noEmit`, and `npm run test:run` at the end of every phase — not just Phase 7.

Phases 2 and 3 can be done in parallel since they both depend only on Phase 1.

***

## Naming Suggestion

For the second mode name, "Comprehensive Mode" works well because:

- It accurately describes what it does (more engines = more comprehensive coverage)
- It pairs cleanly with "Strict Mode" — one sounds precise, the other sounds thorough
- It avoids implying the results are less trustworthy (compared to alternatives like "Relaxed Mode" or "Extended Mode")
- Other options to consider: **"Deep Scan"**, **"Full Sweep"**, or **"Triple Engine"**

***

## Risk Considerations

- **Bundle size:** HTML_CodeSniffer is ~250KB and IBM ACE's `ace.js` is ~1.5MB. For the Playwright path (browser injection), these scripts need to be injected into each page. Consider lazy-loading them only in Comprehensive Mode and caching the script strings.
- **Scan duration:** Running three engines sequentially could add 2-5 seconds. Mitigate by running all three in parallel within the same `page.evaluate()` call (they don't conflict since they only read the DOM).
- **Convex document size:** More violations per scan means larger documents. The existing 350KB truncation logic per viewport should be extended to account for multi-engine results. Consider truncating "needs review" items first.
- **JSDOM compatibility:** axe-core has known JSDOM limitations (e.g., `color-contrast` rule doesn't work). HTML_CodeSniffer and IBM ACE may have similar JSDOM gaps. Document which rules are skipped on the BQL+JSDOM path.[^8]
- **Backward compatibility:** Existing audits in the database won't have the new fields. Default `scanMode` to `'strict'` and `enginesUsed` to `['axe-core']` for older records.

---

## References

1. [equal-access/accessibility-checker-engine/README.md at master · IBMa/equal-access](https://github.com/IBMa/equal-access/blob/master/accessibility-checker-engine/README.md) - IBM Equal Access Accessibility Checker contains tools to automate accessibility checking from a brow...

2. [GitHub - abbott567/axe-core-vs-pa11y: A comparison of axe-core and PA11Y, two automated accessibility tools.](https://github.com/abbott567/axe-core-vs-pa11y) - A comparison of axe-core and PA11Y, two automated accessibility tools. - abbott567/axe-core-vs-pa11y

3. [What is the correct percentage of issues that axe actually finds it ...](https://github.com/dequelabs/axe-core/issues/4415) - Product axe Extension Question Hello! Could you please clarify the correct percentage that axe-core ...

4. [WCAG 2.1 Standard: Summary - HTML_CodeSniffer - GitHub Pages](https://squizlabs.github.io/HTML_CodeSniffer/Standards/WCAG2/) - WCAG 2.1 Standard: Summary. This page lists all the Success Criteria of the W3C Web Content Accessib...

5. [HTML_CodeSniffer/README.markdown at master · squizlabs/HTML_CodeSniffer](https://github.com/squizlabs/HTML_CodeSniffer/blob/master/README.markdown) - HTML_CodeSniffer is a client-side JavaScript application that checks a HTML document or source code,...

6. [accessibility-checker-engine - NPM](https://www.npmjs.com/package/accessibility-checker-engine) - An automated accessibility checking engine for use by other tools. Latest version: 4.0.9, last publi...

7. [equal-access/rule-server/README.md at master · IBMa/equal-access](https://github.com/IBMa/equal-access/blob/master/rule-server/README.md) - IBM Equal Access Accessibility Checker contains tools to automate accessibility checking from a brow...

8. [GitHub - dequelabs/axe-core: Accessibility engine for automated Web UI testing](https://github.com/dequelabs/axe-core) - Accessibility engine for automated Web UI testing. Contribute to dequelabs/axe-core development by c...

9. [squizlabs/HTML_CodeSniffer: HTML_CodeSniffer is a ... - GitHub](https://github.com/squizlabs/HTML_CodeSniffer) - HTML_CodeSniffer requires a DOM to run, however, it is possible to run it entirely server side witho...

10. [Combining axe-core and PA11Y](https://www.craigabbott.co.uk/blog/combining-axe-core-and-pa11y/) - How to use axe-core and PA11Y for automated accessibility testing.

11. [Combining axe-core and PA11Y - craigabbott.co.uk](https://craigabbott.co.uk/blog/combining-axe-core-and-pa11y/) - So, using axe-core and PA11Y together is as simple as passing in the runners in as an option. The de...

12. [@pa11y/html_codesniffer 2.6.0 on npm](https://libraries.io/npm/@pa11y%2Fhtml_codesniffer) - HTML_CodeSniffer is a client-side JavaScript that checks a HTML document or source code, and detects...

13. [pa11y/CHANGELOG.md at main · pa11y/pa11y](https://github.com/pa11y/pa11y/blob/main/CHANGELOG.md) - Pa11y is your automated accessibility testing pal. Contribute to pa11y/pa11y development by creating...

14. [How do I add rules to pa11y-ci? - Stack Overflow](https://stackoverflow.com/questions/50480370/how-do-i-add-rules-to-pa11y-ci) - I need to customize the ruleset used by pa11y. For instance let's say I want to follow WCAG2A but wa...

