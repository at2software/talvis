import type { Type } from '@angular/core';
import { renderComponent } from '@testing/component-test';
import { MarketingAssetsComponent } from '@app/marketing/marketing-assets/marketing-assets.component';
import { MarketingOutreachComponent } from '@app/marketing/marketing-outreach/marketing-outreach.component';
import { MarketingDashboardComponent } from '@app/marketing/marketing-dashboard/marketing-dashboard.component';
import { MarketingInitiativeDetailComponent } from '@app/marketing/marketing-initiatives/marketing-initiative-detail/marketing-initiative-detail.component';
import { MarketingInitiativesComponent } from '@app/marketing/marketing-initiatives/marketing-initiatives.component';
import { MarketingMetricsComponent } from '@app/marketing/marketing-metrics/marketing-metrics.component';
import { MarketingProspectDetailComponent } from '@app/marketing/marketing-prospects/marketing-prospect-detail/marketing-prospect-detail.component';
import { MarketingProspectsComponent } from '@app/marketing/marketing-prospects/marketing-prospects.component';
import { MarketingRemarketingComponent } from '@app/marketing/marketing-remarketing/marketing-remarketing.component';
import { MarketingWorkflowDetailComponent } from '@app/marketing/marketing-workflows/marketing-workflow-detail/marketing-workflow-detail.component';
import { MarketingWorkflowsComponent } from '@app/marketing/marketing-workflows/marketing-workflows.component';
import { MarketingActivityDetailComponent } from '@app/marketing/shared/activity-detail/marketing-activity-detail.component';
import { TouchpointFormComponent } from '@app/marketing/shared/touchpoint-form/touchpoint-form.component';

const components: [string, Type<unknown>][] = [
    ['MarketingAssetsComponent', MarketingAssetsComponent],
    ['MarketingOutreachComponent', MarketingOutreachComponent],
    ['MarketingDashboardComponent', MarketingDashboardComponent],
    ['MarketingInitiativeDetailComponent', MarketingInitiativeDetailComponent],
    ['MarketingInitiativesComponent', MarketingInitiativesComponent],
    ['MarketingMetricsComponent', MarketingMetricsComponent],
    ['MarketingProspectDetailComponent', MarketingProspectDetailComponent],
    ['MarketingProspectsComponent', MarketingProspectsComponent],
    ['MarketingRemarketingComponent', MarketingRemarketingComponent],
    ['MarketingWorkflowDetailComponent', MarketingWorkflowDetailComponent],
    ['MarketingWorkflowsComponent', MarketingWorkflowsComponent],
    ['MarketingActivityDetailComponent', MarketingActivityDetailComponent],
    ['TouchpointFormComponent', TouchpointFormComponent],
];

// Every component here loads through the Resource API. Nothing resolves under the testing
// HTTP backend, so this asserts only that the loading state renders without throwing.
describe('marketing renders', () => {
    it.each(components)('%s', (_name, component) => {
        expect(renderComponent(component).nativeElement).toBeTruthy();
    });
});
