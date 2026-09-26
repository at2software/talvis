import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Dictionary } from '@constants/constants';
import { DeletionLog } from '@models/deletion-log/deletion-log.model';
import { DeletionLogService } from '@models/deletion-log/deletion-log.service';
import { modelResource, modelListResource } from '@models/http/model-resource';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { StackedTableDirective } from '@directives/stacked-table.directive';

const HIDDEN_META_KEYS = ['project_id', 'company_id', 'invoice_id'];

@Component({
    selector: 'settings-deletion-log',
    templateUrl: './settings-deletion-log.component.html',
    imports: [DatePipe, FormsModule, NgbTooltipModule, AvatarComponent, SpinnerComponent, StackedTableDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDeletionLogComponent {
    #service = inject(DeletionLogService);

    search = signal('');
    modelType = signal('');
    page = signal(1);

    #modelTypes = modelListResource(() => this.#service.indexModelTypes());
    modelTypes = this.#modelTypes.value;

    #logs = modelResource(
        () => ({ q: this.search(), model_type: this.modelType(), page: this.page() }),
        (params) => this.#service.indexPaginated(params),
    );

    loading = this.#logs.isLoading;
    logs = computed(() => this.#logs.value()?.data ?? []);
    lastPage = computed(() => this.#logs.value()?.last_page ?? 1);
    total = computed(() => this.#logs.value()?.total ?? 0);

    setSearch(value: string) {
        this.page.set(1);
        this.search.set(value);
    }
    setModelType(value: string) {
        this.page.set(1);
        this.modelType.set(value);
    }
    turnPage(delta: number) {
        this.page.update((_) => Math.min(Math.max(_ + delta, 1), this.lastPage()));
    }
    restore(log: DeletionLog) {
        this.#service.restore(log).subscribe(() => this.#logs.reload());
    }
    metaChips(log: DeletionLog): { key: string; value: string }[] {
        return Object.entries(log.meta ?? {})
            .filter(([key, value]) => !HIDDEN_META_KEYS.includes(key) && this.#isPresent(value))
            .map(([key, value]) => ({ key, value: Array.isArray(value) ? String(value.length) : String(value) }));
    }
    #isPresent(value: unknown): boolean {
        if (value === null || value === undefined || value === '' || value === 0 || value === false) return false;
        return !(Array.isArray(value) && !value.length);
    }
    contextLabel(log: DeletionLog): string {
        const context = log.context as (Dictionary & { getName?: () => string }) | null;
        return context?.getName?.() ?? '';
    }
}
