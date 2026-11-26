import { of } from 'rxjs';
import { renderComponent } from '@testing/component-test';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { InvoiceItemStage } from '@enums/invoice-item.stage';
import { Company } from '@models/company/company.model';
import { Focus } from '@models/focus/focus.model';
import { FocusService } from '@models/focus/focus.service';
import { GlobalService } from '@models/global.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { Product } from '@models/product/product.model';
import { Project } from '@models/project/project.model';
import { ProjectState } from '@models/project/project-state.model';
import { ExtIssueResolverService } from '@models/ext-issue/ext-issue-resolver.service';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { ProjectSupportComponent } from './project-support.component';

describe('ProjectSupportComponent', () => {
    const item = (json: Record<string, unknown>) => InvoiceItem.fromJson({ stage: InvoiceItemStage.Support, type: InvoiceItemType.Default, net: 100, qty: 1, price: 100, ...json });
    const focus = (id: string, parent: Project | Company) => Focus.fromJson({ id, duration: 1.5, started_at: '2026-11-10T10:00:00', comment: 'fix ' + id, parent_id: parent.id }).adoptParent(parent);

    const hyperCareProject = () => Project.fromJson({ id: '1', name: 'TALVIS', state: { id: ProjectState.HyperCare }, product: { id: '5', name: 'Support' }, invoice_items: [] });
    const runningProject = () => Project.fromJson({ id: '1', name: 'TALVIS', state: { id: 2 }, product: { id: '5', name: 'Support' }, invoice_items: [] });

    const render = async (parent: Project | Company, items: InvoiceItem[]) => {
        const foci = [focus('101', parent), focus('102', parent)];
        const focusService = {
            uninvoicedFoci: vi.fn(() => of(foci)),
            linkToInvoiceItem: vi.fn((_p: unknown, _ids: string[], targetId: string) => of(items.find((_) => _.id === targetId)!)),
            createInvoiceItemsFor: vi.fn(() => of(item({ id: '99', text: 'new' }))),
        };
        const fixture = renderComponent(ProjectSupportComponent, {
            inputs: { parent },
            providers: [
                { provide: FocusService, useValue: focusService },
                { provide: InvoiceItemService, useValue: { getInvoiceItems: () => of(items) } },
                { provide: ExtIssueResolverService, useValue: { resolveRows: () => undefined } },
                { provide: PluginInstanceFactory, useValue: { getTaskInstances: () => [] } },
            ],
        });
        await fixture.whenStable();
        fixture.detectChanges();
        const component = fixture.componentInstance;
        const select = async (selected: Focus[]) => {
            fixture.debugElement.injector.get(GlobalService).registerSelectedObject(selected, false);
            await new Promise((r) => setTimeout(r));
            fixture.detectChanges();
            await fixture.whenStable();
        };
        return { fixture, component, focusService, foci, select, el: fixture.nativeElement as HTMLElement };
    };

    const open = () => item({ id: '11', text: '<p>Wartung <b>Oktober</b></p>', created_at: '2026-10-01 00:00:00' });
    const subscription = () => item({ id: '12', text: 'Care plan', type: InvoiceItemType.Monthly, created_at: '2026-01-01 00:00:00' });
    const billed = () => item({ id: '13', text: 'old', invoice_id: '7', created_at: '2026-09-01 00:00:00' });
    const olderSpawn = () => item({ id: '14', text: 'Care plan<br>Zeitraum: Okt', recurrence_source_id: 12, created_at: '2026-10-01 00:00:00' });
    const newerSpawn = () => item({ id: '15', text: 'Care plan<br>Zeitraum: Nov', recurrence_source_id: 12, created_at: '2026-11-01 00:00:00' });

    it('offers open support items but no subscriptions and no billed items as targets', async () => {
        const { component } = await render(runningProject(), [open(), subscription(), billed(), olderSpawn()]);

        expect(component.targetCandidates().map((_) => _.id)).toEqual(['11', '14']);
    });

    it('preselects the most recent recurrence spawn in hyper care', async () => {
        const { component, foci, select, el } = await render(hyperCareProject(), [olderSpawn(), newerSpawn(), open()]);

        await select(foci);

        expect(component.selectionTarget()?.id).toBe('15');
        const options = Array.from(el.querySelectorAll<HTMLOptionElement>('select[data-test="support-target"] option'));
        expect(options[0].textContent?.trim()).toBe('new item');
        expect(options.map((_) => _.textContent)).toContainEqual(expect.stringContaining('Wartung Oktober'));
    });

    it('keeps "new item" without spawns, outside hyper care and for companies', async () => {
        for (const [parent, items] of [
            [hyperCareProject(), [open()]],
            [runningProject(), [olderSpawn(), newerSpawn()]],
            [Company.fromJson({ id: '3', name: 'ACME' }), [olderSpawn(), newerSpawn()]],
        ] as [Project | Company, InvoiceItem[]][]) {
            const { component, foci, select } = await render(parent, items);
            await select(foci);
            expect(component.selectionTarget()).toBeNull();
        }
    });

    it('links all selected foci to the chosen item in one request and hides product and description', async () => {
        const { component, focusService, foci, select, el, fixture } = await render(hyperCareProject(), [newerSpawn(), open()]);
        let reloads = 0;
        component.parentReloadRequested.subscribe(() => reloads++);
        await select(foci);

        expect(el.querySelector('search-input')).toBeNull();
        expect(el.querySelector('textarea')).toBeNull();
        expect(el.querySelector('[data-test="create-support-item"]')).toBeNull();

        el.querySelector<HTMLButtonElement>('[data-test="link-support-item"]')!.click();
        fixture.detectChanges();

        expect(focusService.linkToInvoiceItem).toHaveBeenCalledTimes(1);
        expect(focusService.linkToInvoiceItem.mock.calls[0][1]).toEqual(['101', '102']);
        expect(focusService.linkToInvoiceItem.mock.calls[0][2]).toBe('15');
        expect(focusService.createInvoiceItemsFor).not.toHaveBeenCalled();
        expect(component.selection()).toEqual([]);
        expect(component.allFoci()).toEqual([]);
        expect(reloads).toBe(1);
    });

    it('creates a new item as before when "new item" is the target', async () => {
        const { component, focusService, foci, select, el, fixture } = await render(runningProject(), [open()]);
        await select(foci);
        component.selectionProduct.set(Product.fromJson({ id: '5', name: 'Support' }));
        fixture.detectChanges();

        expect(el.querySelector('textarea')).not.toBeNull();
        el.querySelector<HTMLButtonElement>('[data-test="create-support-item"]')!.click();

        expect(focusService.createInvoiceItemsFor).toHaveBeenCalledTimes(1);
        expect(focusService.linkToInvoiceItem).not.toHaveBeenCalled();
    });
});
