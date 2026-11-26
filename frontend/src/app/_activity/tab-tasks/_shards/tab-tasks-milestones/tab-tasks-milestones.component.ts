import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { MilestoneState } from '@models/milestone/milestone-state.enum';
import { MilestoneService } from '@models/milestone/milestone.service';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TabTasksBaseComponent } from '../tab-tasks-base.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'tab-tasks-milestones',
    templateUrl: './tab-tasks-milestones.component.html',
    imports: [NgTemplateOutlet, Nx, NComponent, AvatarComponent, NgbTooltipModule],
})
export class TabTasksMilestonesComponent extends TabTasksBaseComponent {
    #milestoneService = inject(MilestoneService);

    #userMilestones = modelListResource(this.ready, () => this.#milestoneService.indexUserMilestones(this.global.user?.id || ''));
    #pmMilestones = modelResource(this.ready, () => this.#milestoneService.indexPmMilestones(this.global.user?.id || ''));

    #ownMilestones = computed(() => this.#userMilestones.value().flatMap((group) => group.milestones.map((m) => Object.assign(m, { project: group.project }))));
    #pmMilestonesOfOthers = computed(() =>
        (this.#pmMilestones.value()?.milestones ?? [])
            .flatMap((group) => group.milestones.map((m) => Object.assign(m, { project: group.project })))
            .filter((m) => m.user_id !== this.global.user?.id),
    );
    #pmMilestonesAssigned = computed(() => this.#pmMilestonesOfOthers().filter((m) => m.user_id !== null));

    milestonesOverdue = computed(() => [...this.#ownMilestones().filter((m) => m.isOverdue()), ...this.#pmMilestonesAssigned().filter((m) => m.isOverdue())]);
    milestonesNeedStarting = computed(() => [
        ...this.#ownMilestones().filter((m) => !m.isOverdue() && m.needsStart()),
        ...this.#pmMilestonesAssigned().filter((m) => !m.isOverdue() && m.needsStart()),
    ]);
    milestonesRunning = computed(() => this.#ownMilestones().filter((m) => !m.isOverdue() && !m.needsStart() && m.state === MilestoneState.IN_PROGRESS));
    milestonesNeedAssignment = computed(() => this.#pmMilestonesOfOthers().filter((m) => m.user_id === null));
    milestonesNoDuration = computed(() => this.#ownMilestones().filter((m) => m.lacksDuration()));
    projectsNoCoverage = computed(() => this.#pmMilestones.value()?.projectsNoCoverage ?? []);

    constructor() {
        super();
        effect(() => this.countChanged.emit(this.milestonesOverdue().length));
    }

    override reload() {
        this.#userMilestones.reload();
        this.#pmMilestones.reload();
    }
}
