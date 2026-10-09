import { Routes } from '@angular/router';

export const FLOW_ROUTES: Routes = [
    { path: 'approvals', title: $localize`:@@i18n.flow.openApprovals:open approvals`, loadComponent: () => import('./approvals/flow-approvals.component').then((m) => m.FlowApprovalsComponent) },
    { path: '**', redirectTo: 'approvals' },
];
