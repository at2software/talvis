import { Pipe, PipeTransform } from '@angular/core';
import { Marked, Renderer, Tokens } from 'marked';

const markdown = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
        link(token: Tokens.Link) {
            return Renderer.prototype.link.call(this, token).replace(/^<a /, '<a target="_blank" rel="noopener" ');
        },
    },
});

@Pipe({
    name: 'markdown',
})
export class MarkdownPipe implements PipeTransform {
    transform(value: string | null | undefined): string {
        return markdown.parse(value ?? '', { async: false });
    }
}
