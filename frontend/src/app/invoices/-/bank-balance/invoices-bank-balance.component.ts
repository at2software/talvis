import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ExpenseService } from '@models/expense/expense.service';
import { modelListResource } from '@models/http/model-resource';
import { ExpenseCategory } from '@models/expense/expense-category.model';
import { Expense } from '@models/expense/expense.model';
import { ModalEditExpenseComponent } from '@app/_modals/modal-edit-expense/modal-edit-expense.component';
import { ModalAssignExpenseComponent } from '@app/_modals/modal-assign-expense/modal-assign-expense.component';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { Toast } from '@shards/toast/toast';
import { NxAction } from '@models/_core/nx.actions';
import { INxContextMenu } from '@models/_core/nx.contextmenu.interface';
import { NxService } from '@app/nx/nx.service';
import { AutosaveDirective } from "@directives/autosave.directive";
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { Color } from '@constants/Color';
import { ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES } from '@charts/echarts-presets';
import { GlobalService } from '@models/global.service';
import { NgbDropdownModule, NgbModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { StackedTableDirective } from '@directives/stacked-table.directive';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface TBankTx extends INxContextMenu {
    date: string;
    amount: number;
    sender: string;
    reference: string;
    key: string;
}

interface TMatchedTx {
    date: string;
    amount: number;
    sender: string;
    reference: string;
    key: string;
}

interface TMatchedItem {
    expense: Expense;
    transactions: TMatchedTx[];
    is_amount_mismatch: boolean;
    latest_amount: number;
}

function longestCommonSubstring(strings: string[]): string {
    if (strings.length < 2) return '';
    const s0 = strings[0].toLowerCase();
    let best = '';
    for (let i = 0; i < s0.length; i++) {
        for (let j = i + 4; j <= s0.length; j++) {
            const sub = s0.substring(i, j);
            if (strings.every((s) => s.toLowerCase().includes(sub)) && sub.length > best.length) best = sub;
        }
    }
    return best.trim();
}

@Component({
    selector: 'invoices-bank-balance',
    templateUrl: './invoices-bank-balance.component.html',
    styleUrl: './invoices-bank-balance.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StackedTableDirective, FormsModule, Nx, NComponent, ToolbarComponent, AutosaveDirective, NgxEchartsDirective, NgbTooltipModule, NgbDropdownModule, SpinnerComponent],
})
export class InvoicesBankBalanceComponent {
    #expenseService = inject(ExpenseService);
    #sanitizer = inject(DomSanitizer);
    #global = inject(GlobalService);
    #nxService = inject(NxService);
    #ngbModal = inject(NgbModal);

    isLoading = signal(false);
    matched = signal<TMatchedItem[]>([]);
    unmatched = signal<TBankTx[]>([]);
    categories = modelListResource(() => this.#expenseService.indexCategories()).value;

    readonly #allExpenses = modelListResource(() => this.#expenseService.index());
    allExpenses = linkedSignal(this.#allExpenses.value);

    selectedCategoryIds = signal<Set<string>>(new Set());
    selectedTxs = signal<TBankTx[]>([]);

    selectedPatternCategoryIds = signal<Set<string>>(new Set());
    expandedIds = signal<Set<string>>(new Set());
    filterText = signal('');
    hideSingleDebitors = signal(false);

    constructor() {
        this.#global.onSelectionIn(() => this.unmatched())
            .pipe(takeUntilDestroyed())
            .subscribe(([items]) => this.selectedTxs.set(items as TBankTx[]));
    }

    readonly allPatternItems = computed<TMatchedItem[]>(() => {
        const matchedIds = new Set(this.matched().map(m => String(m.expense.id)));
        const extras = this.allExpenses()
            .filter(e => e.matching_string && !matchedIds.has(String(e.id)))
            .map(e => ({ expense: e, transactions: [] as TBankTx[], is_amount_mismatch: false, latest_amount: 0 }));
        return [...this.matched(), ...extras];
    });

    readonly filteredPatternItems = computed<TMatchedItem[]>(() => {
        const cats = this.selectedPatternCategoryIds();
        if (cats.size === 0) return this.allPatternItems();
        return this.allPatternItems().filter(m => cats.has(String(m.expense.category_id)));
    });

    readonly filteredExpensesWithoutPattern = computed<Expense[]>(() => {
        const cats = this.selectedCategoryIds();
        let list = this.allExpenses().filter(e => !e.matching_string);
        if (cats.size > 0) list = list.filter(e => cats.has(String(e.category_id)));
        return list;
    });

    readonly matchRatioChart = computed<EChartsOption>(() => {
        const matchedCount = this.matched().reduce((s, m) => s + m.transactions.length, 0);
        const unmatchedCount = this.unmatched().length;
        if (!matchedCount && !unmatchedCount) return {};
        const primaryColor = Color.fromVar('primary').toHexString();
        const dangerColor = Color.fromVar('danger').toHexString();
        return {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', formatter: (p) => { const pt = p as { name: string; value: number }; return `${pt.name}: ${pt.value}`; } },
            series: [{
                type: 'pie',
                radius: ECHARTS_DONUT_SERIES.radius,
                data: [
                    { name: 'matched', value: matchedCount, itemStyle: { color: primaryColor, ...ECHARTS_DONUT_ITEM_STYLE } },
                    { name: 'unmatched', value: unmatchedCount, itemStyle: { color: dangerColor, ...ECHARTS_DONUT_ITEM_STYLE } },
                ].filter(d => d.value > 0),
                label: { show: false },
            }],
        };
    });

    readonly filteredUnmatched = computed<TBankTx[]>(() => {
        let txs = this.unmatched();
        if (this.hideSingleDebitors()) {
            const counts = new Map<string, number>();
            txs.forEach(tx => counts.set(tx.sender, (counts.get(tx.sender) ?? 0) + 1));
            txs = txs.filter(tx => (counts.get(tx.sender) ?? 0) > 1);
        }
        const text = this.filterText().toLowerCase();
        return text ? txs.filter(tx => tx.reference.toLowerCase().includes(text) || tx.sender.toLowerCase().includes(text)) : txs;
    });

    readonly commonPattern = computed<string>(() => {
        const txs = this.selectedTxs();
        if (txs.length === 0) return '';
        if (txs.length === 1) return txs[0].reference;
        return longestCommonSubstring(txs.map(t => t.reference));
    });

    readonly expensesWithoutPattern = computed<Expense[]>(() => this.allExpenses().filter(e => !e.matching_string));

    readonly expensesWithPattern = computed<Expense[]>(() => this.allExpenses().filter(e => !!e.matching_string));

    categoryFor = (exp: Expense): ExpenseCategory | undefined => this.categories().find(c => String(c.id) === String(exp.category_id));

    isCatSelected = (id: string) => this.selectedCategoryIds().has(String(id));
    isPatternCatSelected = (id: string) => this.selectedPatternCategoryIds().has(String(id));

    toggleCategory(id: string) {
        this.selectedCategoryIds.update(s => {
            const key = String(id);
            const n = new Set(s);
            if (n.has(key)) n.delete(key); else n.add(key);
            return n;
        });
    }

    togglePatternCategory(id: string) {
        this.selectedPatternCategoryIds.update(s => {
            const key = String(id);
            const n = new Set(s);
            if (n.has(key)) n.delete(key); else n.add(key);
            return n;
        });
    }

    clearTxSelection = () => this.#nxService.deselectAll();

    load() {
        this.isLoading.set(true);
        forkJoin({
            bank: this.#expenseService.bankDebitTransactions(),
            expenses: this.#expenseService.index(),
        }).subscribe({
            next: ({ bank, expenses }) => {
                const matched: TMatchedItem[] = (bank.matched ?? []).map((item) => {
                    const expense: Expense =
                        expenses.find((e: Expense) => String(e.id) === String(item.expense.id)) ?? Expense.fromJson(item.expense);
                    if (item.is_amount_mismatch) {
                        expense.actions = expense.actions.filter((a: NxAction) => !a.title?.startsWith('apply'));
                        expense.actions.unshift({
                            title: `apply new value (€${(+item.latest_amount).toFixed(2)})`,
                            action: () => this.#applyNewValue(expense, +item.latest_amount),
                        });
                    }
                    return {
                        expense,
                        transactions: item.transactions.map((tx, i) => ({ ...tx, key: `m|${tx.date}|${i}` })),
                        is_amount_mismatch: !!item.is_amount_mismatch,
                        latest_amount: +item.latest_amount,
                    };
                });

                this.matched.set(matched);
                this.unmatched.set(
                    (bank.unmatched ?? []).map((tx, i) => ({
                        ...tx,
                        key: `u|${tx.date}|${tx.amount}|${i}`,
                        actions: this.#makeTxActions(),
                        class: 'BankTx',
                        track_id: i,
                    })),
                );
                this.allExpenses.set(expenses);
                this.isLoading.set(false);
            },
            error: () => this.isLoading.set(false),
        });
    }

    #makeTxActions(): NxAction[] {
        return [
            {
                title: $localize`:@@i18n.invoices.createNewExpense:create new expense`,
                doubleClick: true,
                group: true,
                action: () => this.createExpenseFromNxSelection(),
            },
            {
                title: $localize`:@@i18n.invoices.assignToExpense:assign to expense`,
                group: true,
                on: () => this.expensesWithoutPattern().length > 0,
                action: () => this.openAssignModalNx(),
            },
            {
                title: $localize`:@@i18n.invoices.changeStringOnExpense:change string on expense`,
                group: true,
                on: () => this.expensesWithPattern().length > 0,
                children: () => this.expensesWithPattern().map(exp => ({
                    title: exp.name,
                    group: true,
                    action: () => this.changeStringOnExpense(exp),
                })),
            },
        ];
    }

    #applyNewValue(expense: Expense, newPrice: number) {
        expense.price = newPrice;
        expense.update().subscribe(() => {
            Toast.success('expense price updated');
            expense.actions = expense.actions.filter((a: NxAction) => !a.title?.startsWith('apply'));
            this.matched.update(items => items.map(m => m.expense.id === expense.id ? { ...m, is_amount_mismatch: false } : m));
        });
    }

    toggleExpand(id: string) {
        this.expandedIds.update(s => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    }
    isExpanded = (id: string) => this.expandedIds().has(id);

    highlightRef(reference: string): SafeHtml {
        const pattern = this.commonPattern();
        if (!pattern) return this.#sanitizer.bypassSecurityTrustHtml(this.#esc(reference));
        const lref = reference.toLowerCase();
        const lpat = pattern.toLowerCase();
        const parts: string[] = [];
        let pos = 0;
        let fi = lref.indexOf(lpat, pos);
        while (fi >= 0) {
            parts.push(this.#esc(reference.substring(pos, fi)));
            parts.push(`<mark>${this.#esc(reference.substring(fi, fi + pattern.length))}</mark>`);
            pos = fi + pattern.length;
            fi = lref.indexOf(lpat, pos);
        }
        parts.push(this.#esc(reference.substring(pos)));
        return this.#sanitizer.bypassSecurityTrustHtml(parts.join(''));
    }

    #esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    createExpenseFromNxSelection() {
        const ref = this.#ngbModal.open(ModalEditExpenseComponent, { size: 'xl' });
        ref.componentInstance.init(undefined);
        ref.componentInstance.item.matching_string = this.commonPattern();
    }

    openAssignModalNx() {
        const pattern = this.commonPattern();
        ModalBaseService.open(ModalAssignExpenseComponent, this.expensesWithoutPattern(), pattern).then((expense) => {
            if (!expense) return;
            expense.matching_string = pattern;
            expense.update().subscribe(() => {
                Toast.success(`pattern assigned to "${expense.name}"`);
                this.load();
            });
        });
    }

    changeStringOnExpense(expense: Expense) {
        const pattern = this.commonPattern();
        expense.matching_string = pattern;
        expense.update().subscribe(() => {
            Toast.success(`pattern updated for "${expense.name}"`);
            this.load();
        });
    }
}
