import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { HotkeyDirective } from '@directives/hotkey.directive';
import type { PlanningRow } from '@app/projects/id/project-planning/planning-markdown';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-import-planning',
    templateUrl: './modal-import-planning.component.html',
    imports: [HotkeyDirective],
})
export class ModalImportPlanningComponent extends ModalBaseComponent<PlanningRow[]> {
    static override modalOptions: NgbModalOptions = { size: 'lg' };

    readonly type = InvoiceItemType;

    fileName = '';
    rows = signal<PlanningRow[]>([]);
    selected = signal<Set<number>>(new Set());

    readonly itemCount = computed(() => this.#selectedRows().filter((_) => _.type !== InvoiceItemType.Header).length);
    readonly headerCount = computed(() => this.#selectedRows().filter((_) => _.type === InvoiceItemType.Header).length);
    readonly allSelected = computed(() => this.rows().length > 0 && this.selected().size === this.rows().length);
    readonly canSubmit = computed(() => this.selected().size > 0);

    init(rows: PlanningRow[], fileName: string): void {
        this.rows.set(rows);
        this.fileName = fileName;
        this.selected.set(new Set(rows.map((_, index) => index)));
    }

    isSelected = (index: number): boolean => this.selected().has(index);

    toggleSelected(index: number): void {
        this.selected.update((set) => {
            const next = new Set(set);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }

    toggleSelectAll(): void {
        const deselect = this.allSelected();
        this.selected.set(deselect ? new Set() : new Set(this.rows().map((_, index) => index)));
    }

    onSuccess(): PlanningRow[] {
        return this.#selectedRows();
    }

    #selectedRows = () => this.rows().filter((_, index) => this.selected().has(index));
}
