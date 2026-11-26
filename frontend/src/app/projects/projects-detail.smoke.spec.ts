import type { Type } from '@angular/core';
import { provideDetailGuard, renderComponent } from '@testing/component-test';
import { Project } from '@models/project/project.model';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { ProjectInvoicingComponent } from '@app/projects/id/project-invoicing/project-invoicing.component';
import { ProjectMilestonesComponent } from '@app/projects/id/project-milestones/project-milestones.component';
import { ProjectPlanningComponent } from '@app/projects/id/project-planning/project-planning.component';
import { ProjectDetailTasksComponent } from '@app/projects/id/tasks/project-detail-tasks.component';
import { ProjectState } from '@models/project/project-state.model';
import { TInvoicing } from '@models/project/invoicing-type';

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

describe('project invoicing in hyper care', () => {
    const hyperCare = { ...project, state: { id: String(ProjectState.HyperCare), name: 'hyper care', progress: 1 } };

    it('renders the recurring tab with the subscriptions card above the support card', () => {
        const fixture = renderComponent(ProjectInvoicingComponent, {
            providers: [provideDetailGuard(ProjectDetailGuard, () => Project.fromJson(hyperCare))],
            tables: { projects: ['name'] },
            setup: (component) => component.invoicingType.set(TInvoicing.SupportInvoice),
        });
        const el = fixture.nativeElement as HTMLElement;

        expect(el.querySelector('project-subscriptions-card')).toBeTruthy();
        expect(Project.fromJson(hyperCare).showsRecurringInvoicing()).toBe(true);
        expect(Project.fromJson(hyperCare).showsFinalInvoicing()).toBe(false);
        expect(Project.fromJson(hyperCare).showsDownpaymentInvoicing()).toBe(false);
    });
});
