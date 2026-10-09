import { Serializable } from '@models/_core/serializable';
import { nx } from '@models/_core/nx-bridge';
import { Project } from './project.model';
import { deepMerge } from '@constants/object/deepMerge';
import { Model } from '@constants/model/type-discriminators';
import { Dictionary } from '@constants/constants';
import { computed } from '@angular/core';
import type { FlowTransitionDto } from '@models/_core/api-response';

const mkState = (id: number) => ({ state: ProjectState.stateFor(id) });

export class ProjectAvatar {
    static Prepared = (args: Dictionary = {}) => Project.fromJson(deepMerge({ var: { filter: ProjectState.idsFor(0) }, ...mkState(1) }, args));
    static Running = (args: Dictionary = {}) => Project.fromJson(deepMerge({ var: { filter: ProjectState.idsFor(1) }, ...mkState(2) }, args));
    static Successful = (args: Dictionary = {}) => Project.fromJson(deepMerge({ var: { filter: ProjectState.idsSuccessful() }, ...mkState(3) }, args));
    static Failed = (args: Dictionary = {}) => Project.fromJson(deepMerge({ var: { filter: ProjectState.idsFailed() }, ...mkState(4) }, args));
    static Ignored = (args: Dictionary = {}) => Project.fromJson(deepMerge({ var: { filter: ProjectState.idsIgnored() }, ...mkState(5) }, args));
    static BudgetBased = (args: Dictionary = {}) => this.Running({ is_time_based: 0, ...args });
    static TimeBased = (args: Dictionary = {}) => this.Running({ is_time_based: 1, ...args });
    static Internal = (args: Dictionary = {}) => this.Running({ is_internal: 1, ...args });
    static External = (args: Dictionary = {}) => this.Running({ is_internal: 0, ...args });
}

@Model('ProjectState')
export class ProjectState extends Serializable {

    static API_PATH = (): string => 'project_states';

    static ProgressPrepared = 0;
    static ProgressRunning = 1;
    static ProgressFinished = 2;

    static StateChangeWorkflow: Dictionary<string[]> = {
        '1': ["2", "5", "6", "7"],
        '2': ["1", "3", "4", "5", "8", "9"],
        '3': ["1"],
        '4': ["1"],
        '5': ["1"],
        '6': ["1", "2", "5", "7"],
        '7': ["1"],
        '8': ["1", "3", "4", "5", "9"],
        '9': ["1", "3", "4", "5"],
    };
    static transitions: FlowTransitionDto[] | undefined;

    static allowedTargetIds = (fromId: string | number, user?: { hasAnyRole: (roles: string[]) => boolean }): string[] =>
        ProjectState.transitions
            ? ProjectState.transitions
                  .filter((_) => _.from_state_id == fromId && (!_.required_role || !!user?.hasAnyRole([_.required_role])))
                  .map((_) => '' + _.to_state_id)
            : (ProjectState.StateChangeWorkflow['' + fromId] ?? []);

    name: string = '';
    progress: 0 | 1 | 2 = 0;
    color: string = '';
    is_in_stats: boolean = false;
    is_successful: boolean = false;
    pivot: { created_at: string } = { created_at: '' };

    isPrepared           = computed(() => { this.snapshot(); return this.progress === ProjectState.ProgressPrepared; });
    isRunning            = computed(() => { this.snapshot(); return this.progress === ProjectState.ProgressRunning; });
    isFinishedAny        = computed(() => { this.snapshot(); return this.progress === ProjectState.ProgressFinished; });
    isFinishedSuccessful = computed(() => { this.snapshot(); return this.isFinishedAny() && this.is_in_stats && this.is_successful; });
    isFinishedFailed     = computed(() => { this.snapshot(); return this.isFinishedAny() && this.is_in_stats && !this.is_successful; });
    isFinishedIgnored    = computed(() => { this.snapshot(); return this.isFinishedAny() && !this.is_in_stats; });

    isQuoteAcceptanceFrom = (current: ProjectState) => current.isPrepared() && this.isRunning();

    static stateFor      = (id: number): ProjectState | undefined => nx().global.project_states.find((_) => _.id == '' + id);
    static _idsFor       = (cmp: (s: ProjectState) => boolean) => nx().global.project_states.filter(cmp).map((_) => _.id).join(',');
    static idsFor        = (progress: number) => ProjectState._idsFor((s) => s.progress === progress);
    static idsPrepared   = computed(() => ProjectState._idsFor((s) => s.isPrepared()));
    static idsRunning    = computed(() => ProjectState._idsFor((s) => s.isRunning()));
    static idsSuccessful = computed(() => ProjectState._idsFor((s) => s.isFinishedSuccessful()));
    static idsFailed     = computed(() => ProjectState._idsFor((s) => s.isFinishedFailed()));
    static idsIgnored    = computed(() => ProjectState._idsFor((s) => s.isFinishedIgnored()));
    static idsPreparedOrRunning = computed(() => [ProjectState.idsPrepared(), ProjectState.idsRunning()].filter(Boolean).join(','));

    getStateIcon(): string {
        switch (this.progress) {
            case 0:
                return 'lightbulb'; // Prepared
            case 1:
                return 'play_arrow'; // Running
            case 2:
                return 'check_circle'; // Finished
            default:
                return 'circle';
        }
    }
}
