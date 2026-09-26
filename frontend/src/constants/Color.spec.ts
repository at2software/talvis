import { Color } from '@constants/Color';

describe('Color', () => {
    it('changeHsl returns a new color with updated channel', () => {
        const color = new Color('#336699');
        const changed = color.changeHsl({ l: 0.2 });

        expect(changed).toBeInstanceOf(Color);
        expect(changed.toHexString()).not.toBe(color.toHexString());
    });

    it('bestBW returns black for light colors', () => {
        expect(new Color('#ffffff').bestBW().toHexString()).toBe('#000000');
    });

    it('bestBW returns white for dark colors', () => {
        expect(new Color('#000000').bestBW().toHexString()).toBe('#ffffff');
    });

    it('fromHsl builds the expected hue family', () => {
        const red = Color.fromHsl(0, 100, 50).toHexString();
        expect(red).toBe('#ff0000');
    });

    it('uniqueColorFromString is deterministic', () => {
        const a = Color.uniqueColorFromString('talvis');
        const b = Color.uniqueColorFromString('talvis');
        expect(a).toBe(b);
    });

    it('fromVar reads CSS custom property using prefix', () => {
        document.body.style.setProperty('--bs-test-color', '#112233');
        expect(Color.fromVar('test-color').toHexString()).toBe('#112233');
    });
});
