import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Toast } from '@shards/toast/toast';
import { Dictionary } from '@constants/constants';
import { escapeHtml } from '@constants/html/escape-html';

export const httpErrorMessage = (err: HttpErrorResponse): string | undefined => bodyMessage(err.error) ?? err.statusText;

const bodyMessage = (body: unknown): string | undefined => {
    if (!body || typeof body !== 'object') return plainTextBody(body);
    const { message, error_description, error } = body as { message?: string; error_description?: string; error?: unknown };
    return message ?? error_description ?? (typeof error === 'string' ? error : undefined);
};

const plainTextBody = (body: unknown): string | undefined => (typeof body === 'string' && body.trim() && !body.trimStart().startsWith('<') ? body.trim() : undefined);

export function notifyHttpError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status < 400 || err.status === 401) return;
    console.warn('[HTTP]', err.status, err.url ?? '', err.error ?? err.statusText);
    if (err.error instanceof Blob) {
        err.error
            .text()
            .then((text) => Toast.error(bodyMessage(parseJson(text)) ?? err.statusText))
            .catch(() => Toast.error(err.statusText));
        return;
    }
    const message = httpErrorMessage(err);
    if (message) Toast.error(message);
}

export async function httpErrorDetailsHtml(err: HttpErrorResponse): Promise<string> {
    const body = err.error instanceof Blob ? parseJson(await err.error.text()) : err.error;
    const errors = (body as { errors?: Dictionary<string[]> } | null)?.errors ?? {};
    const details = Object.entries(errors).map(([key, messages]) => `${key}: ${messages.join(' ')}`);
    return [bodyMessage(body) ?? err.statusText, ...details].map(escapeHtml).join('<br>');
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export function saveBlobResponse(res: HttpResponse<Blob>, success?: () => void): void {
    const contentType = res.headers.get('Content-Type')?.split(';')[0] ?? 'application/pdf';
    const fileName = res.headers.get('Content-Disposition')?.match(/['"](.*?)['"]/);
    const blob = new Blob([res.body!], { type: contentType });
    const a = document.createElement('a');
    const objectUrl = window.URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.href = objectUrl;
    a.download = fileName ? fileName[1] : 'download.pdf';
    a.click();
    setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
        document.body.removeChild(a);
        success?.();
    });
}
