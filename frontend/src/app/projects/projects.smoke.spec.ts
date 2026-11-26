import type { Type } from '@angular/core';
import { renderComponent } from '@testing/component-test';
import { ProjectsAuditComponent } from '@app/projects/-/projects-audit/projects-audit.component';
import { ProjectsDebriefingComponent } from '@app/projects/-/projects-debriefing/projects-debriefing.component';
import { ProjectsFrameworksComponent } from '@app/projects/-/projects-frameworks/projects-frameworks.component';
import { ProjectsMilestonesOverviewComponent } from '@app/projects/-/projects-milestones/projects-milestones.component';
import { ProjectsReportingComponent } from '@app/projects/-/projects-reporting/projects-reporting.component';
import { ProjectsStatsComponent } from '@app/projects/-/projects-stats/projects-stats.component';
import { ProjectsUptimeComponent } from '@app/projects/-/projects-uptime/projects-uptime.component';
import { ProjectDashboardComponent } from '@app/projects/id/project-dashboard/project-dashboard.component';
import { ProjectDebriefingComponent } from '@app/projects/id/project-debriefing/project-debriefing.component';
import { ProjectDetailSettingsParticipantsComponent } from '@app/projects/id/settings/project-detail-settings-participants/project-detail-settings-participants.component';

const components: [string, Type<unknown>][] = [
    ['ProjectsAuditComponent', ProjectsAuditComponent],
    ['ProjectsDebriefingComponent', ProjectsDebriefingComponent],
    ['ProjectsFrameworksComponent', ProjectsFrameworksComponent],
    ['ProjectsMilestonesOverviewComponent', ProjectsMilestonesOverviewComponent],
    ['ProjectsReportingComponent', ProjectsReportingComponent],
    ['ProjectsStatsComponent', ProjectsStatsComponent],
    ['ProjectsUptimeComponent', ProjectsUptimeComponent],
    ['ProjectDashboardComponent', ProjectDashboardComponent],
    ['ProjectDebriefingComponent', ProjectDebriefingComponent],
    ['ProjectDetailSettingsParticipantsComponent', ProjectDetailSettingsParticipantsComponent],
];

// Every component here loads through the Resource API. Nothing resolves under the testing
// HTTP backend, so this asserts only that the loading state renders without throwing.
describe('projects renders', () => {
    it.each(components)('%s', (_name, component) => {
        expect(renderComponent(component).nativeElement).toBeTruthy();
    });
});
