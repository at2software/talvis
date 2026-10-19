import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { UserService } from '@models/user/user.service';
import { MilestoneService } from '@models/milestone/milestone.service';
import { Milestone } from '@models/milestone/milestone.model';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalEditMilestoneComponent } from '@app/_modals/modal-edit-milestone/modal-edit-milestone.component';
import { dayjs } from '@constants/date/dates';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-planned-today',
    templateUrl: './widget-planned-today.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [...WIDGET_SHARED, SpinnerComponent],
})
export class WidgetPlannedTodayComponent extends BaseWidgetComponent {
    #userService = inject(UserService);
    #milestoneService = inject(MilestoneService);
    #modalService = inject(ModalBaseService);

    defaultOptions = () => ({});

    readonly #userId = () => this.global.user!.id;
    readonly #today = dayjs().format('YYYY-MM-DD');
    readonly #workload = this.optionsResource(() => this.#userService.showDailyWorkload(this.#userId(), this.#today, this.#today));
    readonly #milestones = this.optionsResource(() => this.#milestoneService.indexUserMilestones(this.#userId()));

    readonly day = computed(() => this.#workload.value()?.daily_workload[0]);
    readonly planned = computed(() => {
        const hours = new Map((this.day()?.elements ?? []).filter((e) => e.type === 'milestone').map((e) => [String(e.id), e.hours]));
        return (this.#milestones.value() ?? [])
            .flatMap((g) => g.milestones.map((m) => ((m.project ??= g.project), m)))
            .filter((m) => hours.has(String(m.id)))
            .map((milestone) => ({ milestone, hours: hours.get(String(milestone.id))! }))
            .sort((a, b) => b.hours - a.hours);
    });
    readonly plannedHours = computed(() => this.planned().reduce((sum, p) => sum + p.hours, 0));
    readonly loaded = computed(() => (this.#workload.hasValue() && this.#milestones.hasValue()) || this.#workload.status() === 'error' || this.#milestones.status() === 'error');

    onEdit(milestone: Milestone): void {
        this.#modalService.open(ModalEditMilestoneComponent, milestone, milestone.project).then(() => this.reload());
    }
}
