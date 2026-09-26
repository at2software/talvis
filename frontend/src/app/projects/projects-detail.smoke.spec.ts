import type { Type } from '@angular/core';
import { provideDetailGuard, renderComponent } from '@testing/component-test';
import { Project } from '@models/project/project.model';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { ProjectInvoicingComponent } from '@app/projects/id/project-invoicing/project-invoicing.component';
import { ProjectMilestonesComponent } from '@app/projects/id/project-milestones/project-milestones.component';
import { ProjectPlanningComponent } from '@app/projects/id/project-planning/project-planning.component';
import { ProjectDetailTasksComponent } from '@app/projects/id/tasks/project-detail-tasks.component';

const components: [string, Type<unknown>][] = [
    ['ProjectInvoicingComponent', ProjectInvoicingComponent],
    ['ProjectMilestonesComponent', ProjectMilestonesComponent],
    ['ProjectPlanningComponent', ProjectPlanningComponent],
    ['ProjectDetailTasksComponent', ProjectDetailTasksComponent],
];

// Relations these pages read while rendering. The backend eager-loads them on the detail
// endpoint, so they are never absent behind the guard.
const project = {
    id: '1',
    name: 'TALVIS',
    assignees: [],
    invoice_items: [],
    plugin_links: [],
    company: { id: '3', name: 'ACME', address: 'Somewhere 1', employees: [], assignees: [] },
    state: { id: '2', name: 'running', progress: 1 },
};

// These live behind ProjectDetailGuard and read `object()` while rendering, so the guard has
// to already hold a project -- in the app that happens during navigation.
describe('project detail pages render', () => {
    it.each(components)('%s', (_name, component) => {
        const fixture = renderComponent(component, {
            providers: [provideDetailGuard(ProjectDetailGuard, () => Project.fromJson(project))],
            tables: { projects: ['name'] },
        });
        expect(fixture.nativeElement).toBeTruthy();
    });
});
