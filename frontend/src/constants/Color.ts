import tinycolor from 'tinycolor2';
import { activeTheme } from '@constants/active-theme';

export class Color extends tinycolor {
    static GoldenRatioHue: number = (60 * (1 + Math.sqrt(5))) / 2; //.5 * 222.4969097651422
    static ERROR_COLOR = '#990000';

    changeHsl = (changes: Partial<tinycolor.ColorFormats.HSLA>): Color => new Color(Object.assign(this.toHsl(), changes));

    /**
     * @returns Color object representing black (#000000) or white (#ffffff)
     */
    bestBW = (): Color => {
        const luminance = this.getLuminance();

        // 0.5 is the WCAG relative-luminance midpoint.
        return luminance > 0.5 ? new Color('#000000') : new Color('#ffffff');
    };

    static get = (_: tinycolor.ColorInput): Color => new Color(_);
    /**
     * Resolves a CSS variable. Depends on the active theme, so a `computed()` that calls this re-runs on a theme
     * switch (several variables, e.g. `--bs-primary`, differ between light and dark).
     */
    static fromVar = (_: string, prefix: string = '--bs-'): Color => {
        activeTheme();
        return new Color(window.getComputedStyle(document.body).getPropertyValue(prefix + _) ?? Color.ERROR_COLOR);
    };
    static fromHsl = (h: number, s: number, l: number) => new Color({ h: h, s: s, l: l } as tinycolor.ColorFormats.HSL);
    static uniqueColorFromString = (_: string) => Color.posToHex(_.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360);
    static posToHex = (pos: number): string => Color.fromHsl((pos * Color.GoldenRatioHue) % 360, 90, 45).toHexString();
}
