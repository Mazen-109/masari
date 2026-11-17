import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Accessibility gate (contracts/ci.md §5, FR-042): WCAG 2.0/2.1 A and AA rules; any violation with
// impact `serious` or `critical` fails, listing the rule ids and the offending selectors.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact != null && BLOCKING_IMPACTS.has(violation.impact),
  );
  if (blocking.length === 0) return;
  const report = blocking
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} — ${targets}`;
    })
    .join('\n');
  throw new Error(`Accessibility violations on ${page.url()}:\n${report}`);
}
