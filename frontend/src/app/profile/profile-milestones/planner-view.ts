import { signal } from '@angular/core';
import { storageGet, storageSet } from '@constants/storage';
import { Milestone } from '@models/milestone/milestone.model';
import { Project } from '@models/project/project.model';
import { GanttRow } from '@app/projects/_shards/custom-gantt/custom-gantt.component';

export type PlannerView = 'calendar' | 'gantt';

const VIEW_STORAGE_KEY = 'profileMilestonesView';

export function plannerView() {
    const view = signal<PlannerView>(storageGet<string>(VIEW_STORAGE_KEY, 'calendar') === 'gantt' ? 'gantt' : 'calendar');
    const toggle = () => {
        const next = view() === 'calendar' ? 'gantt' : 'calendar';
        view.set(next);
        storageSet(VIEW_STORAGE_KEY, next);
    };
    return { view: view.asReadonly(), toggle };
}

export const toGanttRows = (groups: { project: Project; milestones: Milestone[] }[]): GanttRow[] =>
    groups
        .filter((g) => g.milestones.length)
        .flatMap((g) => [{ type: 'header' as const, data: g.project, project: g.project }, ...g.milestones.map((m) => ({ type: 'milestone' as const, data: m, project: g.project }))]);
