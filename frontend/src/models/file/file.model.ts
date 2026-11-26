import type { NxAction } from '@models/_core/nx.actions';
import { Serializable } from '@models/_core/serializable';
import { getFileActions } from './file.actions';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';

enum MimeType {
    DEFAULT,
    IMAGE,
    APPLICATION,
    MARKDOWN,
}

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;
const MARKDOWN_MIMES = ['text/markdown', 'text/x-markdown'];

@Model('File')
export class File extends Serializable {
    static API_PATH = (): string => 'files';

    name: string = '';
    dir: string = '';
    parent_path: string = '';
    mime: string = '';
    permissions: string | null = null;

    category?: string;
    tags?: string[];
    file_size?: number;
    dimensions?: string;
    download_url?: string;
    preview_url?: string;
    thumbnail?: string; // Base64 encoded thumbnail

    protected override buildActions(): NxAction[] { return getFileActions(this) }

    css = computed(() => { const { mime, name } = this.snapshot(); return this.#getColorCss(mime, name) });

    isMarkdown(name = this.name, mime = this.mime): boolean {
        return MARKDOWN_EXTENSION.test(name ?? '') || MARKDOWN_MIMES.includes((mime ?? '').split(';')[0].trim().toLowerCase());
    }

    /**
     * @returns google fonts string
     */
    getIcon(): string {
        if (this.mime === 'application/pdf') return 'picture_as_pdf';
        if (this.isMarkdown()) return 'description';
        if (this.mime?.endsWith('document')) return 'article';
        if (this.name?.endsWith('.svg')) return 'polyline';
        if (this.mime?.startsWith('image/')) return 'photo';
        if (this.name?.endsWith('.txt')) return 'text';
        return '';
    }
    /**
     * @returns hex or var color string
     */
    #getColorCss(mime: string, name: string): string {
        switch (this.getMimeType(mime, name)) {
            case MimeType.DEFAULT:
                return '#cccccc';
            case MimeType.IMAGE:
                return 'var(--color-purple)';
            case MimeType.APPLICATION:
                return 'var(--color-blue)';
            case MimeType.MARKDOWN:
                return 'var(--color-teal)';
        }
    }
    getMimeType(mime = this.mime, name = this.name): MimeType {
        if (this.isMarkdown(name, mime)) return MimeType.MARKDOWN;
        if (mime?.startsWith('image/')) return MimeType.IMAGE;
        if (mime?.startsWith('application/')) return MimeType.APPLICATION;
        return MimeType.DEFAULT;
    }
}
