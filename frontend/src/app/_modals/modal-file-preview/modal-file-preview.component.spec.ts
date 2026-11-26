import { of } from 'rxjs';
import { renderComponent } from '@testing/component-test';
import { File } from '@models/file/file.model';
import { FileService } from '@models/file/file.service';
import { ModalFilePreviewComponent } from './modal-file-preview.component';

const MARKDOWN = [
    '# Title',
    '',
    'Some **bold** and *italic* text with `code` and a [link](https://example.com).',
    '',
    '- one',
    '- two',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '<script>window.pwned = true</script>',
    '<img src="x" onerror="window.pwned = true">',
].join('\n');

const render = async (file: File) => {
    const service = { previewBlob: vi.fn(() => of(new Blob([MARKDOWN], { type: 'text/plain' }))), download: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:preview');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const fixture = renderComponent(ModalFilePreviewComponent, {
        providers: [{ provide: FileService, useValue: service }],
        setup: (modal) => modal.init(file),
    });
    await vi.waitFor(() => expect(fixture.componentInstance.markdownText() ?? fixture.componentInstance.blobUrl()).not.toBeNull());
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, service, createObjectURL, body: fixture.nativeElement.querySelector('.file-preview-body') as HTMLElement };
};

describe('ModalFilePreviewComponent', () => {
    it('renders markdown formatted and sanitized', async () => {
        const { body, createObjectURL } = await render(File.fromJson({ id: 1, name: 'README.md', mime: 'text/plain' }));

        expect(body.classList).toContain('file-preview-body-markdown');
        const content = body.querySelector('.file-preview-markdown')!;
        expect(content.querySelector('h1')?.textContent).toBe('Title');
        expect(content.querySelector('strong')?.textContent).toBe('bold');
        expect(content.querySelector('em')?.textContent).toBe('italic');
        expect(content.querySelector('code')?.textContent).toBe('code');
        expect(content.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
        expect(content.querySelectorAll('li').length).toBe(2);
        expect(content.querySelector('table td')?.textContent).toBe('1');
        expect(content.querySelector('script')).toBeNull();
        expect(content.querySelector('[onerror]')).toBeNull();
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('downloads markdown from the modal', async () => {
        const { fixture, service } = await render(File.fromJson({ id: 1, name: 'README.md', mime: 'text/plain' }));
        (fixture.nativeElement.querySelector('.modal-header .btn-plain') as HTMLButtonElement).click();
        expect(service.download).toHaveBeenCalledWith(fixture.componentInstance.file());
    });

    it('still shows pdfs in an iframe', async () => {
        const { body } = await render(File.fromJson({ id: 2, name: 'a.pdf', mime: 'application/pdf' }));
        expect(body.classList).not.toContain('file-preview-body-markdown');
        expect(body.querySelector('iframe.file-preview-pdf')).not.toBeNull();
        expect(body.querySelector('.file-preview-markdown')).toBeNull();
    });
});
