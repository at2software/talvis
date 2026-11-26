import { Route } from '@angular/router';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { InvoiceItemStage } from '@enums/invoice-item.stage';
import { Project } from '@models/project/project.model';
import { ProjectState } from '@models/project/project-state.model';
import { PROJECTS_ROUTES } from './projects.routes';

const STARTED = { id: 2, name: 'started', progress: ProjectState.ProgressRunning };
const HYPER_CARE = { id: ProjectState.HyperCare, name: 'hyper care', progress: ProjectState.ProgressRunning };

interface NavData { title: string; visibleWhen?: (context: unknown) => boolean }

const invoicingTabs = (): Route[] => {
    const detail = PROJECTS_ROUTES.find((_) => _.path === ':id')!;
    const invoicing = detail.children!.find((_) => _.path === 'invoicing')!;
    return invoicing.children!.filter((_) => _.data?.['nav']);
};
const visibleTabs = (project: Project | undefined): string[] =>
    invoicingTabs()
        .filter((route) => {
            const nav = route.data!['nav'] as NavData;
            return !nav.visibleWhen || nav.visibleWhen(project);
        })
        .map((_) => _.path!);

const item = (stage: InvoiceItemStage, type = InvoiceItemType.Default, json: Record<string, unknown> = {}) => ({ id: Math.random(), text: 'x', type, stage, ...json });
const project = (json: Record<string, unknown>) => Project.fromJson({ id: '1', name: 'TALVIS', is_time_based: 0, invoice_items: [], ...json });

describe('project invoicing tabs', () => {
    it('labels the support stage as recurring and keeps its route', () => {
        const recurring = invoicingTabs().find((_) => _.path === 'support')!;
        expect((recurring.data!['nav'] as NavData).title).toBe('recurring');
    });

    it('shows only quote and recurring in hyper care without open items', () => {
        expect(visibleTabs(project({ state: HYPER_CARE }))).toEqual(['quote', 'support']);
    });

    it('shows the final invoice in hyper care while stage 0 items are open', () => {
        expect(visibleTabs(project({ state: HYPER_CARE, invoice_items: [item(InvoiceItemStage.Final)] }))).toEqual(['quote', 'support', 'final']);
    });

    it('shows the down payment in hyper care while stage 2 items are open', () => {
        expect(visibleTabs(project({ state: HYPER_CARE, invoice_items: [item(InvoiceItemStage.Downpayment)] }))).toEqual(['quote', 'downpayment', 'support']);
    });

    it('does not count invoiced items or subscription seeders as open', () => {
        const items = [item(InvoiceItemStage.Final, InvoiceItemType.Default, { invoice_id: 3 }), item(InvoiceItemStage.Final, InvoiceItemType.Monthly)];
        expect(visibleTabs(project({ state: HYPER_CARE, invoice_items: items }))).toEqual(['quote', 'support']);
    });

    it('keeps all tabs for time based projects outside hyper care', () => {
        expect(visibleTabs(project({ state: STARTED, is_time_based: 1 }))).toEqual(['quote', 'downpayment', 'support', 'final']);
    });

    it('hides recurring for fixed price projects without subscriptions or recurring items', () => {
        expect(visibleTabs(project({ state: STARTED }))).toEqual(['quote', 'downpayment', 'final']);
    });

    it('shows recurring for projects with subscriptions or open recurring items', () => {
        expect(visibleTabs(project({ state: STARTED, invoice_items: [item(InvoiceItemStage.Final, InvoiceItemType.Monthly)] }))).toContain('support');
        expect(visibleTabs(project({ state: STARTED, invoice_items: [item(InvoiceItemStage.Support)] }))).toContain('support');
    });

    it('falls back to the counters of the project payload', () => {
        const withoutItems = (json: Record<string, unknown>) => {
            const p = project({ state: HYPER_CARE, ...json });
            p.invoice_items = undefined as unknown as Project['invoice_items'];
            return p;
        };
        expect(visibleTabs(withoutItems({ open_items_by_stage: [1, 0, 0] }))).toEqual(['quote', 'support', 'final']);
        expect(visibleTabs(withoutItems({ open_items_by_stage: { 0: 0, 1: 0, 2: 3 } }))).toEqual(['quote', 'downpayment', 'support']);

        const fixedPrice = project({ state: STARTED, repeating_items_count: 1 });
        fixedPrice.invoice_items = undefined as unknown as Project['invoice_items'];
        expect(visibleTabs(fixedPrice)).toContain('support');
    });

    it('detects hyper care by the state id', () => {
        expect(project({ state: HYPER_CARE }).isInHyperCare()).toBe(true);
        expect(project({ state: { ...HYPER_CARE, id: '9' } }).isInHyperCare()).toBe(true);
        expect(project({ state: STARTED }).isInHyperCare()).toBe(false);
    });
});
