import { Dictionary } from '@constants/constants';
import { Type } from '@angular/core';
import { WidgetProjectAcquisitionsComponent } from './widgets/widget-project-acquisitions/widget-project-acquisitions.component';
import { WidgetProjectRunningComponent } from './widgets/widget-project-running/widget-project-running.component';
import { WidgetProjectTimebasedComponent } from './widgets/widget-project-timebased/widget-project-timebased.component';
import { WidgetPreparedInvoicesComponent } from './widgets/widget-prepared-invoices/widget-prepared-invoices.component';
import { WidgetUnpaidInvoicesComponent } from './widgets/widget-unpaid-invoices/widget-unpaid-invoices.component';
import { WidgetCashflowComponent } from './widgets/widget-cashflow/widget-cashflow.component';
import { WidgetRevenue12Component } from './widgets/widget-revenue-12/widget-revenue-12.component';
import { WidgetProjectSuccessComponent } from './widgets/widget-project-success/widget-project-success.component';
import { WidgetExtComponent } from './widgets/widget-ext/widget-ext.component';
import { NxStatic } from '@app/nx/nx.static';
import { WidgetJubileesComponent } from './widgets/widget-jubilees/widget-jubilees.component';
import { WidgetTimeBasedEmploymentComponent } from './widgets/widget-time-based-employment/widget-time-based-employment.component';
import { WidgetCustomerSupportComponent } from './widgets/widget-customer-support/widget-customer-support.component';
import { WidgetRevenueCurrentYearComponent } from './widgets/widget-revenue-current-year/widget-revenue-current-year.component';
import { WidgetMyWorkingTimeComponent } from './widgets/widget-my-working-time/widget-my-working-time.component';
import { WidgetHrTeamComponent } from './widgets/widget-hr-team/widget-hr-team.component';
import { WidgetRevenueMonthlyComponent } from './widgets/widget-revenue-monthly/widget-revenue-monthly.component';
import { WidgetLinearRegressionForecastComponent } from './widgets/widget-linear-regression-forecast/widget-linear-regression-forecast.component';
import { WidgetMissingProjectManagerComponent } from './widgets/widget-missing-project-manager/widget-missing-project-manager.component';
import { WidgetProjectManagerComponent } from './widgets/widget-project-manager/widget-project-manager.component';
import { WidgetInvoiceManagerComponent } from './widgets/widget-invoice-manager/widget-invoice-manager.component';
import { WidgetUptimeMonitorsComponent } from './widgets/widget-uptime-monitors/widget-uptime-monitors.component';
import { WidgetProjectAnalysisComponent } from './widgets/widget-project-analysis/widget-project-analysis.component';
import { WidgetCustomerChurnComponent } from './widgets/widget-customer-churn/widget-customer-churn.component';
import { WidgetOverrunRiskComponent } from './widgets/widget-overrun-risk/widget-overrun-risk.component';
import { WidgetPlannedTodayComponent } from './widgets/widget-planned-today/widget-planned-today.component';

export interface TWidget {
    widget: Type<unknown>;
    i18n: string;
    on?: () => boolean;
    key?: string;
}
export interface TAWidget {
    widget: Type<unknown>;
    i18n: string;
    on?: () => boolean;
    key: string;
}

const hasRole = (roles: string): boolean => {
    return NxStatic.global.user?.hasAnyRole(roles.split('|')) ?? false;
};

const ALL_WIDGETS: Dictionary<TWidget> = {
    'widget-customer-support'          : { widget: WidgetCustomerSupportComponent, i18n: $localize`:@@i18n.common.customerSupport:customer support`, on: () => hasRole('project_manager') },
    'widget-hr-team'                   : { widget: WidgetHrTeamComponent, i18n: $localize`:@@i18n.widget-hr-team:team status` },
    'widget-my-working-time'           : { widget: WidgetMyWorkingTimeComponent, i18n: $localize`:@@i18n.widget-my-working-time:my working time` },
    'widget-planned-today'             : { widget: WidgetPlannedTodayComponent, i18n: $localize`:@@i18n.widget-planned-today:planned for today` },
    'widget-missing-project-manager'   : { widget: WidgetMissingProjectManagerComponent, i18n: $localize`:@@i18n.project.missingProjectManager:missing project manager`, on: () => hasRole('project_manager') },
    'widget-project-acquisitions'      : { widget: WidgetProjectAcquisitionsComponent, i18n: $localize`:@@i18n.common.acquisitions:acquisitions`, on: () => hasRole('project_manager') },
    'widget-project-manager'           : { widget: WidgetProjectManagerComponent, i18n: $localize`:@@i18n.common.projectManager:project manager`, on: () => hasRole('project_manager') },
    'widget-project-analysis'          : { widget: WidgetProjectAnalysisComponent, i18n: $localize`:@@i18n.widget-project-analysis:project analysis`, on: () => hasRole('project_manager') },
    'widget-project-running'           : { widget: WidgetProjectRunningComponent, i18n: $localize`:@@i18n.widget-project-running:running projects`, on: () => hasRole('project_manager') },
    'widget-project-timebased'         : { widget: WidgetProjectTimebasedComponent, i18n: $localize`:@@i18n.common.timeBasedProjects:time based projects`, on: () => hasRole('project_manager') },
    'widget-prepared-invoices'         : { widget: WidgetPreparedInvoicesComponent, i18n: $localize`:@@i18n.common.preparedInvoices:prepared invoices`, on: () => hasRole('financial') },
    'widget-invoice-manager'           : { widget: WidgetInvoiceManagerComponent, i18n: $localize`:@@i18n.widget-invoice-manager:invoice manager`, on: () => hasRole('financial') },
    'widget-unpaid-invoices'           : { widget: WidgetUnpaidInvoicesComponent, i18n: $localize`:@@i18n.invoice.unpaidInvoices:unpaid invoices`, on: () => hasRole('financial') },
    'widget-cashflow'                  : { widget: WidgetCashflowComponent, i18n: $localize`:@@i18n.common.cashFlow:cash flow`, on: () => hasRole('financial') },
    'widget-revenue-12'                : { widget: WidgetRevenue12Component, i18n: $localize`:@@i18n.common.revenue:revenue`, on: () => hasRole('financial') },
    'widget-revenue-current-year'      : { widget: WidgetRevenueCurrentYearComponent, i18n: $localize`:@@i18n.invoice.revenueCurrentYear:revenue current year`, on: () => hasRole('financial') },
    'widget-revenue-monthly'           : { widget: WidgetRevenueMonthlyComponent, i18n: $localize`:@@i18n.widget-revenue-monthly:monthly revenue`, on: () => hasRole('financial') },
    'widget-project-success'           : { widget: WidgetProjectSuccessComponent, i18n: $localize`:@@i18n.widget-project-success:project success`, on: () => hasRole('financial') },
    'widget-ext'                       : { widget: WidgetExtComponent, i18n: $localize`:@@i18n.widget-ext:external widget` },
    'widget-jubilees'                  : { widget: WidgetJubileesComponent, i18n: $localize`:@@i18n.common.jubilees:jubilees`, on: () => hasRole('hr|project_manager') },
    'widget-time-based-employees'      : { widget: WidgetTimeBasedEmploymentComponent, i18n: $localize`:@@i18n.widget-time-based-employees:time-based employees`, on: () => hasRole('hr') },
    'widget-linear-regression-forecast': { widget: WidgetLinearRegressionForecastComponent, i18n: $localize`:@@i18n.widget-linear-regression-forecast:linear regression forecast`, on: () => hasRole('financial') },
    'widget-uptime-monitors'           : { widget: WidgetUptimeMonitorsComponent, i18n: $localize`:@@i18n.uptime.uptimeMonitoring:uptime monitoring`, on: () => hasRole('project_manager') },
    'widget-customer-churn'            : { widget: WidgetCustomerChurnComponent, i18n: $localize`:@@i18n.widget-customer-churn:customer churn`, on: () => hasRole('project_manager|marketing') },
    'widget-overrun-risk'              : { widget: WidgetOverrunRiskComponent, i18n: $localize`:@@i18n.widget-overrun-risk:overrun risk`, on: () => hasRole('project_manager') },
};
export const ALL_WIDGETS_ASYNC = () => ALL_WIDGETS;
export const ALL_WIDGET_COMPONENTS = () => Object.values(ALL_WIDGETS).map((_) => _.widget);
export const ALL_WIDGETS_ARRAY = (): TAWidget[] => Object.keys(ALL_WIDGETS).map((_) => Object.assign(ALL_WIDGETS[_], { key: _ }));

export class WidgetFactory {
    static availableWidgets = () => {
        return Object.values(ALL_WIDGETS_ARRAY()).filter((_) => {
            const widget = ALL_WIDGETS[_.key];
            return widget.on ? widget.on() : true;
        });
    };

    static componentFor = (_: string): Type<unknown> | null => (_ in ALL_WIDGETS ? ALL_WIDGETS[_].widget : null);

    static hasWidgetAccess = (_: string): boolean => {
        const widget = ALL_WIDGETS[_];
        if (!widget) return false;
        return widget.on ? widget.on() : true;
    };

    static allComponents = Object.values(ALL_WIDGETS).map((_) => _.widget);
}
