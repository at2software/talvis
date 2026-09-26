import { renderComponent } from '@testing/component-test';
import { RteComponent } from './rte.component';

describe('RteComponent', () => {
    it('renders the empty state when the bound field is null', () => {
        const fixture = renderComponent(RteComponent, { inputs: { object: { notes: null }, key: 'notes' } });

        expect(fixture.nativeElement.querySelector('empty-state')).toBeTruthy();
    });

    it('collapses to the warning badge when compact and the bound field is null', () => {
        const fixture = renderComponent(RteComponent, { inputs: { object: { notes: null }, key: 'notes', compact: true } });

        expect(fixture.nativeElement.querySelector('empty-state')).toBeNull();
        expect(fixture.nativeElement.querySelector('.compact-warning')).toBeTruthy();
        expect(fixture.nativeElement.querySelector('.preview')?.classList.contains('compact')).toBe(true);
    });
});
