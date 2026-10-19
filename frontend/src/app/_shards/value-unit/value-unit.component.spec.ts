import { renderComponent } from '@testing/component-test';
import { ValueUnitComponent } from './value-unit.component';

describe('ValueUnitComponent', () => {
    const parts = (value: string | number, unit?: string) => {
        const fixture = renderComponent(ValueUnitComponent, { inputs: unit ? { value, unit } : { value } });
        return fixture.componentInstance.parts();
    };

    it.each([
        ['390K €', '390K', '€'],
        ['57.2h', '57.2', 'h'],
        ['1.234,56 €', '1.234,56', '€'],
        ['99.5%', '99.5', '%'],
        ['12d', '12', 'd'],
        ['-8 h', '-8', 'h'],
        ['€1,234.56', '€1,234.56', ''],
        ['■■■', '■■■', ''],
    ])('splits %s', (value, amount, unit) => {
        expect(parts(value)).toEqual({ amount, unit });
    });

    it('uses an explicit unit as is', () => {
        expect(parts(13, 'h')).toEqual({ amount: '13', unit: 'h' });
    });
});
