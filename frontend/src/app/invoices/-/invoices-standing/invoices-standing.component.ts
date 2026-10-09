import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NgbDateAdapter, NgbDatepickerModule, NgbDate } from '@ng-bootstrap/ng-bootstrap';
import { NgbDateCarbonAdapter } from '@directives/ngb-date.adapter';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { Company } from '@models/company/company.model';
import { GlobalService } from '@models/global.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { modelListResource } from '@models/http/model-resource';
import { MoneyPipe } from '@pipes/money.pipe';
import { SafePipe } from '@pipes/safe.pipe';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { EchartsComponent } from '@charts/echarts-wrapper/echarts-wrapper.component';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES } from '@charts/echarts-presets';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'invoices-standing',
    templateUrl: './invoices-standing.component.html',
    styleUrls: ['./invoices-standing.component.scss'],
    providers: [{ provide: NgbDateAdapter, useClass: NgbDateCarbonAdapter }],
    imports: [StackedTableDirective, MoneyPipe, Nx, AvatarComponent, FormsModule, NgbDatepickerModule, SafePipe, EmptyStateComponent, EchartsComponent],
})
export class InvoicesStandingComponent {
    parent = input<Company | null>(null);

    selection = signal<InvoiceItem[]>([]);
    selectionSum = signal(0);
    selectedCategories = signal<Set<string>>(new Set());

    categories = computed(() => {
        const map = new Map<string, { name: string; color: string; total: number }>();
        for (const item of this.items()) {
            const group = item.product_source?.rootGroup;
            const name = group?.name ?? 'Other';
            const color = group?.color || '#666666';
            if (!map.has(name)) map.set(name, { name, color, total: 0 });
            map.get(name)!.total += item.getYearlyPrice();
        }
        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    });

    filteredItems = computed(() => {
        const sel = this.selectedCategories();
        if (!sel.size) return this.items();
        return this.items().filter(item => sel.has(item.product_source?.rootGroup?.name ?? 'Other'));
    });

    filteredSum = computed(() => this.filteredItems().reduce((a, b) => a + b.getYearlyPrice(), 0));

    donutOptions = computed(() => {
        const cats = this.categories();
        if (!cats.length) return null;
        return {
            chart: { height: 180 },
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS, formatter: '{b}: {d}%' },
            series: [{
                type: 'pie',
                radius: ECHARTS_DONUT_SERIES.radius,
                avoidLabelOverlap: false,
                label: { show: false },
                labelLine: { show: false },
                emphasis: { scale: false },
                data: cats.map(c => ({ name: c.name, value: Math.round(c.total * 100) / 100, itemStyle: { color: c.color, ...ECHARTS_DONUT_ITEM_STYLE } })),
            }],
        };
    });

    #itemService = inject(InvoiceItemService);
    #global = inject(GlobalService);

    readonly #items = modelListResource(
        () => this.parent()?.id ?? '',
        (companyId) => this.#itemService.indexStandingOrders(companyId || undefined),
    );
    items = this.#items.value;
    isLoaded = computed(() => this.#items.hasValue());
    sum = computed(() => this.items().reduce((a, b) => a + b.getYearlyPrice(), 0));

    constructor() {
        this.#global
            .onSelectionIn(() => this.items(), 'yearlyPrice')
            .pipe(takeUntilDestroyed())
            .subscribe(([items, sum]) => {
                this.selection.set(items as InvoiceItem[]);
                this.selectionSum.set(sum as number);
            });
    }

    reload = () => this.#items.reload();

    updateDate(item: InvoiceItem, field: string, date: NgbDate) {
        const dateString = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
        item.update({ [field]: dateString }).subscribe(() => this.reload());
    }

    getDaysUntilNext = (item: InvoiceItem): number => {
        if (!item.next_recurrence_at) return 0;
        const diffTime = new Date(item.next_recurrence_at).getTime() - Date.now();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    toggleCategory(name: string) {
        this.selectedCategories.update(sel => {
            const next = new Set(sel);
            if (next.has(name)) next.delete(name); else next.add(name);
            return next;
        });
    }
}
