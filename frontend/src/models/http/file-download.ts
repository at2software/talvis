import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Toast } from '@shards/toast/toast';

export const httpErrorMessage = (err: HttpErrorResponse): string | undefined =>
    err.error?.message ?? err.error?.error_description ?? err.statusText;

export function notifyHttpError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status < 400) return;
    console.warn('[HTTP]', err.status, err.url ?? '', err.error ?? err.statusText);
    if (err.error instanceof Blob) {
        err.error
            .text()
            .then((text) => Toast.error(parseErrorBody(text) ?? err.statusText))
            .catch(() => Toast.error(err.statusText));
        return;
    }
    const message = httpErrorMessage(err);
    if (message) Toast.error(message);
}

function parseErrorBody(text: string): string | undefined {
    try {
        const body = JSON.parse(text);
        return body?.message ?? body?.error_description;
    } catch {
        return undefined;
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
