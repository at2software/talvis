import { signal } from '@angular/core';

/**
 * Mirror of `ThemeService.theme` for low-level utilities that cannot inject a service (e.g. `Color.fromVar`).
 * Reading it inside a `computed()` makes that computed re-run on a theme switch. Written only by `ThemeService`.
 * Kept as a leaf module (no app imports) so constants can depend on it without import cycles.
 */
export const activeTheme = signal<'light' | 'dark'>('dark');
