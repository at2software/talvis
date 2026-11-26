import { ErrorHandler, Service } from '@angular/core';

const CHUNK_ERROR_MARKERS = ['ChunkLoadError', 'Loading chunk', 'dynamically imported module', 'Laden fehlgeschlagen für das Modul', 'error loading dynamically imported module'];

export function isChunkError(error: unknown): boolean {
    const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message ?? '') : String(error ?? '');

    return CHUNK_ERROR_MARKERS.some((marker) => message.includes(marker));
}

export const moduleLoadError = (error: unknown) => {
    if (isChunkError(error)) handleChunkError(error);
    else console.error('lazy load error', error);
    return Promise.reject(error);
};

let prompting = false;

export function handleChunkError(error: unknown) {
    console.warn('Chunk failed to load. Prompting user to refresh.', error);

    if (prompting) return;
    prompting = true;

    if (confirm('A new version of the application is available. Would you like to refresh the page?')) {
        location.reload();
        return;
    }
    prompting = false;
}

export function registerChunkErrorListeners() {
    window.addEventListener('unhandledrejection', (event) => {
        if (!isChunkError(event.reason)) return;
        event.preventDefault();
        handleChunkError(event.reason);
    });

    window.addEventListener('error', (event) => {
        if (!isChunkError(event.error ?? event.message)) return;
        event.preventDefault();
        handleChunkError(event.error ?? event.message);
    });
}

@Service({ autoProvided: false })
export class ChunkErrorHandler implements ErrorHandler {
    handleError(error: unknown) {
        if (isChunkError(error)) {
            handleChunkError(error);
        } else {
            console.error(error);
        }
    }
}
