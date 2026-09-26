import { Page } from '@models/http/http.talvis';
import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { Observable } from 'rxjs';
import { Dictionary, filtered, span, StartEnd } from '@constants/constants';
import { DATESPAN_RANGE } from '@constants/date/dateSpanRange';
import { Project } from '@models/project/project.model';
import { GlobalService } from '@models/global.service';
import { ProjectService } from '@models/project/project.service';
import { getCookie, setCookie } from '@constants/cookies';
import { ProjectStateFilterComponent } from '@app/projects/_shards/project-state-filter/project-state-filter.component';
import { SortData } from '@app/app/table-controls/sort-data';
import { SortMode } from '@app/app/table-controls/sort-mode';

import { ContinuousMarkerComponent } from '@shards/continuous/continuous.marker.component';
import { User } from '@models/user/user.model';
import { ProjectsTableComponent } from '@app/projects/_shards/projects-table/projects-table.component';
import { FormsModule } from '@angular/forms';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { WidgetProjectManagerComponent } from '@dashboard/widgets/widget-project-manager/widget-project-manager.component';

const COOKIE_ID = 'project/dashboard';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'projects-dashboard',
    templateUrl: './projects-dashboard.component.html',
    imports: [ProjectStateFilterComponent, ContinuousMarkerComponent, ProjectsTableComponent, FormsModule, NgxDaterangepickerMd, EmptyStateComponent, WidgetProjectManagerComponent],
})
export class ProjectsDashboardComponent {
    private readonly stateFilter = viewChild.required(ProjectStateFilterComponent);

    observer!: Observable<Page<Project>>;
    projects: Project[] = [];
    hasLoaded = signal(false);

    selCreated?: StartEnd = undefined;
    selStarted?: StartEnd = undefined;
    selFinished?: StartEnd = undefined;
    selUpdated?: StartEnd = undefined;

    budgetFilterActive = signal(false);

    budget_min?: number;
    selectedAssigneeId?: number = undefined;
    selectedProjectManagerId?: number = undefined;

    ranges = DATESPAN_RANGE;
    global = inject(GlobalService);
    #projectService = inject(ProjectService);
    #originalCookieData: string = '';
    #isInitialReload = false;
    sortData: SortData = {
        key: '',
        sortMode: SortMode.NONE,
    };

    constructor() {
        this.#originalCookieData = this.#cookieData();
        const cookie = getCookie(COOKIE_ID);
        if (cookie) {
            const parsed = JSON.parse(cookie) as (StartEnd | undefined)[];
            if (parsed) {
                const [, , , selCreated, selStarted, selFinished] = parsed;
                this.selCreated = StartEnd.forceObject(selCreated);
                this.selStarted = StartEnd.forceObject(selStarted);
                this.selFinished = StartEnd.forceObject(selFinished);
            }
        }
        afterNextRender(() => this.reload());
    }

    filters = (): Dictionary => {
        const filters: Dictionary = filtered({
            ...this.stateFilter().getFilters(),
            created_at: span(StartEnd.forceObject(this.selCreated)),
            started_at: span(StartEnd.forceObject(this.selStarted)),
            finished_at: span(StartEnd.forceObject(this.selFinished)),
            append: ['net'],
            paginate: true,
            with: 'assigned_users',
        });

        if (this.budgetFilterActive() && this.budget_min !== undefined) filters.budget_min = this.budget_min;
        if (this.selectedAssigneeId !== undefined) filters.assignee_id = this.selectedAssigneeId;
        if (this.selectedProjectManagerId !== undefined) filters.project_manager_id = this.selectedProjectManagerId;

        if (this.sortData.sortMode !== SortMode.NONE) {
            filters.sort_by = this.sortData.key;
            filters.sort_direction = this.sortData.sortMode === SortMode.ASCENDING ? 'asc' : 'desc';
        }
        return filters;
    };

    #cookieData = () =>
        JSON.stringify([
            [],
            [],
            [], // deprecated... now handled by stateFilter. But I want to keep the cookie compatible
            StartEnd.forceObject(this.selCreated)?.toString() ?? undefined,
            StartEnd.forceObject(this.selStarted)?.toString() ?? undefined,
            StartEnd.forceObject(this.selFinished)?.toString() ?? undefined,
        ]);

    #filters: Dictionary | undefined = undefined;
    needsFilterUpdate = (): boolean => {
        const original = JSON.stringify(this.#filters);
        this.#filters = Object.assign({}, this.filters());
        if (!original) {
            return true;
        }
        return original.localeCompare(JSON.stringify(this.#filters)) !== 0;
    };
    reloadWithCalendar(_e?: unknown) {
        this.updateCookie();
        if (this.#isInitialReload) {
            this.reload();
        }
    }
    reload() {
        const filters = this.filters();
        this.projects = [];
        this.hasLoaded.set(false);
        this.observer = this.#projectService.indexPaginated(filters);
    }
    updateCookie() {
        const cookieData = this.#cookieData();
        if (this.#originalCookieData.localeCompare(cookieData)) {
            setCookie(COOKIE_ID, cookieData, 7);
            this.#originalCookieData = cookieData;
        }
    }

    onResult = (x: Project[]) => {
        this.hasLoaded.set(true);
        this.projects = this.projects.concat(x);
        this.#isInitialReload = true;
    };
    onIconClicked = () => this.reload;

    onSortChange = (sortData: SortData) => {
        this.sortData = sortData;
        this.reload();
    };

    filtersUpdated = () => this.reload();

    showStartedAtFilter = (): boolean => this.stateFilter().filters().inProgress.var.enabled || this.stateFilter().filters().finished.var.enabled || false;

    showFinishedAtFilter = (): boolean => this.stateFilter().filters().finished.var.enabled || false;

    getProjectManagers = (): User[] => this.global.team?.filter((user) => user.hasRole('admin') || user.hasRole('project_manager')) || [];
}
