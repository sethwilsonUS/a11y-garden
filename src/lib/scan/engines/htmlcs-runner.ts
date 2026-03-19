import type { Page } from "playwright";
import type { DOMWindow } from "jsdom";
import {
  computeFindingDedupKey,
  extractWcagCriteriaFromHtmlcsCode,
  getPrimarySelector,
  inferHeuristicImpact,
  type AuditFinding,
  type FindingDisposition,
} from "@/lib/findings";
import { getHtmlcsSource } from "./source-cache";

interface HtmlcsMessage {
  type: number;
  code: string;
  msg: string;
  selector: string;
  html?: string;
}

function helpUrlForCriteria(criteria: string[]): string {
  const standard = criteria.length > 0 ? "WCAG2AA" : "WCAG2AA";
  return `https://squizlabs.github.io/HTML_CodeSniffer/Standards/${standard}/`;
}

function groupMessages(messages: HtmlcsMessage[]): AuditFinding[] {
  const grouped = new Map<string, AuditFinding>();

  for (const message of messages) {
    if (message.type === 3) continue;

    const disposition: FindingDisposition =
      message.type === 1 ? "confirmed" : "needs-review";
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

    const finding: AuditFinding = {
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
    };

    grouped.set(key, finding);
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

function getHtmlcsBrowserEvaluator() {
  return async (source: string) => {
    const escapeIdent = (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

    const isElementLike = (value: unknown): value is Element =>
      !!value &&
      typeof value === "object" &&
      typeof (value as { tagName?: unknown }).tagName === "string";

    const buildSelector = (rawElement: unknown): string => {
      const element = isElementLike(rawElement) ? rawElement : null;
      if (!element) return "document";
      if ((element as HTMLElement).id) {
        return `#${escapeIdent((element as HTMLElement).id)}`;
      }

      const parts: string[] = [];
      let current: Element | null = element;

      while (current && parts.length < 5) {
        if (typeof current.tagName !== "string") break;
        let part = current.tagName.toLowerCase();

        const classNames = Array.from(current.classList ?? [])
          .slice(0, 2)
          .map((item) => escapeIdent(item));
        if (classNames.length > 0) {
          part += `.${classNames.join(".")}`;
        }

        const parent: Element | null = isElementLike(current.parentElement)
          ? (current.parentElement as Element)
          : null;
        if (parent) {
          const currentTagName = current.tagName;
          const siblings = Array.from<Element>(parent.children).filter(
            (candidate: Element) => candidate.tagName === currentTagName,
          );
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }

        parts.unshift(part);
        current = parent;
      }

      return parts.join(" > ") || (
        typeof element.tagName === "string"
          ? element.tagName.toLowerCase()
          : "document"
      );
    };

    if (!(window as unknown as Record<string, unknown>).HTMLCS) {
      window.eval(source);
    }

    return await new Promise<HtmlcsMessage[]>((resolve) => {
      // @ts-expect-error injected at runtime
      window.HTMLCS.process("WCAG2AA", document, () => {
        // @ts-expect-error injected at runtime
        const messages = window.HTMLCS.getMessages() as Array<{
          type: number;
          code: string;
          msg: string;
          element?: Element | null;
        }>;

        resolve(
          messages.map((message) => ({
            type: message.type,
            code: message.code,
            msg: message.msg,
            selector: buildSelector(message.element),
            html: isElementLike(message.element) ? message.element.outerHTML : undefined,
          })),
        );
      });
    });
  };
}

export async function runHtmlcsOnPage(
  page: Page,
): Promise<AuditFinding[]> {
  const source = getHtmlcsSource();
  const messages = await page.evaluate(getHtmlcsBrowserEvaluator(), source);
  return groupMessages(messages);
}

export async function runHtmlcsOnDom(
  window: DOMWindow,
): Promise<AuditFinding[]> {
  const source = getHtmlcsSource();

  if (!(window as unknown as Record<string, unknown>).HTMLCS) {
    window.eval(source);
  }

  const messages = await new Promise<HtmlcsMessage[]>((resolve) => {
    const escapeIdent = (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

    const isElementLike = (value: unknown): value is Element =>
      !!value &&
      typeof value === "object" &&
      typeof (value as { tagName?: unknown }).tagName === "string";

    const buildSelector = (rawElement: unknown): string => {
      const element = isElementLike(rawElement) ? rawElement : null;
      if (!element) return "document";
      if ((element as HTMLElement).id) {
        return `#${escapeIdent((element as HTMLElement).id)}`;
      }

      const parts: string[] = [];
      let current: Element | null = element;

      while (current && parts.length < 5) {
        if (typeof current.tagName !== "string") break;
        let part = current.tagName.toLowerCase();
        const classNames = Array.from(current.classList ?? [])
          .slice(0, 2)
          .map((item) => escapeIdent(item));
        if (classNames.length > 0) {
          part += `.${classNames.join(".")}`;
        }

        const parent: Element | null = isElementLike(current.parentElement)
          ? (current.parentElement as Element)
          : null;
        if (parent) {
          const currentTagName = current.tagName;
          const siblings = Array.from<Element>(parent.children).filter(
            (candidate: Element) => candidate.tagName === currentTagName,
          );
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }

        parts.unshift(part);
        current = parent;
      }

      return parts.join(" > ") || (
        typeof element.tagName === "string"
          ? element.tagName.toLowerCase()
          : "document"
      );
    };

    (
      (window as unknown as Record<string, unknown>).HTMLCS as {
        process(
          standard: string,
          doc: Document,
          callback: () => void,
        ): void;
        getMessages(): Array<{
          type: number;
          code: string;
          msg: string;
          element?: Element | null;
        }>;
      }
    ).process("WCAG2AA", window.document, () => {
      const rawMessages = (
        (window as unknown as Record<string, unknown>).HTMLCS as {
          getMessages(): Array<{
            type: number;
            code: string;
            msg: string;
            element?: Element | null;
          }>;
        }
      ).getMessages();

      resolve(
        rawMessages.map((message) => ({
          type: message.type,
          code: message.code,
          msg: message.msg,
          selector: buildSelector(message.element),
          html: isElementLike(message.element) ? message.element.outerHTML : undefined,
        })),
      );
    });
  });

  return groupMessages(messages);
}
