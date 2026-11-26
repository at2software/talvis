import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { catchError, of, switchMap, take } from 'rxjs';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { NComponent } from '@shards/n/n.component';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { MantisPlugin } from '@models/http/plugins/plugin.mantis';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { Task } from '@models/task/task.model';

export interface ExtIssueImportTracker {
    link: PluginLink;
    instance: PluginInstance & ITaskPlugin;
}

const PAGE_SIZE = 100;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-import-ext-issues',
    templateUrl: './modal-import-ext-issues.component.html',
    imports: [SpinnerComponent, NComponent],
})
export class ModalImportExtIssuesComponent extends ModalBaseComponent<Task[]> {
    tracker!: ExtIssueImportTracker;
    #existingIssueIds = new Set<string>();

    loading = signal(true);
    allTasks = signal<Task[]>([]);
    selectedLabels = signal<Set<string>>(new Set());
    selectedIds = signal<Set<string>>(new Set());

    readonly #obsoleteVersionNames = computed(() => {
        const instance = this.tracker.instance;
        return instance instanceof MantisPlugin ? new Set(instance.versions.filter((_) => _.obsolete).map((_) => _.name)) : new Set<string>();
    });
    readonly availableLabels = computed(() => {
        const obsolete = this.#obsoleteVersionNames();
        return Array.from(new Set(this.allTasks().flatMap((_) => _.labels))).filter((_) => !obsolete.has(_)).sort();
    });
    readonly #unresolvedTasks = computed(() => this.allTasks().filter((_) => !_.isClosed()));
    readonly importableTasks = computed(() => this.#unresolvedTasks().filter((_) => !this.#existingIssueIds.has(_.id)));
    readonly skippedCount = computed(() => this.#unresolvedTasks().length - this.importableTasks().length);
    readonly filteredTasks = computed(() => {
        const labels = this.selectedLabels();
        const tasks = this.importableTasks();
        return labels.size === 0 ? tasks : tasks.filter((_) => _.labels.some((l) => labels.has(l)));
    });
    readonly allFilteredSelected = computed(() => this.filteredTasks().length > 0 && this.filteredTasks().every((_) => this.selectedIds().has(_.id)));
    readonly canSubmit = computed(() => this.selectedIds().size > 0);

    init(tracker: ExtIssueImportTracker, existingIssueIds: Set<string>): void {
        this.tracker = tracker;
        this.#existingIssueIds = existingIssueIds;
        this.#loadPage(1);
    }

    toggleLabel(label: string): void {
        this.selectedLabels.update((set) => {
            const next = new Set(set);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    }

    toggleSelected(task: Task): void {
        this.selectedIds.update((set) => {
            const next = new Set(set);
            if (next.has(task.id)) next.delete(task.id);
            else next.add(task.id);
            return next;
        });
    }
    isSelected = (task: Task): boolean => this.selectedIds().has(task.id);

    toggleSelectAll(): void {
        const deselect = this.allFilteredSelected();
        this.selectedIds.update((set) => {
            const next = new Set(set);
            this.filteredTasks().forEach((_) => (deselect ? next.delete(_.id) : next.add(_.id)));
            return next;
        });
    }

    onSuccess(): Task[] {
        const ids = this.selectedIds();
        return this.allTasks().filter((_) => ids.has(_.id));
    }

    #loadPage(page: number): void {
        this.tracker.instance.init
            .pipe(
                take(1),
                switchMap(() => this.tracker.instance.indexTasksPage(page, PAGE_SIZE, true, false)),
                catchError(() => of({ tasks: [] as Task[], hasMore: false })),
            )
            .subscribe((res) => {
                this.allTasks.update((arr) => [...arr, ...res.tasks]);
                if (res.hasMore) this.#loadPage(page + 1);
                else this.loading.set(false);
            });
    }
}
