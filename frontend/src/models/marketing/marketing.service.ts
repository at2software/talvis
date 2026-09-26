import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { TalvisHttpService } from '../http/http.talvis';
import { File } from '@models/file/file.model';
import { Company } from '@models/company/company.model';
import { MarketingWorkflow } from './marketing-workflow.model';
import { MarketingActivity } from './marketing-activity.model';
import { MarketingInitiativeActivity } from './marketing-initiative-activity.model';
import { MarketingPerformanceMetric } from './marketing-performance-metrics.model';
import { MarketingInitiative } from './marketing-initiative.model';
import { MarketingProspect } from './marketing-prospect.model';
import { MarketingProspectActivity } from './marketing-prospect-activity.model';
import { map, Observable, Subject } from 'rxjs';
import { InitiativeStatsDto, MarketingDashboardStatsDto, ProspectActivityCountDto, ProspectStatsDto, RemarketingDto, SankeyDataDto } from '@models/_core/api-response';

@Service()
export class MarketingService extends TalvisHttpService<MarketingInitiative> {
    apiPath = 'marketing/initiatives';
    override readonly model = MarketingInitiative;

    readonly initiativeActivitySaved$ = new Subject<string>(); // emits initiative ID
    readonly workflowActivitySaved$ = new Subject<string>(); // emits workflow ID

    getFunnel = (filters: Dictionary = {}) => this.get<SankeyDataDto>(`marketing/funnel`, filters);
    getRemarketing = (): Observable<RemarketingDto> =>
        this.get<Dictionary>(`marketing/remarketing`).pipe(
            map((response) => {
                const companies = (key: string) => ((response[key] ?? []) as Dictionary[]).map((_) => Company.fromJson(_));
                return { due: companies('due'), observed: companies('observed'), suggested: companies('suggested') };
            }),
        );
    getRemarketingDue = () => this.aget(`marketing/remarketing/due`, {}, Company);
    getDashboardStats = () => this.get<MarketingDashboardStatsDto>(`marketing/dashboard`);

    indexInitiatives = (params?: Dictionary) => this.paginate('marketing/initiatives', params, MarketingInitiative);
    showInitiative = (id: string) => this.get(`marketing/initiatives/${id}`, {}, MarketingInitiative);
    storeInitiative = (data: Dictionary) => this.post('marketing/initiatives', data, MarketingInitiative);
    updateInitiative = (id: string, data: Dictionary) => this.put(`marketing/initiatives/${id}`, data, MarketingInitiative);
    destroyInitiative = (id: string) => this.delete(`marketing/initiatives/${id}`, {}, Object);
    indexInitiativeChannels = (id: string) => this.aget(`marketing/initiatives/${id}/channels`, {}, Object);
    updateInitiativeChannels = (id: string, channels: Dictionary[]) => this.put(`marketing/initiatives/${id}/channels`, { channels }, Object);
    assignInitiativeChannel = (initiativeId: string, leadSourceId: number, isPrimary: boolean = false) => this.post(`marketing/initiatives/${initiativeId}/channels`, { lead_source_id: leadSourceId, is_primary: isPrimary }, Object);
    removeInitiativeChannel = (initiativeId: string, leadSourceId: number) => this.delete(`marketing/initiatives/${initiativeId}/channels/${leadSourceId}`, {}, Object);
    subscribeToInitiative = (initiativeId: string, userId: string) => this.post(`marketing/initiatives/${initiativeId}/users`, { user_id: userId, role: 'member' }, Object);
    unsubscribeFromInitiative = (initiativeId: string, userId: string) => this.delete(`marketing/initiatives/${initiativeId}/users/${userId}`, {}, Object);
    showInitiativeStats = (id: string) => this.get<InitiativeStatsDto>(`marketing/initiatives/${id}/stats`);
    indexInitiativeRecentActivity = (id: string) => this.aget(`marketing/initiatives/${id}/activity`, {}, MarketingProspectActivity);
    indexInitiativesForAddon = (leadSourceId: string) => this.aget('marketing/initiatives/for-addon', { lead_source_id: leadSourceId }, MarketingInitiative);

    indexProspects = (params?: Dictionary) => this.aget('marketing/prospects', params, MarketingProspect);
    getProspectByPhone = (phone_number: string) => this.get(`marketing/prospects/by-phone`, { phone_number }, MarketingProspect);
    showProspect = (id: string) => this.get(`marketing/prospects/${id}`, {}, MarketingProspect);
    storeProspect = (data: Dictionary) => this.post('marketing/prospects', data, MarketingProspect);
    updateProspect = (id: string, data: Dictionary) => this.put(`marketing/prospects/${id}`, data, MarketingProspect);
    destroyProspect = (id: string) => this.delete(`marketing/prospects/${id}`, {}, Object);
    storeProspectFromAddon = (data: Dictionary) => this.post('marketing/prospects/from-addon', data, MarketingProspect);
    indexProspectActivitiesForAddon = (params: Dictionary) => this.aget('marketing/prospects/activities-for-addon', params, MarketingProspectActivity);
    countProspectActivitiesForAddon = (params: Dictionary = {}) => this.get<ProspectActivityCountDto>('marketing/prospects/activities-for-addon', { ...params, count_only: 1 });
    updateProspectActivityStatus = (prospectId: string, activityId: string, data: Dictionary) => this.put<MarketingProspectActivity>(`marketing/prospects/${prospectId}/activities/${activityId}/status`, data);
    showProspectStats = (params?: Dictionary) => this.get<ProspectStatsDto>('marketing/prospects/stats', params);
    linkToCompany = (prospectId: string, companyId: string) => this.post(`marketing/prospects/${prospectId}/link-to-company`, { company_id: companyId }, MarketingProspect);
    convertProspect = (prospectId: string, data: Dictionary) => this.post(`marketing/prospects/${prospectId}/convert`, data, Object);

    indexWorkflows = (params?: Dictionary) => this.aget('marketing/workflows', params, MarketingWorkflow);
    showWorkflow = (id: string) => this.get(`marketing/workflows/${id}`, {}, MarketingWorkflow);
    storeWorkflow = (data: Dictionary) => this.post('marketing/workflows', data, MarketingWorkflow);
    updateWorkflow = (id: string, data: Dictionary) => this.put(`marketing/workflows/${id}`, data, MarketingWorkflow);
    destroyWorkflow = (id: string) => this.delete(`marketing/workflows/${id}`, {}, Object);
    duplicateWorkflow = (id: string, data?: Dictionary) => this.post<MarketingWorkflow>(`marketing/workflows/${id}/duplicate`, data);
    updateWorkflowStatus = (id: string, isActive: boolean) => this.put<MarketingWorkflow>(`marketing/workflows/${id}/status`, { is_active: isActive });
    indexInitiativeWorkflows = (initiativeId: string) => this.aget(`marketing/initiatives/${initiativeId}/workflows`, {}, MarketingWorkflow);
    attachWorkflowToInitiative = (initiativeId: string, data: Dictionary) => this.post(`marketing/initiatives/${initiativeId}/workflows`, data, MarketingWorkflow);
    detachWorkflowFromInitiative = (initiativeId: string, workflowId: string) => this.delete(`marketing/initiatives/${initiativeId}/workflows/${workflowId}`, {}, Object);
    indexWorkflowActivities = (id: string) => this.aget(`marketing/workflows/${id}/activities`, {}, MarketingActivity);
    storeWorkflowActivity = (workflowId: string, data: Dictionary) => this.post(`marketing/workflows/${workflowId}/activities`, data, MarketingActivity);
    updateWorkflowActivity = (workflowId: string, activityId: string, data: Dictionary) => this.put(`marketing/workflows/${workflowId}/activities/${activityId}`, data, MarketingActivity);
    destroyWorkflowActivity = (workflowId: string, activityId: string) => this.delete(`marketing/workflows/${workflowId}/activities/${activityId}`, {}, Object);
    showWorkflowStats = (id: string) => this.get(`marketing/workflows/${id}/stats`, {}, Object);
    indexInitiativeActivities = (initiativeId: string) => this.aget(`marketing/initiatives/${initiativeId}/activities`, {}, MarketingInitiativeActivity);
    storeInitiativeActivity = (initiativeId: string, data: Dictionary) => this.post(`marketing/initiatives/${initiativeId}/activities`, data, MarketingInitiativeActivity);
    updateInitiativeActivity = (initiativeId: string, activityId: string, data: Dictionary) => this.put(`marketing/initiatives/${initiativeId}/activities/${activityId}`, data, MarketingInitiativeActivity);
    destroyInitiativeActivity = (initiativeId: string, activityId: string) => this.delete(`marketing/initiatives/${initiativeId}/activities/${activityId}`, {}, Object);
    attachMetricToInitiativeActivity = (initiativeId: string, activityId: string, data: Dictionary) => this.post(`marketing/initiatives/${initiativeId}/activities/${activityId}/metrics`, data, Object);
    detachMetricFromInitiativeActivity = (initiativeId: string, activityId: string, metricId: string) => this.delete(`marketing/initiatives/${initiativeId}/activities/${activityId}/metrics/${metricId}`, {}, Object);

    indexMetrics = (params?: Dictionary) => this.aget('marketing/metrics', params, MarketingPerformanceMetric);
    showMetric = (id: string) => this.get(`marketing/metrics/${id}`, {}, MarketingPerformanceMetric);
    storeMetric = (data: Dictionary) => this.post('marketing/metrics', data, MarketingPerformanceMetric);
    updateMetric = (id: string, data: Dictionary) => this.put(`marketing/metrics/${id}`, data, MarketingPerformanceMetric);
    destroyMetric = (id: string) => this.delete(`marketing/metrics/${id}`, {}, Object);
    indexInitiativeMetrics = (initiativeId: string) => this.aget(`marketing/initiatives/${initiativeId}/metrics`, {}, MarketingPerformanceMetric);
    indexInitiativeMetricsAll = (initiativeId: string) => this.aget(`marketing/initiatives/${initiativeId}/metrics/all`, {}, MarketingPerformanceMetric);
    attachMetricToInitiative = (initiativeId: string, data: Dictionary) => this.post(`marketing/initiatives/${initiativeId}/metrics`, data, Object);
    updateInitiativeMetric = (initiativeId: string, metricId: string, data: Dictionary) => this.put(`marketing/initiatives/${initiativeId}/metrics/${metricId}`, data, Object);
    detachMetricFromInitiative = (initiativeId: string, metricId: string) => this.delete(`marketing/initiatives/${initiativeId}/metrics/${metricId}`, {}, Object);
    indexActivityMetrics = (activityId: string) => this.aget(`marketing/activities/${activityId}/metrics`, {}, MarketingPerformanceMetric);
    attachMetricToActivity = (activityId: string, data: Dictionary) => this.post(`marketing/activities/${activityId}/metrics`, data, Object);
    updateActivityMetric = (activityId: string, metricId: string, data: Dictionary) => this.put(`marketing/activities/${activityId}/metrics/${metricId}`, data, Object);
    detachMetricFromActivity = (activityId: string, metricId: string) => this.delete(`marketing/activities/${activityId}/metrics/${metricId}`, {}, Object);

    indexMarketingAssets = (category?: string, query?: string, tags?: string) => this.aget('marketing-assets', { category, query, tags }, File);
    uploadMarketingAsset = (formData: FormData) => this.upload('marketing-assets', formData);
    destroyMarketingAsset = (id: string | number) => this.delete(`marketing-assets/${id}`, {}, Object);
    updateMarketingAssetTags = (id: string | number, tags: string[]) => this.put(`marketing-assets/${id}/tags`, { tags }, File);
    updateMarketingAssetCategory = (id: string | number, category: string) => this.put(`marketing-assets/${id}/category`, { category }, File);
}
