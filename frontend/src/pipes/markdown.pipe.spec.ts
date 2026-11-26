import { MarkdownPipe } from './markdown.pipe';
import { sanitizeHtml } from '@constants/html/sanitize-html';

describe('MarkdownPipe', () => {
    const render = (text: string) => sanitizeHtml(new MarkdownPipe().transform(text));

    it('renders block and inline markdown', () => {
        const html = render(['## Ziel', '', '- **fett** und *kursiv*', '- `code`', '', '> Zitat', '', '```ts', 'const a = 1;', '```'].join('\n'));
        expect(html).toContain('<h2>Ziel</h2>');
        expect(html).toContain('<li><strong>fett</strong> und <em>kursiv</em></li>');
        expect(html).toContain('<code>code</code>');
        expect(html).toContain('<blockquote>');
        expect(html).toContain('<pre><code class="language-ts">const a = 1;');
    });

    it('renders gfm tables', () => {
        expect(render('| a | b |\n| - | - |\n| 1 | 2 |')).toContain('<td>1</td>');
    });

    it('opens links in a new tab', () => {
        expect(render('[issue](https://git.at2.me/x)')).toBe('<p><a target="_blank" rel="noopener" href="https://git.at2.me/x">issue</a></p>\n');
    });

    it('removes scripts and event handlers once sanitized', () => {
        const html = render('<img src="x" onerror="alert(1)"><script>alert(2)</script>\n\n[x](javascript:alert(3))');
        expect(html).not.toMatch(/onerror|<script|javascript:/);
    });

    it('returns an empty string for missing values', () => {
        expect(new MarkdownPipe().transform(undefined)).toBe('');
    });
});
