type ChangeListener = (event: MediaQueryListEvent) => void;

export interface MatchMediaMock {
    /** Simulates the user switching the OS/browser color scheme. */
    setLight(light: boolean): void;
    restore(): void;
}

/** Replaces `window.matchMedia` with a controllable `prefers-color-scheme: light` query (jsdom has none). */
export function mockPrefersLight(initialLight: boolean): MatchMediaMock {
    const original = globalThis.matchMedia;
    const listeners = new Set<ChangeListener>();
    let matches = initialLight;

    globalThis.matchMedia = ((query: string) => ({
        media: query,
        get matches() {
            return query.includes('light') ? matches : !matches;
        },
        onchange: null,
        addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
        removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
        addListener: (listener: ChangeListener) => listeners.add(listener),
        removeListener: (listener: ChangeListener) => listeners.delete(listener),
        dispatchEvent: () => true,
    })) as unknown as typeof globalThis.matchMedia;

    return {
        setLight(light: boolean) {
            matches = light;
            listeners.forEach((listener) => listener({ matches: light, media: '(prefers-color-scheme: light)' } as MediaQueryListEvent));
        },
        restore() {
            if (original) globalThis.matchMedia = original;
            else delete (globalThis as { matchMedia?: unknown }).matchMedia;
        },
    };
}
