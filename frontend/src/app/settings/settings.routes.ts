import { Routes } from '@angular/router';
import { PermissionsGuard } from '@guards/permissions.guard';

export const SETTINGS_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('./settings-nav.component').then((m) => m.SettingsNavComponent),
        children: [
            {
                path: 'invoices',
                loadComponent: () => import('./invoices/settings-invoices.component').then((m) => m.SettingsInvoicesComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'invoicing', fallback: ['settings'] },
                title: $localize`:@@i18n.settings.invoiceSettings:invoice settings`,
            },
            {
                path: 'projects',
                loadComponent: () => import('./settings-projects/settings-projects.component').then((m) => m.SettingsProjectsComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'project_manager', fallback: ['settings'] },
                children: [
                    { path: 'general', loadComponent: () => import('./settings-projects/settings-projects-notifications/settings-projects-notifications.component').then((m) => m.SettingsProjectsNotificationsComponent) },
                    { path: 'quote', loadComponent: () => import('./settings-projects/settings-projects-quote/settings-projects-quote.component').then((m) => m.SettingsProjectsQuoteComponent) },
                    { path: 'payment-plans', loadComponent: () => import('./settings-projects/settings-projects-payment-plans/settings-projects-payment-plans.component').then((m) => m.SettingsProjectsPaymentPlansComponent) },
                    { path: 'leads', loadComponent: () => import('./settings-projects/settings-projects-leads/settings-projects-leads.component').then((m) => m.SettingsProjectsLeadsComponent) },
                    { path: 'milestones', loadComponent: () => import('./settings-projects/settings-projects-milestones/settings-projects-milestones.component').then((m) => m.SettingsProjectsMilestonesComponent) },
                    { path: 'states', loadComponent: () => import('./settings-projects/settings-projects-states/settings-projects-states.component').then((m) => m.SettingsProjectsStatesComponent) },
                    { path: '**', redirectTo: 'quote' },
                ],
                title: $localize`:@@i18n.settings.projectSettings:project settings`,
            },
            {
                path: 'vault',
                loadComponent: () => import('./settings-connectors/settings-connectors.component').then((m) => m.SettingsConnectorsComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'admin', fallback: ['settings'] },
            },
            {
                path: 'pdf',
                loadComponent: () => import('./pdf/settings-pdf.component').then((m) => m.SettingsPdfComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'admin', fallback: ['settings'] },
                title: $localize`:@@i18n.settings.pdf.title:PDF template`,
            },
            {
                path: 'commands',
                loadComponent: () => import('./commands/settings-commands.component').then((m) => m.SettingsCommandsComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'admin', fallback: ['settings'] },
                title: $localize`:@@i18n.settings.commands:commands`,
            },
            {
                path: 'deletion-log',
                loadComponent: () => import('./deletion-log/settings-deletion-log.component').then((m) => m.SettingsDeletionLogComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'admin', fallback: ['settings'] },
                title: $localize`:@@i18n.settings.deletionLog:deletion log`,
            },
            {
                path: 'roles',
                loadComponent: () => import('./roles/roles.component').then((m) => m.UsersComponent),
                canActivate: [PermissionsGuard],
                data: { roles: 'admin', fallback: ['settings'] },
                title: $localize`:@@i18n.common.users:users`,
            },
            {
                path: '',
                loadComponent: () => import('./general/settings-general.component').then((m) => m.SettingsGeneralComponent),
                title: $localize`:@@i18n.settings.generalSettings:general settings`,
            },
            { path: '**', redirectTo: '' },
        ],
    },
    { path: '**', redirectTo: '' },
];
