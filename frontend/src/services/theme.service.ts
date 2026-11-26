import { computed, Service, signal } from '@angular/core';
import { activeTheme } from '@constants/active-theme';

export type Theme = 'light' | 'dark';
/** `auto` follows `prefers-color-scheme`; `light`/`dark` override it. */
export type ThemeMode = 'auto' | Theme;

export const THEME_MEDIA_QUERY = '(prefers-color-scheme: light)';
export const THEME_STORAGE_KEY = 'talvis.theme';
export const DEFAULT_THEME: Theme = 'dark';

/**
 * Tracks the active color theme and mirrors it into `data-bs-theme` on `<html>`, which is the single
 * source of truth for styling. The inline script in `index.html` sets the attribute before the first
 * paint; this service takes over once the app runs and follows OS/browser changes without a reload.
 */
@Service()
export class ThemeService {
    #media = matchMediaOrNull(THEME_MEDIA_QUERY);
    #systemTheme = signal<Theme>(this.#media?.matches ? 'light' : DEFAULT_THEME);
    #mode = signal<ThemeMode>(readStoredMode());

    /** Requested mode, persisted per browser. */
    readonly mode = this.#mode.asReadonly();
    /** Theme preferred by OS/browser, independent of `mode`. */
    readonly systemTheme = this.#systemTheme.asReadonly();
    /** Effective theme. */
    readonly theme = computed<Theme>(() => {
        const mode = this.#mode();
        return mode === 'auto' ? this.#systemTheme() : mode;
    });
    readonly isLight = computed(() => this.theme() === 'light');

    constructor() {
        this.#media?.addEventListener('change', (event) => {
            this.#systemTheme.set(event.matches ? 'light' : 'dark');
            this.#apply();
        });
        this.#apply();
    }

    setMode(mode: ThemeMode) {
        this.#mode.set(mode);
        storeMode(mode);
        this.#apply();
    }

    #apply() {
        const theme = this.theme();
        // Attribute first: computeds that re-run because of activeTheme read the new CSS variables.
        applyThemeAttribute(theme);
        activeTheme.set(theme);
    }
}

export function applyThemeAttribute(theme: Theme, doc: Document | undefined = globalThis.document) {
    if (!doc) return;
    doc.documentElement.setAttribute('data-bs-theme', theme);
    if (doc.body?.hasAttribute('data-bs-theme')) doc.body.setAttribute('data-bs-theme', theme);
}

function readStoredMode(): ThemeMode {
    try {
        const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
        return stored === 'light' || stored === 'dark' ? stored : 'auto';
    } catch {
        return 'auto';
    }
}

function storeMode(mode: ThemeMode) {
    try {
        if (mode === 'auto') globalThis.localStorage?.removeItem(THEME_STORAGE_KEY);
        else globalThis.localStorage?.setItem(THEME_STORAGE_KEY, mode);
    } catch {
        // storage blocked: the choice lasts for this session only
    }
}

function matchMediaOrNull(query: string): MediaQueryList | null {
    return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null;
}
