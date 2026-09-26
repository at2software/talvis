import type { Type } from '@angular/core';
import { renderComponent } from '@testing/component-test';
import { TabAttentionComponent } from '@app/_activity/tab-attention/tab-attention.component';
import { TabTasksHrComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-hr/tab-tasks-hr.component';
import { TabTasksInvoiceableComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-invoiceable/tab-tasks-invoiceable.component';
import { TabTasksMarketingActivitiesComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-marketing-activities/tab-tasks-marketing-activities.component';
import { TabTasksMilestonesComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-milestones/tab-tasks-milestones.component';
import { TabTasksMissingGitComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-missing-git/tab-tasks-missing-git.component';
import { TabTasksRemarketingComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-remarketing/tab-tasks-remarketing.component';
import { TabTasksSentinelsComponent } from '@app/_activity/tab-tasks/_shards/tab-tasks-sentinels/tab-tasks-sentinels.component';

const components: [string, Type<unknown>][] = [
    ['TabAttentionComponent', TabAttentionComponent],
    ['TabTasksHrComponent', TabTasksHrComponent],
    ['TabTasksInvoiceableComponent', TabTasksInvoiceableComponent],
    ['TabTasksMarketingActivitiesComponent', TabTasksMarketingActivitiesComponent],
    ['TabTasksMilestonesComponent', TabTasksMilestonesComponent],
    ['TabTasksMissingGitComponent', TabTasksMissingGitComponent],
    ['TabTasksRemarketingComponent', TabTasksRemarketingComponent],
    ['TabTasksSentinelsComponent', TabTasksSentinelsComponent],
];

// Every component here loads through the Resource API. Nothing resolves under the testing
// HTTP backend, so this asserts only that the loading state renders without throwing.
describe('activity renders', () => {
    it.each(components)('%s', (_name, component) => {
        expect(renderComponent(component).nativeElement).toBeTruthy();
    });
});
