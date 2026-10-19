import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { modelResource } from '@models/http/model-resource';
import { Assignee, I18N_REMOVE_FROM_TEAM } from '@models/assignee/assignee.model';
import { Project } from '@models/project/project.model';
import { User } from '@models/user/user.model';
import { UserService } from '@models/user/user.service';
import { dayjs, Dayjs } from '@constants/date/dates';
import { ActionEmitterType } from '@app/nx/nx.directive';
import { Color } from '@constants/Color';
import { ProjectState } from '@models/project/project-state.model';
import { GlobalService } from '@models/global.service';
import { Company } from '@models/company/company.model';
import { REFLECTION } from '@constants/constants';
import { NgTemplateOutlet } from '@angular/common';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ProjectComponent } from '@shards/project/project.component';
import { FormsModule } from '@angular/forms';
import { PermissionsDirective } from '@directives/permissions.directive';
import { IHasFoci } from '@models/focus/has-foci.interface';
import { RouterModule } from '@angular/router';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { map, Observable } from 'rxjs';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

interface TLABEL {
    label: string;
    percent: number;
}

interface TWeekly {
    type: string;
    id: string;
    link?: string;
}
type TBlock = TWeekly & { name: string; left: number; width: number; days: number };
interface TData {
    user: User;
    hpw: number;
    remaining_hpw: number;
    subscriptions: IHasFoci[];
    weekly_ids: TWeekly[];
    timeline_planned: TBlock[];
    timeline_leaves: TBlock[];
}

const D_START = dayjs().startOf('day');
const D_END = D_START.add(60, 'days').endOf('day');

const linkFor = (_: TWeekly) => (_.type === 'Project' ? `/projects/${_.id}` : _.type === 'Company' ? `/customers/${_.id}` : undefined);

const ensureFunction = (obj: object, key: string) => {
    const record = obj as Record<string, unknown>;
    if (typeof record[key] !== 'function') {
        const value = record[key];
        record[key] = () => value;
    }
};

const hydrate = (response: TData | undefined): TData | undefined => {
    if (!response?.subscriptions) return response;
    response.user = User.fromJson(response.user);
    response.subscriptions = response.subscriptions.map((x) => {
        const r = REFLECTION(x) as IHasFoci;
        ensureFunction(r, 'getName');
        ensureFunction(r, 'hasTimeBudget');
        ensureFunction(r, 'is');
        return r;
    });
    response.timeline_planned.forEach((_) => (_.link = linkFor(_)));
    return response;
};

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'hr-workload',
    templateUrl: './hr-workload.component.html',
    styleUrls: ['./hr-workload.component.scss'],
    imports: [ValueUnitComponent, NgTemplateOutlet, NgbTooltipModule, Nx, AvatarComponent, ProjectComponent, FormsModule, PermissionsDirective, RouterModule, EmptyStateComponent],
})
export class HrWorkloadComponent {
    user = input.required<User>();
    title = input<string>();
    onlyChart = input<boolean>();
    chartHeight = input<number>(100);

    #global = inject(GlobalService);
    #userService = inject(UserService);

    readonly #load = modelResource(
        () => this.user().id,
        (userId) => this.#userService.showProjectLoad(userId).pipe(map((_) => hydrate(_ as TData | undefined))) as Observable<TData | undefined>,
    );
    readonly isError = computed(() => !!this.#load.error());
    readonly data = computed<TData | null>(() => this.#load.value()?.subscriptions ? (this.#load.value() as TData) : null);
    readonly #canSetWeeklyCache = computed(() => new Map((this.data()?.subscriptions ?? []).map((sub) => [this.trackBySubscription(0, sub), this.canSetWeekly(sub)])));

    readonly monthLabels: TLABEL[] = [0, 1, 2].map((i) => {
        const month = D_START.add(i, 'months').startOf('month').add(1, 'month');
        return { label: month.format('MMM'), percent: month.diff(D_START, 'seconds') / D_END.diff(D_START, 'seconds') };
    });

    filterIcons = {
        prepared: Project.fromJson({ state: ProjectState.stateFor(0) }),
        running: Project.fromJson({ state: ProjectState.stateFor(1) }),
        internal: Project.fromJson({ state: ProjectState.stateFor(1), is_internal: true }),
    };

    reload = () => this.#load.reload();

    onContextMenuAction($event: ActionEmitterType, _: IHasFoci) {
        if ($event.action.title === I18N_REMOVE_FROM_TEAM) {
            this.user()?.active_projects.remove(_);
        }
    }

    updateAssignment = (_: Assignee) => {
        _.update().subscribe();
    };

    offsetFor = (date: Dayjs) => date.diff(D_START, 'seconds') / D_END.diff(D_START, 'seconds');
    isProject = (_: IHasFoci) => _ instanceof Project;
    asProject = (_: IHasFoci) => (_ instanceof Project ? _ : undefined);
    markerFor = (assignee: Assignee) => {
        const diff = Math.abs(assignee.hours_weekly - assignee.avg_hpd * 5);
        if (diff < 0.5) return undefined;
        if (diff < 1) return 'yellow';
        if (diff < 1.5) return 'orange';
        return 'red';
    };
    markerClassFor = (assignee: Assignee) => {
        const marker = this.markerFor(assignee);
        if (!marker) return '';
        return `marker marker-${marker}`;
    };
    canSetWeekly = (_: IHasFoci): boolean => {
        if (_ instanceof Project) {
            if (_.company_id == this.#global.me_id) return true;
            return !!_.is_time_based;
        }
        const ofCompany = _.assert(Company);
        if (ofCompany) return ofCompany.id == this.#global.me_id;
        return false;
    };
    getWeekly = () => this.data()?.weekly_ids.map((_) => this.getSubscriptionFor(_)) ?? [];
    getSubscriptionFor = (_: TWeekly) => this.data()!.subscriptions.find((x) => x.class == _.type && x.id == '' + _.id)!;
    colorFor = (_: TBlock) => this.colorForSub(this.getSubscriptionFor(_));
    colorForSub = (sub: IHasFoci) => {
        if (sub instanceof Project) return sub.color();
        if (sub instanceof Company) {
            if (sub.id == this.#global.me_id) return Color.fromVar('dark');
            return Color.uniqueColorFromString(sub.getName());
        }
        return '';
    };
    stripesForSub = (sub: IHasFoci) => {
        if (sub instanceof Project && sub.company_id == this.#global.me_id) return true;
        if (sub instanceof Company && sub.id == this.#global.me_id) return true;
        return false;
    };

    trackBySubscription = (_index: number, item: IHasFoci) => `${item.class}-${item.id}`;

    canSetWeeklyCached = (item: IHasFoci) => this.#canSetWeeklyCache().get(this.trackBySubscription(0, item)) ?? false;
}
