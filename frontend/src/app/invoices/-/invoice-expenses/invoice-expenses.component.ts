import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ExpenseCategory } from '@models/expense/expense-category.model';
import { Expense } from '@models/expense/expense.model';
import { ExpenseService } from '@models/expense/expense.service';
import { GlobalService } from '@models/global.service';
import { ModalEditExpenseComponent } from '@app/_modals/modal-edit-expense/modal-edit-expense.component';
import { Toast } from '@shards/toast/toast';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { Dictionary } from '@constants/constants';
import { forkJoin, Observable, tap } from 'rxjs';
import { modelListResource } from '@models/http/model-resource';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { MoneyPipe } from '@pipes/money.pipe';
import { DndDirective } from '@directives/dnd.directive';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { DatePipe } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES } from '@charts/echarts-presets';
import { ModalInputComponent } from '@app/_modals/modal-input/modal-input.component';
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'invoice-expenses',
    templateUrl: './invoice-expenses.component.html',
    imports: [StackedTableDirective, Nx, NComponent, MoneyPipe, DndDirective, EmptyStateComponent, ToolbarComponent, DatePipe, NgxEchartsDirective, NgbTooltip, SpinnerComponent],
})
export class InvoiceExpensesComponent {

    #expenseService = inject(ExpenseService);
    #global = inject(GlobalService);
    #modalService = inject(ModalBaseService);

    readonly #categoriesResource = modelListResource(() => this.#expenseService.indexCategories().pipe(tap((cats) => cats.forEach((_) => (_.var.visible = true)))));
    categories = linkedSignal(this.#categoriesResource.value);

    readonly #categoryNames = computed<Dictionary<string>>(() => this.categories().reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {}));

    readonly #expensesResource = modelListResource(
        () => (this.#categoriesResource.hasValue() ? Object.entries(this.#categoryNames()).flat().join('|') : undefined),
        () => this.#expenseService.index().pipe(tap((data) => data.forEach((_) => _.addCategoryChangeAction(this.#categoryNames(), _.actions.length - 1)))),
    );
    expenses = linkedSignal(this.#expensesResource.value);

    isLoaded = computed(() => this.#expensesResource.hasValue());
    sum = linkedSignal(() => this.#expensesResource.value().reduce((a, b) => a + b.yearlyPrice, 0));
    selectionSum = signal(0);
    selectionExpenses = signal<Expense[]>([]);
    lopsHeaders = signal<string[] | undefined>(undefined);
    lopsItems = signal<string[][] | undefined>(undefined);

    readonly donutChart = computed<EChartsOption>(() => {
        const cats = this.categories();
        const exps = this.expenses();
        return {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', formatter: (p) => { 
                const pt = p as { name: string; percent: number }; 
                return `${pt.name}<br/>${pt.percent}%`; 
            }},
            series: [{
                type: 'pie',
                radius: ECHARTS_DONUT_SERIES.radius,
                data: cats.map(c => ({
                    name:      c.name,
                    value:     exps.filter(e => e.category_id == c.id).reduce((s, e) => s + e.yearlyPrice, 0),
                    itemStyle: { color: c.css(), ...ECHARTS_DONUT_ITEM_STYLE },
                })).filter(d => d.value > 0),
                label: { show: false },
                emphasis: { label: { show: false } },
            }],
        };
    });

    readonly #lopsNameColumn = 1;
    readonly #lopsCostColumn = 8;

    constructor() {
        this.#global
            .onSelectionIn(() => this.expenses(), 'yearlyPrice')
            .pipe(takeUntilDestroyed())
            .subscribe(([items, sum]) => {
                this.selectionExpenses.set(items as Expense[]);
                this.selectionSum.set(sum as number);
            });
        this.#global.onActionsResolved
            .pipe(takeUntilDestroyed())
            .subscribe(({ object, action:_action }) => {
                if (object instanceof Expense) {
                    this.expenses.update(expenses => [...expenses]);
                }
                if (object instanceof ExpenseCategory) {
                    this.categories.update(categories => [...categories]);
                }
            });
    }

    reload = () => this.#expensesResource.reload();

    onNewExpense = () => this.#modalService.open(ModalEditExpenseComponent, undefined);
    onNewExpenseCategory() {
        this.#modalService
            .open(ModalInputComponent, { title: $localize`:@@i18n.invoices.newCategory:New category` })
            .then(response => {
                if (response) {
                    const category = ExpenseCategory.fromJson({ name: response.text });
                    category.store().subscribe(() => {
                        this.categories.set([...this.categories(), category]);
                    });
                }
        });
    }

    categoryFor = (_: Expense): ExpenseCategory | undefined => this.categories().find((x) => x.id == _.category_id);
    sumFor = (_: ExpenseCategory): number => this.expenses().filter((x) => x.category_id == _.id).reduce((a, x) => a + x.yearlyPrice, 0);

    toggleCategoryVisibility = (_: ExpenseCategory) => {
        _.var.visible = !_.var.visible;
        this.sum.set(
            this.categories()
                .filter((_) => _.var.visible)
                .map((_) => this.sumFor(_))
                .reduce((a, b) => a + b, 0),
        );
    };

    getItems = () => {
        const conv = (s: string) => parseFloat(s.replace('.', '').replace(',', '.'));
        const headers = this.lopsHeaders();
        const lopsItems = this.lopsItems();
        if (headers) {
            const names = lopsItems?.map((_) => _[this.#lopsNameColumn].trim().toLowerCase()) ?? [];
            const m = this.expenses().filter((_) => names.findIndex((x) => x === _.name.trim().toLowerCase()) !== -1);
            let lopsCategory: string | undefined = undefined;
            m.forEach((_) => {
                const index = names.findIndex((x) => x === _.name.trim().toLowerCase());
                _.var.lops = conv(lopsItems![index][this.#lopsCostColumn]);
                lopsCategory = _.category_id;
            });
            names.forEach((_, i: number) => {
                const index = m.findIndex((x) => x.name.trim().toLowerCase() === _);
                if (index === -1) {
                    const node = Expense.fromJson({
                        name: lopsItems![i][this.#lopsNameColumn],
                        price: -1,
                        repeat: InvoiceItemType.Monthly,
                        category_id: this.categories()[0].id,
                        invoice_item_id: null,
                    });
                    node.var.lops = conv(lopsItems![i][this.#lopsCostColumn]);
                    m.push(node);
                }
            });
            if (lopsCategory) {
                const deprecated = this.expenses().filter((_) => _.category_id == lopsCategory && names.findIndex((x) => x === _.name.trim().toLowerCase()) === -1);
                deprecated.forEach((_) => {
                    _.var.lops = -1;
                    m.push(_);
                });
            }
            return this.#sortByNext(m);
        } else {
            return this.#sortByNext(this.expenses());
        }
    };

    #sortByNext = (items: Expense[]) =>
        [...items].sort((a, b) => (a.daysUntilNext() ?? Infinity) - (b.daysUntilNext() ?? Infinity));

    onDnd(files: File[]) {
        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
            this.categories().forEach((_) => (_.var.visible = true));
            const text = event.target!.result as string;
            const lines = text.split(/\r?\n|\r|\n/g);
            while (lines.length && (lines[0].match(/;/g) || []).length < 2) {
                lines.shift();
            }
            if (lines.length === 0) {
                Toast.warn('invalid CSV file');
                return;
            }
            this.lopsHeaders.set(lines.shift()!.split(/;/));
            const n: string[][] = [];
            let realItem = true;
            while (lines.length && realItem) {
                const o = lines.shift()!.split(/;/);
                if (o.length !== this.lopsHeaders()!.length) realItem = false;
                if (o[this.#lopsNameColumn].trim().length === 0) realItem = false;
                if (realItem) n.push(o);
            }
            this.lopsItems.set(n);
        };
        reader.readAsText(files[0], 'ansi_x3.4-1968');
    }

    onLopsUpdate() {
        const items = this.getItems();
        const observables: Observable<Expense>[] = [];
        items.forEach((item) => {
            if (item.price === -1) {
                item.price = item.var.lops;
                observables.push(item.store());
            } else {
                observables.push(item.var.lops === -1 ? item.delete() : item.update({ price: item.var.lops }));
            }
        });
        forkJoin(observables).subscribe(() => {
            this.lopsHeaders.set(undefined);
            this.lopsItems.set(undefined);
            this.reload();
        });
    }
}
