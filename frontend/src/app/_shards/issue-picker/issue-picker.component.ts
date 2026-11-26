import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, Subject, switchMap, take, timeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NComponent } from '@shards/n/n.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { Task } from '@models/task/task.model';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { modelResource } from '@models/http/model-resource';

export interface IssuePickerTracker {
    link: PluginLink;
    instance: PluginInstance & ITaskPlugin;
}

const CONNECT_TIMEOUT_MS = 15000;
const PAGE_SIZE = 30;
const SCROLL_THRESHOLD_PX = 80;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'issue-picker',
    templateUrl: './issue-picker.component.html',
    imports: [FormsModule, NComponent, SpinnerComponent, NgbDropdownModule, NgbTooltipModule],
})
export class IssuePickerComponent {
    #factory = inject(PluginInstanceFactory);
    #projectService = inject(ProjectService);

    projectId = input<string | undefined>(undefined);
    selectedLinkId = model<string>('');
    selectedIssueId = model<string>('');

    issueSelected = output<Task>();

    trackers = signal<IssuePickerTracker[]>([]);
    activeLinkId = signal<string>('');

    entries = signal<Task[]>([]);
    page = signal<number>(0);
    hasMore = signal<boolean>(true);
    loading = signal<boolean>(false);
    loadingMore = signal<boolean>(false);

    searchTerm = signal<string>('');
    hideCompleted = signal<boolean>(false);

    searchResults = signal<Task[] | undefined>(undefined);
    searching = signal<boolean>(false);
    #searchSubject = new Subject<string>();

    readonly activeTracker = computed(() => this.trackers().find((_) => String(_.link.id) === this.activeLinkId()));
    readonly filteredIssues = computed(() => {
        const term = this.searchTerm().toLowerCase().trim();
        const hideCompleted = this.hideCompleted();
        const passesState = (_: Task) => !hideCompleted || !_.isClosed();
        const passesTerm = (_: Task) => !term || _.name.toLowerCase().includes(term) || _.id.includes(term);

        const searchMatches = (this.searchResults() ?? []).filter(passesState);
        if (!term) return this.entries().filter(passesState);

        const localMatches = this.entries().filter((_) => passesState(_) && passesTerm(_));
        const seen = new Set(searchMatches.map((_) => _.id));
        return [...searchMatches, ...localMatches.filter((_) => !seen.has(_.id))];
    });

    readonly #project = modelResource(
        () => this.projectId(),
        (id) => this.#projectService.show(id),
    );

    constructor() {
        effect(() => {
            const project = this.#project.value();
            if (project) untracked(() => this.#initFromProject(project));
        });

        this.#searchSubject
            .pipe(
                debounceTime(300),
                distinctUntilChanged(),
                switchMap((term) => {
                    const tracker = this.activeTracker();
                    if (!term || !tracker?.instance.searchIssues) {
                        this.searching.set(false);
                        return of(undefined);
                    }
                    this.searching.set(true);
                    return tracker.instance.searchIssues(term).pipe(catchError(() => of([] as Task[])));
                }),
                takeUntilDestroyed(),
            )
            .subscribe((tasks) => {
                this.searching.set(false);
                this.searchResults.set(tasks);
            });
    }

    onSearchTermChange(value: string): void {
        this.searchTerm.set(value);
        this.#searchSubject.next(value.trim());
    }

    #initFromProject(project: Project): void {
        const trackers = (project.plugin_links ?? [])
            .map((link) => ({ link, instance: this.#factory.instanceFor(link) as (PluginInstance & ITaskPlugin) | undefined }))
            .filter((_): _ is IssuePickerTracker => !!_.instance && 'ITaskPluginProperty' in _.instance);
        this.trackers.set(trackers);
        const preferred = trackers.find((_) => String(_.link.id) === this.selectedLinkId()) ?? trackers[0];
        if (preferred) this.setActiveTracker(String(preferred.link.id));
    }

    setActiveTracker(linkId: string): void {
        this.activeLinkId.set(linkId);
        this.searchTerm.set('');
        this.searchResults.set(undefined);
        this.searching.set(false);
        this.#reload();
    }

    onHideCompletedChange(value: boolean): void {
        this.hideCompleted.set(value);
        this.#reload();
    }

    onScroll(event: Event): void {
        const el = event.target as HTMLElement;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX) this.#loadMore();
    }

    selectIssue(task: Task): void {
        this.selectedLinkId.set(this.activeLinkId());
        this.selectedIssueId.set(task.id);
        this.issueSelected.emit(task);
    }
    isSelected = (task: Task): boolean => this.activeLinkId() === this.selectedLinkId() && task.id === this.selectedIssueId();


    #reload(): void {
        this.entries.set([]);
        this.page.set(0);
        this.hasMore.set(true);
        this.loading.set(true);
        this.#loadMore(true);
    }

    #loadMore(isFirstLoad = false): void {
        const tracker = this.activeTracker();
        if (!tracker || !tracker.instance.canConnect() || !this.hasMore() || this.loadingMore()) {
            if (isFirstLoad) this.loading.set(false);
            return;
        }
        const nextPage = this.page() + 1;
        this.loadingMore.set(true);
        tracker.instance.init
            .pipe(
                take(1),
                timeout(CONNECT_TIMEOUT_MS),
                switchMap(() => tracker.instance.indexTasksPage(nextPage, PAGE_SIZE, this.hideCompleted())),
                catchError(() => of({ tasks: [] as Task[], hasMore: false })),
            )
            .subscribe((res) => {
                this.entries.update((e) => [...e, ...res.tasks]);
                this.page.set(nextPage);
                this.hasMore.set(res.hasMore);
                this.loadingMore.set(false);
                this.loading.set(false);
            });
    }
}
