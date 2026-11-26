import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { renderComponent } from '@testing/component-test';
import { Nx } from '@app/nx/nx.directive';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { ProjectSubscriptionsCardComponent } from './project-subscriptions-card.component';

describe('ProjectSubscriptionsCardComponent', () => {
    const render = async (items: InvoiceItem[]) => {
        const requested: string[] = [];
        const fixture = renderComponent(ProjectSubscriptionsCardComponent, {
            inputs: { project: Project.fromJson({ id: '1', name: 'TALVIS', invoice_items: [] }) },
            providers: [{ provide: ProjectService, useValue: { indexRepeatingItems: (id: string) => (requested.push(id), of(items)) } }],
        });
        await fixture.whenStable();
        fixture.detectChanges();
        return { fixture, el: fixture.nativeElement as HTMLElement, requested };
    };

    const hosting = () => InvoiceItem.fromJson({ id: 11, text: 'Hosting', type: InvoiceItemType.Monthly, price: 99, net: 99, next_recurrence_at: '2026-12-01' });
    const backup = () => InvoiceItem.fromJson({ id: 12, text: 'Backup', type: InvoiceItemType.Yearly, price: 120, net: 120, next_recurrence_at: null });

    it('lists the subscriptions of the project with interval, price and status', async () => {
        const { el, requested } = await render([hosting(), backup()]);
        const rows = Array.from(el.querySelectorAll('li.list-group-item'));

        expect(requested).toEqual(['1']);
        expect(el.querySelector('.card-header')?.textContent?.trim()).toBe('subscriptions');
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain('Hosting');
        expect(rows[0].textContent).toContain('monthly');
        expect(rows[0].textContent).toContain('99');
        expect(rows[0].textContent).toContain('01.12.2026');
        expect(rows[1].textContent).toContain('Backup');
        expect(rows[1].textContent).toContain('yearly');
        expect(rows[1].textContent).toContain('inactive');
    });

    it('binds every row to its invoice item via [nx]', async () => {
        const items = [hosting(), backup()];
        const { fixture } = await render(items);
        const bound = fixture.debugElement.queryAll(By.directive(Nx)).map((_) => _.injector.get(Nx).nx());

        expect(bound).toEqual(items);
    });

    it('reloads after a context menu action resolved', async () => {
        const { fixture, requested } = await render([hosting()]);
        const row = fixture.debugElement.query(By.directive(Nx));

        row.injector.get(Nx).singleActionResolved.emit(undefined as never);
        await fixture.whenStable();

        expect(requested).toEqual(['1', '1']);
    });

    it('points to the quote tab when there are no subscriptions', async () => {
        const { el } = await render([]);
        const link = el.querySelector('a');

        expect(el.textContent).toContain('Subscriptions are added as repeating items in the quote tab.');
        expect(link?.getAttribute('href')).toBe('/projects/1/invoicing/quote');
    });
});
