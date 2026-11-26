import type { Injector, Type } from '@angular/core';
import type { Routes } from '@angular/router';
import type { Project } from '@models/project/project.model';

export interface ExtensionNavigationItem {
    logo: string;
    tooltip: string;
    link: string;
    roles: string;
}

export interface ExtensionSettingsLink {
    link: string;
    label: string;
    roles?: string;
}

export interface TalvisExtension {
    routes?: Routes;
    projectRoutes?: Routes;
    projectSettingsRoutes?: Routes;
    projectSettingsLinks?: ExtensionSettingsLink[];
    navigation?: ExtensionNavigationItem[];
    models?: Record<string, unknown>;
    bearerUrls?: () => string[];
    projectDashboardCards?: (() => Promise<Type<unknown>>)[];
    requiredProjectRoles?: (project: Project) => string[];
    onEnvironmentLoaded?: (injector: Injector) => void;
}
