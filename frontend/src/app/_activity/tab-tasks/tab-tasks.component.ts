import { ActivityTabComponent } from '@activity/activity-tab.component';
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { TabTasksHrComponent } from './_shards/tab-tasks-hr/tab-tasks-hr.component';
import { TabTasksSentinelsComponent } from './_shards/tab-tasks-sentinels/tab-tasks-sentinels.component';
import { TabTasksRemarketingComponent } from './_shards/tab-tasks-remarketing/tab-tasks-remarketing.component';
import { TabTasksMilestonesComponent } from './_shards/tab-tasks-milestones/tab-tasks-milestones.component';
import { TabTasksPluginTasksComponent } from './_shards/tab-tasks-plugin-tasks/tab-tasks-plugin-tasks.component';
import { TabTasksMissingGitComponent } from './_shards/tab-tasks-missing-git/tab-tasks-missing-git.component';
import { TabTasksMarketingActivitiesComponent } from './_shards/tab-tasks-marketing-activities/tab-tasks-marketing-activities.component';
import { GlobalService } from '@models/global.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'activity-tab-tasks',
    templateUrl: './tab-tasks.component.html',
    imports: [ActivityTabComponent, ScrollbarComponent, TabTasksHrComponent, TabTasksSentinelsComponent, TabTasksRemarketingComponent, TabTasksMilestonesComponent, TabTasksMissingGitComponent, TabTasksMarketingActivitiesComponent, TabTasksPluginTasksComponent],
})
export class TabTasksComponent {
    readonly tabComponent = viewChild.required(ActivityTabComponent);
    readonly #global = inject(GlobalService);
    readonly #counts = new Map<string, number>();
    readonly user = toSignal(this.#global.init.pipe(map(() => this.#global.user)));

    onCount(key: string, n: number) {
        this.#counts.set(key, n);
        const total = Array.from(this.#counts.values()).reduce((a, b) => a + b, 0);
        this.tabComponent().badge.set(total > 0 ? '!' : undefined);
    }
}
