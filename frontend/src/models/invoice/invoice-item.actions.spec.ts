import { of } from 'rxjs';
import '@app/nx/nx.static';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { getInvoiceItemActions } from '@models/invoice/invoice-item.actions';
import type { NxAction } from '@models/_core/nx.actions';

const ACTIVATE = 'activate subscription';
const PAUSE = 'pause subscription';

const item = (json: Record<string, unknown>) => InvoiceItem.fromJson({ id: '5', text: 'Hosting', ...json });
const action = (self: InvoiceItem, title: string): NxAction | undefined => getInvoiceItemActions(self).find((_) => _.title === title);
const visible = (self: InvoiceItem, title: string): boolean => {
    const found = action(self, title);
    return !!found && (found.on ? found.on() : true);
};

describe('subscription actions of invoice items', () => {
    it('offers activation only for paused repeating items', () => {
        expect(visible(item({ type: InvoiceItemType.Monthly, next_recurrence_at: null }), ACTIVATE)).toBe(true);
        expect(visible(item({ type: InvoiceItemType.Monthly, next_recurrence_at: '2026-12-01' }), ACTIVATE)).toBe(false);
    });

    it('offers pausing only for running repeating items', () => {
        expect(visible(item({ type: InvoiceItemType.Yearly, next_recurrence_at: '2026-12-01' }), PAUSE)).toBe(true);
        expect(visible(item({ type: InvoiceItemType.Yearly, next_recurrence_at: null }), PAUSE)).toBe(false);
    });

    it.each([InvoiceItemType.Default, InvoiceItemType.Inactive, InvoiceItemType.Optional, InvoiceItemType.Header, InvoiceItemType.Discount])('hides both for non-repeating type %s', (type) => {
        const self = item({ type, next_recurrence_at: '2026-12-01' });
        expect(visible(self, ACTIVATE)).toBe(false);
        expect(visible(self, PAUSE)).toBe(false);
        expect(visible(item({ type }), ACTIVATE)).toBe(false);
    });

    it('activates with today as next recurrence', () => {
        const self = item({ type: InvoiceItemType.Monthly });
        const update = vi.spyOn(self, 'update').mockReturnValue(of(self));
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const result = action(self, ACTIVATE)!.action!();

        expect(update).toHaveBeenCalledWith({ next_recurrence_at: iso });
        expect(result).toBeDefined();
    });

    it('pauses by clearing the next recurrence', () => {
        const self = item({ type: InvoiceItemType.Monthly, next_recurrence_at: '2026-12-01' });
        const update = vi.spyOn(self, 'update').mockReturnValue(of(self));

        const result = action(self, PAUSE)!.action!();

        expect(update).toHaveBeenCalledWith({ next_recurrence_at: null });
        expect(result).toBeDefined();
    });

    it('restricts both to invoicing and project managers', () => {
        const self = item({ type: InvoiceItemType.Monthly });
        expect(action(self, ACTIVATE)!.roles).toBe('invoicing|project_manager');
        expect(action(self, PAUSE)!.roles).toBe('invoicing|project_manager');
    });
});
