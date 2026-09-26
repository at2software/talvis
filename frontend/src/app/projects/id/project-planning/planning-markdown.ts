import { InvoiceItemType } from '@enums/invoice-item.type';

/**
 * One line of a dropped planning file, resolved into what it will become.
 * `qty` is the agreed value written to `InvoiceItem.qty`; `unit` is left
 * undefined when the file does not name one, so the default product wins.
 */
export interface PlanningRow {
    type: InvoiceItemType;
    text: string;
    qty: number;
    unit?: string;
}

export const PLANNING_SAMPLE_FILENAME = 'planning-sample.md';

export const PLANNING_SAMPLE_MARKDOWN = `# project planning

<!--
  Drop this file onto the planning card of a prepared project to create its
  invoice items.

  One item per line:   description | quantity | unit
  Quantity and unit are optional - without them the project's default product
  decides the unit and the quantity starts at 0.

  Line prefixes:
    #    section header - the line becomes a group header without a quantity
    ?    optional item
    ~    disabled item
    \\    escape - takes the rest of the line literally

  Markdown bullets (-, *, 1.) and markdown tables are accepted as well, so a
  list pasted from somewhere else usually imports unchanged.
-->

## phase 1 - concept
- requirements workshop | 8 | h
- technical specification | 16 h
- ? stakeholder interviews | 4 | h

## phase 2 - implementation
- backend API | 40 | h
- frontend | 32 | h
- ~ legacy data migration | 16 | h

## phase 3 - rollout
- deployment and handover | 8 | h
`;

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HORIZONTAL_RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/;
const BULLET = /^([-*+]|\d+[.)])\s+/;
const HEADING = /^(#{1,6})\s*(.*)$/;
const QTY_WITH_UNIT = /^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/;

const MARKERS: { prefix: RegExp; type: InvoiceItemType }[] = [
    { prefix: /^\?\s*/, type: InvoiceItemType.Optional },
    { prefix: /^~{1,2}\s*/, type: InvoiceItemType.Inactive },
];

/** Drops a full-line `**bold**`, `__bold__`, `*italic*`, `_italic_` or `` `code` `` wrapper. */
const unwrapEmphasis = (text: string): string => {
    const wrappers = ['**', '__', '*', '_', '`'];
    for (const w of wrappers) {
        if (text.length > 2 * w.length && text.startsWith(w) && text.endsWith(w)) {
            return text.slice(w.length, -w.length).trim();
        }
    }
    return text;
};

const parseQty = (raw: string | undefined): { qty: number; unit?: string } => {
    const match = QTY_WITH_UNIT.exec((raw ?? '').trim());
    if (!match) return { qty: 0 };
    return { qty: parseFloat(match[1].replace(',', '.')), unit: match[2].trim() || undefined };
};

/**
 * Parses a dropped markdown planning file into rows ready to become invoice items.
 * Anything it cannot make sense of (blank lines, comments, rules, table headers)
 * is dropped rather than imported as a bogus item.
 */
export function parsePlanningMarkdown(markdown: string): PlanningRow[] {
    const lines = markdown.replace(HTML_COMMENT, '').split(/\r?\n/).map((_) => _.trim());
    const rows: PlanningRow[] = [];

    lines.forEach((line, index) => {
        if (!line || HORIZONTAL_RULE.test(line)) return;
        // A markdown table's separator row identifies the line above it as the table head.
        if (line.includes('|') && TABLE_SEPARATOR.test(line)) return;
        if (lines[index + 1]?.includes('|') && TABLE_SEPARATOR.test(lines[index + 1])) return;

        const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((_) => _.trim());
        let first = cells[0].replace(BULLET, '').trim();

        const heading = HEADING.exec(first);
        if (heading) {
            const text = unwrapEmphasis(heading[2].replace(/\s*#+$/, '').trim());
            if (text) rows.push({ type: InvoiceItemType.Header, text, qty: 0 });
            return;
        }

        let type = InvoiceItemType.Default;
        if (first.startsWith('\\')) {
            first = first.slice(1).trim();
        } else {
            const marker = MARKERS.find((_) => _.prefix.test(first));
            if (marker) {
                type = marker.type;
                first = first.replace(marker.prefix, '').replace(/~{1,2}$/, '').trim();
            }
        }

        const text = unwrapEmphasis(first);
        if (!text) return;

        const { qty, unit } = parseQty(cells[1]);
        rows.push({ type, text, qty, unit: cells[2]?.trim() || unit });
    });

    return rows;
}
