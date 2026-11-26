import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type Lang = 'html' | 'css' | 'json';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlightCss(code: string): string {
    return esc(code).replace(
        /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(-?\d+(?:\.\d+)?(?:px|pt|em|rem|%|mm|cm|vh|vw|fr|deg|s|ms)?\b)|([A-Za-z-]+)(?=\s*:)|([{}();,])/g,
        (m, com, str, at, hex, num, prop, punc) => {
            if (com) return `<span class="t-com">${com}</span>`;
            if (str) return `<span class="t-str">${str}</span>`;
            if (at) return `<span class="t-at">${at}</span>`;
            if (hex || num) return `<span class="t-num">${hex || num}</span>`;
            if (prop) return `<span class="t-prop">${prop}</span>`;
            if (punc) return `<span class="t-punc">${punc}</span>`;
            return m;
        },
    );
}

function highlightJson(code: string): string {
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        out += esc(code.slice(last, m.index));
        const [, str, colon, num, literal, punc] = m;
        if (str) out += colon ? `<span class="t-prop">${esc(str)}</span><span class="t-punc">${esc(colon)}</span>` : `<span class="t-str">${esc(str)}</span>`;
        else if (num) out += `<span class="t-num">${num}</span>`;
        else if (literal) out += `<span class="t-at">${literal}</span>`;
        else out += `<span class="t-punc">${esc(punc)}</span>`;
        last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
}

const HIGHLIGHTERS: Record<Lang, (code: string) => string> = { html: (code) => highlightHtml(code), css: highlightCss, json: highlightJson };

function highlightTag(tag: string): string {
    const lead = tag.startsWith('</') ? '</' : '<';
    const trail = tag.endsWith('/>') ? '/>' : '>';
    const inner = tag.slice(lead.length, tag.length - trail.length);
    const name = (inner.match(/^[\w-]+/) ?? [''])[0];
    const attrs = inner.slice(name.length).replace(/([\w-]+)(?:=("[^"]*"|'[^']*'))?/g, (mm, an: string, av?: string) => {
        if (!an) return esc(mm);
        let s = `<span class="t-attr">${esc(an)}</span>`;
        if (av !== undefined) s += `=<span class="t-str">${esc(av)}</span>`;
        return s;
    });
    return `<span class="t-punc">${esc(lead)}</span><span class="t-tag">${esc(name)}</span>${attrs}<span class="t-punc">${esc(trail)}</span>`;
}

function highlightHtml(code: string): string {
    const re = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:[^<>]*)?>/g;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
        out += esc(code.slice(last, m.index));
        out += m[0].startsWith('<!--') ? `<span class="t-com">${esc(m[0])}</span>` : highlightTag(m[0]);
        last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
}

@Component({
    selector: 'app-code-editor',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <pre class="ce-pre" [attr.aria-hidden]="!readonly()"><code [innerHTML]="highlighted()"></code></pre>
        @if (!readonly()) {
            <textarea
                #ta
                class="ce-ta"
                spellcheck="false"
                wrap="off"
                [value]="value()"
                (input)="onInput(ta.value)"
                (scroll)="syncScroll(ta)"
                (keydown)="onKeydown($event, ta)"
            ></textarea>
        }
    `,
    styleUrl: './code-editor.component.scss',
    host: { '[class.readonly]': 'readonly()' },
})
export class CodeEditorComponent {
    readonly value = input('');
    readonly language = input<Lang>('html');
    readonly readonly = input(false);
    readonly valueChange = output<string>();

    readonly highlighted = computed(() => {
        const code = this.value();
        const html = HIGHLIGHTERS[this.language()](code);
        return html + (code.endsWith('\n') ? ' ' : '');
    });

    onInput(v: string) {
        this.valueChange.emit(v);
    }

    syncScroll(ta: HTMLTextAreaElement) {
        const pre = (ta.previousElementSibling as HTMLElement) ?? null;
        if (pre) {
            pre.scrollTop = ta.scrollTop;
            pre.scrollLeft = ta.scrollLeft;
        }
    }

    onKeydown(e: KeyboardEvent, ta: HTMLTextAreaElement) {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
        this.valueChange.emit(next);
        queueMicrotask(() => (ta.selectionStart = ta.selectionEnd = start + 2));
    }
}
