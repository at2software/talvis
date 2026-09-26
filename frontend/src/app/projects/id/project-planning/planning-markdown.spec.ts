import { InvoiceItemType } from '@enums/invoice-item.type';
import { PLANNING_SAMPLE_MARKDOWN, parsePlanningMarkdown } from './planning-markdown';

describe('parsePlanningMarkdown', () => {
    it('reads description, quantity and unit from a pipe separated line', () => {
        expect(parsePlanningMarkdown('requirements workshop | 8 | h')).toEqual([{ type: InvoiceItemType.Default, text: 'requirements workshop', qty: 8, unit: 'h' }]);
    });

    it('accepts a quantity and unit written into one cell', () => {
        expect(parsePlanningMarkdown('- specification | 16 h')).toEqual([{ type: InvoiceItemType.Default, text: 'specification', qty: 16, unit: 'h' }]);
    });

    it('defaults quantity to 0 and leaves the unit to the default product', () => {
        expect(parsePlanningMarkdown('* kickoff')).toEqual([{ type: InvoiceItemType.Default, text: 'kickoff', qty: 0, unit: undefined }]);
    });

    it('reads a decimal quantity with either separator', () => {
        expect(parsePlanningMarkdown('a | 1.5\nb | 2,5').map((_) => _.qty)).toEqual([1.5, 2.5]);
    });

    it('maps the line prefixes to invoice item types', () => {
        const rows = parsePlanningMarkdown(['## phase 1', '- plain', '- ? optional', '- ~ disabled', '- ~~struck~~'].join('\n'));
        expect(rows.map((_) => [_.type, _.text])).toEqual([
            [InvoiceItemType.Header, 'phase 1'],
            [InvoiceItemType.Default, 'plain'],
            [InvoiceItemType.Optional, 'optional'],
            [InvoiceItemType.Inactive, 'disabled'],
            [InvoiceItemType.Inactive, 'struck'],
        ]);
    });

    it('takes a backslash escaped line literally', () => {
        expect(parsePlanningMarkdown('\\# not a header\n\\? not optional').map((_) => [_.type, _.text])).toEqual([
            [InvoiceItemType.Default, '# not a header'],
            [InvoiceItemType.Default, '? not optional'],
        ]);
    });

    it('skips comments, blank lines and horizontal rules', () => {
        expect(parsePlanningMarkdown('<!--\n- commented out\n-->\n\n---\n\n- real item')).toEqual([{ type: InvoiceItemType.Default, text: 'real item', qty: 0, unit: undefined }]);
    });

    it('imports a markdown table without its head row', () => {
        const table = ['| description | qty | unit |', '| --- | ---: | --- |', '| backend API | 40 | h |', '| ? nice to have | 4 | h |'].join('\n');
        expect(parsePlanningMarkdown(table)).toEqual([
            { type: InvoiceItemType.Default, text: 'backend API', qty: 40, unit: 'h' },
            { type: InvoiceItemType.Optional, text: 'nice to have', qty: 4, unit: 'h' },
        ]);
    });

    it('drops a full line emphasis wrapper', () => {
        expect(parsePlanningMarkdown('# **phase 1**\n- **backend** | 2').map((_) => _.text)).toEqual(['phase 1', 'backend']);
    });

    it('ignores a header without a title', () => {
        expect(parsePlanningMarkdown('#\n- item')).toHaveLength(1);
    });

    it('parses its own sample file', () => {
        const rows = parsePlanningMarkdown(PLANNING_SAMPLE_MARKDOWN);
        expect(rows.filter((_) => _.type === InvoiceItemType.Header).map((_) => _.text)).toEqual(['project planning', 'phase 1 - concept', 'phase 2 - implementation', 'phase 3 - rollout']);
        expect(rows.filter((_) => _.type === InvoiceItemType.Optional).map((_) => _.text)).toEqual(['stakeholder interviews']);
        expect(rows.filter((_) => _.type === InvoiceItemType.Inactive).map((_) => _.text)).toEqual(['legacy data migration']);
        expect(rows.filter((_) => _.type === InvoiceItemType.Default)).toHaveLength(5);
        expect(rows.every((_) => _.type === InvoiceItemType.Header || !!_.unit)).toBe(true);
    });
});
