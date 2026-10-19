import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgbTooltipModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { Project } from '@models/project/project.model';
import { Company } from '@models/company/company.model';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';

import { WIDGET_SHARED } from '../widgets.shared';
import { PermissionsDirective } from '@directives/permissions.directive';
import { WidgetService } from '@models/widget.service';
import { forkJoin } from 'rxjs';
import { REFLECTION } from '@constants/constants';
import { Router } from '@angular/router';
import { ParamChartSeriesDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

type TInvoiceItem = Project | Company;
interface TGroupedItem {
    company: Company;
    items: { type: string; value: number; objects: TInvoiceItem[] }[];
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-invoice-manager',
    templateUrl: './widget-invoice-manager.component.html',
    styleUrls: ['./widget-invoice-manager.component.scss', './../base.widget.component.scss'],
    imports: [ValueUnitComponent, NgbTooltipModule, NgbDropdownModule, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetInvoiceManagerComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);
    #router = inject(Router);

    defaultOptions = () => ({
        ...WidgetOptions.onlyMine,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) => {
        const query = { ...options };
        delete query['max-items'];
        if (this.hasInvoicesModule()) query['withChart'] = '1';
        return forkJoin({
            timebased: this.#widgetService.indexCashflow('PROJECTS_TIMEBASED', query, Project),
            support: this.#widgetService.indexCashflow('CUSTOMER_SUPPORT', query, Company),
            prepared: this.#widgetService.indexCashflow('INVOICES_PREPARED', query, Object),
        });
    }, this.hasInvoicesExpenses);

    readonly #timebased = computed<Project[]>(() => (this.#cashflow.value()?.timebased.objects ?? []).map((p) => { p.var.itemType = 'timebased'; return p; }));
    readonly #support = computed<Company[]>(() => (this.#cashflow.value()?.support.objects ?? []).map((c) => { c.var.itemType = 'support'; return c; }));
    readonly #prepared = computed<TInvoiceItem[]>(() =>
        (this.#cashflow.value()?.prepared.objects ?? [])
            .map((x) => {
                const c = REFLECTION(x);
                if (!(c instanceof Company) && !(c instanceof Project)) return undefined;
                c.var.itemType = 'prepared';
                if (c instanceof Company) c.actions[0].action = () => c.navigateTo(`/customers/${c.id}/billing`);
                if (c instanceof Project) c.actions[0].action = () => c.navigateTo(`/projects/${c.id}/invoicing`);
                return c;
            })
            .filter((a: TInvoiceItem | undefined): a is TInvoiceItem => !!a)
            .filter((a: TInvoiceItem) => this.#getAppliedValue(a) > 0),
    );

    readonly groupedData = computed<TGroupedItem[]>(() => {
        const allItems = [...this.#timebased(), ...this.#support(), ...this.#prepared()].sort((a, b) => this.#getAppliedValue(b) - this.#getAppliedValue(a));

        const groupMap = new Map<string, TGroupedItem>();
        allItems.forEach((item) => {
            const company = item instanceof Project ? item.company : item;
            if (!groupMap.has(company.id)) groupMap.set(company.id, { company, items: [] });

            const group = groupMap.get(company.id)!;
            const itemType = item.var.itemType;
            const itemValue = this.#getAppliedValue(item);
            const existingItem = group.items.find((i) => i.type === itemType);
            if (existingItem) {
                existingItem.value += itemValue;
                existingItem.objects.push(item);
            } else {
                group.items.push({ type: itemType, value: itemValue, objects: [item] });
            }
        });

        return Array.from(groupMap.values())
            .map((group) => {
                group.items.sort((a, b) => b.value - a.value);
                this.#aggregateBadges(group);
                return group;
            })
            .sort((a, b) => this.getTotalForGroup(b) - this.getTotalForGroup(a));
    });

    readonly chartData = computed<ParamChartSeriesDto[]>(() => {
        const response = this.#cashflow.value();
        if (!response) return [];
        return [response.timebased.history, response.support.history, response.prepared.history].filter((_) => !!_).map((h) => [h].flat()[0]);
    });

    override value = this.headline(this.#cashflow, () =>
        [...this.#timebased(), ...this.#support(), ...this.#prepared()].reduce((sum, item) => sum + this.#getAppliedValue(item), 0),
    );

    #getAppliedValue(item: TInvoiceItem): number { return item.cashflow_value ?? 0 }

    #aggregateBadges(group: TGroupedItem): void {
        const badges = group.items.flatMap((item) => item.objects).filter((obj) => obj.getBadge()?.[1]).map((obj) => obj.getBadge()![1]);
        if (!badges.length) return;
        const uniqueBadges = [...new Set(badges)];
        group.company.setBadge(['bg-danger', uniqueBadges.length > 1 ? uniqueBadges.map((b) => `• ${b}`).join('\n') : uniqueBadges[0]]);
    }

    getColorForType = (type: string) => ({ timebased: 'cyan', support: 'cyan-teal', prepared: 'teal' }[type] ?? 'grey');

    getTooltipForType = (type: string) => ({
        timebased: $localize`:@@i18n.widget.invoiceManager.timebased:time-based projects`,
        support: $localize`:@@i18n.common.customerSupport:customer support`,
        prepared: $localize`:@@i18n.common.preparedInvoices:prepared invoices`,
    }[type] ?? '');

    getTotalForGroup = (group: TGroupedItem) => group.items.reduce((sum, item) => sum + item.value, 0);
    isCompactGroup = (group: TGroupedItem) => !group.company.getBadge();

    onBadgeClick(group: TGroupedItem, item: { type: string; value: number; objects: TInvoiceItem[] }, event: Event): void {
        event.stopPropagation();
        if (item.type === 'prepared') this.#router.navigate(['/customers', group.company.id, 'billing']);
        else if (item.type === 'support') this.#router.navigate(['/customers', group.company.id, 'support']);
    }

    getTimebasedProjects = (group: TGroupedItem) => group.items.filter((item) => item.type === 'timebased').flatMap((item) => item.objects as Project[]);
    navigateToProjectSupport = (projectId: string) => this.#router.navigate(['/projects', projectId, 'support']);
    getProjectValue = (project: Project) => project.cashflow_value ?? 0;
}
