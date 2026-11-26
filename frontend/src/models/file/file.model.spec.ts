import { File } from '@models/file/file.model';
import { isPreviewable } from '@models/file/file.actions';

const file = (name: string, mime: string) => File.fromJson({ id: 1, name, mime });

describe('File markdown detection', () => {
    it('recognizes markdown by extension, whatever mime the backend guessed', () => {
        expect(file('README.md', 'text/plain').isMarkdown()).toBe(true);
        expect(file('notes.MARKDOWN', 'application/octet-stream').isMarkdown()).toBe(true);
        expect(file('Changes.Md', '').isMarkdown()).toBe(true);
    });

    it('recognizes markdown by mime type', () => {
        expect(file('notes', 'text/markdown').isMarkdown()).toBe(true);
        expect(file('notes', 'text/x-markdown; charset=utf-8').isMarkdown()).toBe(true);
    });

    it('does not treat other files as markdown', () => {
        expect(file('notes.txt', 'text/plain').isMarkdown()).toBe(false);
        expect(file('mdfile.pdf', 'application/pdf').isMarkdown()).toBe(false);
        expect(file('archive.md.zip', 'application/zip').isMarkdown()).toBe(false);
    });

    it('gives markdown its own icon and color', () => {
        const md = file('README.md', 'text/plain');
        expect(md.getIcon()).toBe('description');
        expect(md.css()).toBe('var(--color-teal)');
        expect(file('notes.txt', 'text/plain').css()).toBe('#cccccc');
    });

    it('leaves the icons of other types unchanged', () => {
        expect(file('a.pdf', 'application/pdf').getIcon()).toBe('picture_as_pdf');
        expect(file('a.png', 'image/png').getIcon()).toBe('photo');
        expect(file('a.zip', 'application/zip').getIcon()).toBe('');
    });
});

describe('isPreviewable', () => {
    it('previews markdown, pdf and images only', () => {
        expect(isPreviewable(file('README.md', 'text/plain'))).toBe(true);
        expect(isPreviewable(file('notes', 'text/markdown'))).toBe(true);
        expect(isPreviewable(file('a.pdf', 'application/pdf'))).toBe(true);
        expect(isPreviewable(file('a.png', 'image/png'))).toBe(true);
        expect(isPreviewable(file('notes.txt', 'text/plain'))).toBe(false);
        expect(isPreviewable(file('a.zip', 'application/zip'))).toBe(false);
    });
});
