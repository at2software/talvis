export enum MilestoneState {
    TODO = 0,
    IN_PROGRESS = 1,
    DONE = 2,
}

export const MILESTONE_STATES: Record<number, { name: string; color: string; bgClass: string; textClass: string }> = {
    [MilestoneState.TODO]: {
        name: $localize`:@@i18n.milestone.toDo:To Do`,
        color: 'var(--color-grey)',
        bgClass: 'bg-grey',
        textClass: 'text-muted',
    },
    [MilestoneState.IN_PROGRESS]: {
        name: $localize`:@@i18n.milestone.inProgress:In Progress`,
        color: 'var(--bs-primary)',
        bgClass: 'bg-primary',
        textClass: 'text-primary',
    },
    [MilestoneState.DONE]: {
        name: $localize`:@@i18n.milestone.done:Done`,
        color: 'var(--bs-success)',
        bgClass: 'bg-success',
        textClass: 'text-success',
    },
};

export function getMilestoneStateInfo(state: MilestoneState | number | null | undefined) {
    let stateValue: MilestoneState;

    if (typeof state === 'number') {
        stateValue = state as MilestoneState;
    } else if (state !== null && state !== undefined) {
        stateValue = state;
    } else {
        stateValue = MilestoneState.TODO;
    }
    return MILESTONE_STATES[stateValue] || MILESTONE_STATES[MilestoneState.TODO];
}
