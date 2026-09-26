import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Milestone } from './milestone.model';
import { MilestoneState, MILESTONE_STATES } from './milestone-state.enum';
import { nx } from '@models/_core/nx-bridge';
import { MODAL } from '@models/_core/modal-registry';
import { firstValueFrom } from 'rxjs';

export function getMilestoneActions(self: Milestone): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.common.edit:edit`,
            doubleClick: true,
            group: false,
            action: () => nx().openModal(MODAL.editMilestone, self, self.project),
        },
        {
            title: $localize`:@@i18n.common.setState:set state`,
            group: true,
            children: () =>
                Object.values(MilestoneState)
                    .filter((v) => typeof v === 'number')
                    .map((state) => ({
                        title: MILESTONE_STATES[state as MilestoneState].name,
                        group: true,
                        type: state === MilestoneState.DONE ? NxActionType.Destructive : undefined,
                        action: () => self.setState(state as MilestoneState),
                    })),
        },
        {
            title: $localize`:@@i18n.tasks.assignTo:assign to...`,
            group: true,
            on: () => {
                const ctx = nx().context;
                return (ctx instanceof Milestone && !!ctx.project && ctx.project.assignedUsers().length > 0) || false;
            },
            children: () => self.getAssignmentActions(),
        },
        {
            title: $localize`:@@i18n.milestone.setDuration:set duration`,
            group: false,
            on: () => !self.invoice_items || self.invoice_items.length === 0,
            action: () => {
                const initialValue = self.workload_hours?.toString() || '';
                return nx()
                    .promptInput($localize`:@@i18n.milestone.workloadHours:workload (hours)`, false, $localize`:@@i18n.milestone.setDurationInfo:Enter the estimated workload in hours for this milestone`, initialValue)
                    .then((result) => {
                        const hours = parseFloat(result?.text ?? '');
                        if (isNaN(hours) || hours < 0) return undefined;
                        return firstValueFrom(self.update({ workload_hours: hours }));
                    })
                    .catch(() => undefined);
            },
        },
        {
            title: $localize`:@@i18n.common.delete:delete`,
            group: false,
            action: () => self.delete(),
        },
    ];
}
