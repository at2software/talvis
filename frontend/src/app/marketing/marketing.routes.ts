import { Routes } from '@angular/router';

export const MARKETING_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('./marketing.component').then((m) => m.MarketingComponent),
        children: [
            { path: 'dashboard', loadComponent: () => import('./marketing-dashboard/marketing-dashboard.component').then((m) => m.MarketingDashboardComponent) },
            {
                path: 'initiatives',
                loadComponent: () => import('./marketing-initiatives/marketing-initiatives.component').then((m) => m.MarketingInitiativesComponent),
                children: [
                    {
                        path: ':id',
                        loadComponent: () => import('./marketing-initiatives/marketing-initiative-detail/marketing-initiative-detail.component').then((m) => m.MarketingInitiativeDetailComponent),
                        children: [
                            { path: 'activity/:activityId', loadComponent: () => import('./shared/activity-detail/marketing-activity-detail.component').then((m) => m.MarketingActivityDetailComponent), data: { mode: 'initiative' } },
                        ],
                    },
                ],
            },
            { path: 'outreach', loadComponent: () => import('./marketing-outreach/marketing-outreach.component').then((m) => m.MarketingOutreachComponent) },
            { path: 'metrics', loadComponent: () => import('./marketing-metrics/marketing-metrics.component').then((m) => m.MarketingMetricsComponent) },
            {
                path: 'prospects',
                loadComponent: () => import('./marketing-prospects/marketing-prospects.component').then((m) => m.MarketingProspectsComponent),
                children: [{ path: ':id', loadComponent: () => import('./marketing-prospects/marketing-prospect-detail/marketing-prospect-detail.component').then((m) => m.MarketingProspectDetailComponent) }],
            },
            {
                path: 'workflows',
                loadComponent: () => import('./marketing-workflows/marketing-workflows.component').then((m) => m.MarketingWorkflowsComponent),
                children: [{
                    path: ':id',
                    loadComponent: () => import('./marketing-workflows/marketing-workflow-detail/marketing-workflow-detail.component').then((m) => m.MarketingWorkflowDetailComponent),
                    children: [
                        { path: 'activity/:activityId', loadComponent: () => import('./shared/activity-detail/marketing-activity-detail.component').then((m) => m.MarketingActivityDetailComponent), data: { mode: 'workflow' } },
                    ],
                }],
            },
            { path: 'assets', loadComponent: () => import('./marketing-assets/marketing-assets.component').then((m) => m.MarketingAssetsComponent) },
            { path: 'assets/:category', loadComponent: () => import('./marketing-assets/marketing-assets.component').then((m) => m.MarketingAssetsComponent) },
            { path: 'campaigns', loadComponent: () => import('./marketing-campaigns/marketing-campaigns.component').then((m) => m.MarketingCampaignsComponent) },
            { path: 'email', loadComponent: () => import('./marketing-email/marketing-email.component').then((m) => m.MarketingEmailComponent) },
            { path: 'lead-segmentation', loadComponent: () => import('./marketing-lead-segmentation/marketing-lead-segmentation.component').then((m) => m.MarketingLeadSegmentationComponent) },
            { path: 'social-media', loadComponent: () => import('./marketing-social-media/marketing-social-media.component').then((m) => m.MarketingSocialMediaComponent) },
            { path: 'remarketing', loadComponent: () => import('./marketing-remarketing/marketing-remarketing.component').then((m) => m.MarketingRemarketingComponent) },
            { path: '**', redirectTo: 'dashboard' },
        ],
    },
];
