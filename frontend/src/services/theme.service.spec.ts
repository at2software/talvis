import { TestBed } from '@angular/core/testing';
import { activeTheme } from '@constants/active-theme';
import { mockPrefersLight, type MatchMediaMock } from '@testing/match-media';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
    let media: MatchMediaMock | undefined;

    const html = () => document.documentElement;

    afterEach(() => {
        media?.restore();
        media = undefined;
        html().setAttribute('data-bs-theme', 'dark');
        document.body.removeAttribute('data-bs-theme');
        localStorage.removeItem(THEME_STORAGE_KEY);
        TestBed.resetTestingModule();
    });

    it('starts in light mode when the system prefers light', () => {
        media = mockPrefersLight(true);
        const service = TestBed.inject(ThemeService);

        expect(service.theme()).toBe('light');
        expect(service.isLight()).toBe(true);
        expect(html().getAttribute('data-bs-theme')).toBe('light');
    });

    it('starts in dark mode when the system prefers dark', () => {
        media = mockPrefersLight(false);
        html().setAttribute('data-bs-theme', 'light');
        const service = TestBed.inject(ThemeService);

        expect(service.theme()).toBe('dark');
        expect(html().getAttribute('data-bs-theme')).toBe('dark');
    });

    it('falls back to dark without matchMedia', () => {
        const original = globalThis.matchMedia;
        delete (globalThis as { matchMedia?: unknown }).matchMedia;
        try {
            expect(TestBed.inject(ThemeService).theme()).toBe('dark');
            expect(html().getAttribute('data-bs-theme')).toBe('dark');
        } finally {
            if (original) globalThis.matchMedia = original;
        }
    });

    it('follows a system change without reload', () => {
        media = mockPrefersLight(false);
        const service = TestBed.inject(ThemeService);

        media.setLight(true);
        expect(service.theme()).toBe('light');
        expect(html().getAttribute('data-bs-theme')).toBe('light');

        media.setLight(false);
        expect(service.theme()).toBe('dark');
        expect(html().getAttribute('data-bs-theme')).toBe('dark');
    });

    it('mirrors the theme into activeTheme for low-level utilities', () => {
        media = mockPrefersLight(false);
        TestBed.inject(ThemeService);
        expect(activeTheme()).toBe('dark');

        media.setLight(true);
        expect(activeTheme()).toBe('light');
        media.setLight(false);
    });

    it('keeps a leftover data-bs-theme on body in sync', () => {
        media = mockPrefersLight(false);
        document.body.setAttribute('data-bs-theme', 'dark');
        TestBed.inject(ThemeService);

        media.setLight(true);
        expect(document.body.getAttribute('data-bs-theme')).toBe('light');
    });

    it('lets a manual mode override the system preference', () => {
        media = mockPrefersLight(true);
        const service = TestBed.inject(ThemeService);

        service.setMode('dark');
        expect(service.theme()).toBe('dark');
        expect(html().getAttribute('data-bs-theme')).toBe('dark');

        media.setLight(false);
        media.setLight(true);
        expect(service.theme()).toBe('dark');

        service.setMode('auto');
        expect(service.theme()).toBe('light');
        expect(html().getAttribute('data-bs-theme')).toBe('light');
    });

    it('persists a manual mode and restores it on the next start', () => {
        media = mockPrefersLight(true);
        TestBed.inject(ThemeService).setMode('dark');
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

        TestBed.resetTestingModule();
        const restored = TestBed.inject(ThemeService);
        expect(restored.mode()).toBe('dark');
        expect(restored.theme()).toBe('dark');
        expect(html().getAttribute('data-bs-theme')).toBe('dark');

        restored.setMode('auto');
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });
});
