import { Routes } from '@angular/router';
import { PermissionsGuard } from '@guards/permissions.guard';
import { onlySeedAdmin, redirectSeedAdminToSetup } from '@guards/setup.guard';
import { VacationDetailsComponent } from './profile/vacation-details/vacation-details.component';
import { VacationGuardComponent } from './profile/vacation-details/vacation-guard.component';
import { LoginComponent } from './app/login/login.component';
import { Environment404Component } from './app/environment404/environment404.component';
import { AuthenticationService } from '@models/auth.service';
import { handleChunkError, isChunkError } from '@constants/ChunkErrorHandler';

const moduleLoadError = (error: unknown) => {
    if (isChunkError(error)) handleChunkError(error);
    else console.error('lazy load error', error);
    return Promise.reject(error);
};

export const routes = (): Routes => [
    { path: 'login', component: LoginComponent },
    { path: 'environment404', component: Environment404Component },
    {
        title: 'TALVIS',
        path: 'setup',
        canActivate: [AuthenticationService.getAuthGuard(), onlySeedAdmin],
        loadComponent: () => import('./app/setup/setup.component').then((m) => m.SetupComponent),
    },
    {
        path: '',
        canActivate: [AuthenticationService.getAuthGuard()],
        canActivateChild: [redirectSeedAdminToSetup],
        children: [
            {
                title: 'Dashboard',
                path: 'dashboard',
                loadComponent: () => import('@dashboard/dashboard.component').then((m) => m.DashboardComponent),
            },
            {
                title: 'Dashboard',
                path: 'dashboard/:dashboard',
                loadComponent: () => import('@dashboard/dashboard.component').then((m) => m.DashboardComponent),
            },
            {
                path: 'customers',
                canActivate: [PermissionsGuard],
                data: { roles: 'user' },
                loadChildren: () => import('./customers/customers.routes').then((m) => m.CUSTOMERS_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                path: 'marketing',
                canActivate: [PermissionsGuard],
                data: { roles: 'marketing' },
                loadChildren: () => import('./marketing/marketing.routes').then((m) => m.MARKETING_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                path: 'hr',
                canActivate: [PermissionsGuard],
                data: { roles: 'hr|project_manager' },
                loadChildren: () => import('./hr/hr.routes').then((m) => m.HR_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                path: 'projects',
                canActivate: [PermissionsGuard],
                data: { roles: 'user' },
                loadChildren: () => import('./projects/projects.routes').then((m) => m.PROJECTS_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                title: $localize`:@@i18n.common.financial:financial`,
                path: 'financial',
                canActivate: [PermissionsGuard],
                data: { roles: 'invoicing|financial' },
                loadChildren: () => import('./invoices/invoices.routes').then((m) => m.FINANCIAL_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                path: 'products',
                canActivate: [PermissionsGuard],
                data: { roles: 'product_manager' },
                loadChildren: () => import('./products/products.routes').then((m) => m.PRODUCTS_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                title: $localize`:@@i18n.common.documents:documents`,
                path: 'documents',
                loadChildren: () => import('./documents/documents.routes').then((m) => m.DOCUMENTS_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                title: $localize`:@@i18n.common.profile:profile`,
                path: 'profile',
                loadChildren: () => import('./profile/profile.routes').then((m) => m.PROFILE_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                title: $localize`:@@i18n.common.settings:settings`,
                path: 'settings',
                canActivate: [PermissionsGuard],
                data: { roles: 'admin' },
                loadChildren: () => import('./settings/settings.routes').then((m) => m.SETTINGS_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                title: $localize`:@@i18n.common.calendar:calendar`,
                path: 'calendar',
                canActivate: [PermissionsGuard],
                data: { roles: 'user' },
                loadChildren: () => import('./calendar/calendar.routes').then((m) => m.CALENDAR_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                path: 'flow',
                canActivate: [PermissionsGuard],
                data: { roles: 'user' },
                loadChildren: () => import('./flow/flow.routes').then((m) => m.FLOW_ROUTES).catch((err) => moduleLoadError(err)),
            },
            {
                title: $localize`:@@i18n.common.vacationRequest:vacation request`,
                path: 'vacation/:id',
                component: VacationDetailsComponent,
                canActivate: [VacationGuardComponent],
            },
            {
                path: '**',
                redirectTo: 'dashboard',
            },
        ],
    },
];
