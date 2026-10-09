import { Routes } from '@angular/router';
import { Project } from '@models/project/project.model';
import { ProjectDetailGuard } from './project-details.guard';

export const PROJECTS_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('./-/projects-nav.component').then((m) => m.ProjectsNavComponent),
        children: [
            { path: '', loadComponent: () => import('./-/projects-dashboard/projects-dashboard.component').then((m) => m.ProjectsDashboardComponent), data: { nav: { title: $localize`:@@i18n.common.projects:projects` } } },
            { path: 'stats', loadComponent: () => import('./-/projects-stats/projects-stats.component').then((m) => m.ProjectsStatsComponent), data: { nav: { title: $localize`:@@i18n.common.statistics:statistics`, roles: 'admin' } } },
            { path: 'reporting', loadComponent: () => import('./-/projects-reporting/projects-reporting.component').then((m) => m.ProjectsReportingComponent), data: { nav: { title: $localize`:@@i18n.projects.reporting:reporting`, roles: 'invoicing' } } },
            { path: 'milestones', loadComponent: () => import('./-/projects-milestones/projects-milestones.component').then((m) => m.ProjectsMilestonesOverviewComponent), data: { nav: { title: $localize`:@@i18n.common.milestones:milestones` } } },
            { path: 'debriefing', loadComponent: () => import('./-/projects-debriefing/projects-debriefing.component').then((m) => m.ProjectsDebriefingComponent), data: { nav: { title: $localize`:@@i18n.debrief.title:debriefing` } } },
            {
                path: 'monitoring',
                data: { nav: { title: $localize`:@@i18n.projects.monitoring:monitoring`, exact: false } },
                children: [
                    { path: '', pathMatch: 'full', redirectTo: 'frameworks' },
                    { path: 'frameworks', loadComponent: () => import('./-/projects-frameworks/projects-frameworks.component').then((m) => m.ProjectsFrameworksComponent), data: { nav: { title: $localize`:@@i18n.projects.frameworks:frameworks` } } },
                    { path: 'uptime', loadComponent: () => import('./-/projects-uptime/projects-uptime.component').then((m) => m.ProjectsUptimeComponent), data: { nav: { title: $localize`:@@i18n.uptime.uptimeMonitoring:uptime monitoring` } } },
                    { path: 'audit', loadComponent: () => import('./-/projects-audit/projects-audit.component').then((m) => m.ProjectsAuditComponent), data: { nav: { title: $localize`:@@i18n.projects.audit:audit` } } },
                ],
            },
        ],
    },
    {
        path: ':id',
        loadComponent: () => import('./id/project-detail.component').then((m) => m.ProjectDetailComponent),
        ...ProjectDetailGuard.routeActivators(),
        children: [
            {
                path: '',
                loadComponent: () => import('./id/project-dashboard/project-dashboard.component').then((m) => m.ProjectDashboardComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.dashboard:dashboard`,
                    },
                },
            },
            {
                path: 'support',
                loadComponent: () => import('./id/project-support/project-support-container.component').then((m) => m.ProjectSupportContainerComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.support:support`,
                        roles: 'financial|project_manager|invoicing',
                        visibleWhen: (project: Project) => project?.is_time_based,
                    },
                },
            },
            {
                path: 'invoicing',
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.invoicing:invoicing`,
                        roles: 'financial|project_manager|invoicing',
                        exact: false,
                    },
                },
                children: [
                    { path: '', pathMatch: 'full', redirectTo: 'quote' },
                    {
                        path: 'quote',
                        loadComponent: () => import('./id/project-invoicing/project-invoicing.component').then((m) => m.ProjectInvoicingComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.invoicing.quote:quote`,
                            },
                        },
                    },
                    {
                        path: 'downpayment',
                        loadComponent: () => import('./id/project-invoicing/project-invoicing.component').then((m) => m.ProjectInvoicingComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.invoicing.downPayment:down payment`,
                            },
                        },
                    },
                    {
                        path: 'support',
                        loadComponent: () => import('./id/project-invoicing/project-invoicing.component').then((m) => m.ProjectInvoicingComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.invoicing.support:support`,
                            },
                        },
                    },
                    {
                        path: 'final',
                        loadComponent: () => import('./id/project-invoicing/project-invoicing.component').then((m) => m.ProjectInvoicingComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.invoicing.final:final invoice`,
                            },
                        },
                    },
                ],
            },
            {
                path: 'time-tracking',
                loadComponent: () => import('./id/timetracking/timetracking-project.component').then((m) => m.TimetrackingProjectComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.timeTracking:time tracking`,
                    },
                },
            },
            {
                path: 'milestones',
                loadComponent: () => import('./id/project-milestones/project-milestones.component').then((m) => m.ProjectMilestonesComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.milestones:milestones`,
                    },
                },
            },
            {
                path: 'tasks',
                loadComponent: () => import('./id/tasks/project-detail-tasks.component').then((m) => m.ProjectDetailTasksComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.tasks:tasks`,
                    },
                },
            },
            {
                path: 'budget',
                loadComponent: () => import('./id/project-planning/project-planning.component').then((m) => m.ProjectPlanningComponent),
                data: {
                    target: 'qty',
                    nav: {
                        title: $localize`:@@i18n.common.budget:budget`,
                        visibleWhen: (project: Project) => !project?.is_time_based && !project?.state?.isPrepared(),
                    },
                },
            },
            {
                path: 'flow',
                loadComponent: () => import('./id/project-flow/project-flow.component').then((m) => m.ProjectFlowComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.flow.tab:flow`,
                    },
                },
            },
            {
                path: 'debriefing',
                loadComponent: () => import('./id/project-debriefing/project-debriefing.component').then((m) => m.ProjectDebriefingComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.debrief.title:debriefing`,
                        visibleWhen: (project: Project) => project?.state.isFinishedAny(),
                    },
                },
            },
            {
                path: 'settings',
                loadComponent: () => import('./id/settings/project-detail-settings.component').then((m) => m.ProjectDetailSettingsComponent),
                data: {
                    nav: {
                        title: $localize`:@@i18n.common.settings:settings`,
                        roles: 'admin',
                        exact: false,
                    },
                },
                children: [
                    {
                        path: 'general',
                        loadComponent: () => import('./id/settings/project-detail-settings-general/project-detail-settings-general.component').then((m) => m.ProjectDetailSettingsGeneralComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.settings.general:general`,
                            },
                        },
                    },
                    {
                        path: 'participants',
                        loadComponent: () => import('./id/settings/project-detail-settings-participants/project-detail-settings-participants.component').then((m) => m.ProjectDetailSettingsParticipantsComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.settings.participants:participants`,
                            },
                        },
                    },
                    {
                        path: 'plugin-links',
                        loadComponent: () => import('./id/settings/project-detail-settings-plugin-links/project-detail-settings-plugin-links.component').then((m) => m.ProjectDetailSettingsPluginLinksComponent),
                        data: {
                            nav: {
                                title: $localize`:@@i18n.settings.pluginLinks:plugin links`,
                            },
                        },
                    },
                    { path: '**', redirectTo: 'general' },
                ],
            },
            {
                path: 'planning',
                loadComponent: () => import('./id/project-planning/project-planning.component').then((m) => m.ProjectPlanningComponent),
                data: { target: 'my_prediction' },
            },
            { path: 'quote', redirectTo: 'invoicing/quote' },
            {
                path: 'media',
                loadComponent: () => import('./id/project-media/project-media.component').then((m) => m.ProjectMediaComponent),
            },
            {
                path: '**',
                redirectTo: '',
            },
        ],
    },
    { path: '**', redirectTo: '' },
];
