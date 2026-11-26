import { TestBed } from '@angular/core/testing';
import { mockPrefersLight, type MatchMediaMock } from '@testing/match-media';
import { CHART_PALETTES } from '@charts/echarts-theme';
import { injectChartPalette, themedChartOptions } from './widgets.shared';

describe('widgets.shared chart theming', () => {
    let media: MatchMediaMock;

    beforeEach(() => (media = mockPrefersLight(false)));
    afterEach(() => {
        media.restore();
        document.documentElement.setAttribute('data-bs-theme', 'dark');
        TestBed.resetTestingModule();
    });

    it('provides the palette of the active theme and switches with it', () => {
        const palette = TestBed.runInInjectionContext(() => injectChartPalette());
        expect(palette()).toBe(CHART_PALETTES.dark);

        media.setLight(true);
        expect(palette()).toBe(CHART_PALETTES.light);
    });

    it('rebuilds chart options when the theme changes', () => {
        const build = vi.fn((p: typeof CHART_PALETTES.dark) => ({ xAxis: { axisLabel: { color: p.textMuted } }, textStyle: { color: p.text } }));
        const options = TestBed.runInInjectionContext(() => themedChartOptions(build));

        const dark = options();
        expect(dark.textStyle.color).toBe(CHART_PALETTES.dark.text);
        expect(options()).toBe(dark);
        expect(build).toHaveBeenCalledTimes(1);

        media.setLight(true);
        const light = options();
        expect(light).not.toBe(dark);
        expect(light.textStyle.color).toBe(CHART_PALETTES.light.text);
        expect(light.xAxis.axisLabel.color).toBe(CHART_PALETTES.light.textMuted);
        expect(build).toHaveBeenCalledTimes(2);
    });

    it('uses readable light-mode colors that differ from the dark ones', () => {
        expect(CHART_PALETTES.light.text).not.toBe(CHART_PALETTES.dark.text);
        expect(CHART_PALETTES.light.track).not.toBe(CHART_PALETTES.dark.track);
    });
});
