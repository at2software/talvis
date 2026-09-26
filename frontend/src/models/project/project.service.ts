import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { Project } from './project.model';
import { Framework } from './framework.model';
import { FrameworkLatest } from './framework-latest.model';
import { PdfCreationType } from '@enums/PdfCreationType';
import { map, Observable, of } from 'rxjs';
import { serialize } from '@constants/rxjs/rxjs-operators';
import { TalvisHttpService, idOf } from '../http/http.talvis';
import { notifyHttpError } from '@models/http/file-download';
import { Company } from '../company/company.model';
import { nx } from '@models/_core/nx-bridge';
import { TInvoicing } from '@models/project/invoicing-type';
import { Milestone } from '@models/milestone/milestone.model';
import { Task } from '@models/task/task.model';
import { Serializable } from '@models/_core/serializable';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { MilestonesDto, ConvertDto, ParticipatingCompanyDto, PaymentPlanOverviewDto, PredictionStatsDto, QuoteAcceptancePredictionDto } from '@models/_core/api-response';

export interface ProjectPluginLinkResolution {
    url: string;
    pluginLinkId: string;
    project: Project;
}

@Service()
export class ProjectService extends TalvisHttpService<Project> {
    public apiPath = 'projects';
    override readonly model = Project;

    showForPath = (path: string, filters?: Dictionary) => this.show(path.split('/')[1], filters);
    indexOverrunRisk = () => this.aget('projects/overrun-risk');
    assigned = (id: string) => this.get(`projects/${id}/assigned`);
    addProject = (customerId: string, name: string = 'New Project') => this.post(`companies/${customerId}/projects`, { name: name });
    addMilestone = (id: string) => this.post(`projects/${id}/milestones`, {});
    indexMilestones = (id: string): Observable<MilestonesDto> =>
        this.get(`projects/${id}/milestones`, {}, Object).pipe(
            serialize('milestones', Milestone),
            serialize('project_tasks', Task),
        );
    createMilestone = (projectId: string, data: Dictionary): Observable<Milestone> => this.post(`projects/${projectId}/milestones`, data, Milestone);
    createTaskForProject = (projectId: string, data: Dictionary): Observable<Task> => this.post(`projects/${projectId}/tasks`, data, Task);
    convertInvoiceItemsToMilestones = (projectId: string) => this.post<ConvertDto>(`projects/${projectId}/convert-invoice-items-to-milestones`);
    wipeMilestones = (projectId: string) => this.delete(`projects/${projectId}/milestones/wipe-board`, {}, Object);
    linkMilestoneToInvoiceItem = (milestoneId: string, invoiceItemId: string) => this.post(`milestones/${milestoneId}/invoice-items/${invoiceItemId}`, {});
    predictionStats = (projectId: string) => this.get<PredictionStatsDto>(`projects/${projectId}/invoice-items/stats`, {});
    showQuoteAcceptancePrediction = (projectId: string) => this.get<QuoteAcceptancePredictionDto>(`projects/${projectId}/quote-acceptance-prediction`, {});
    showPaymentPlan = (projectId: string) => this.get<PaymentPlanOverviewDto>(`projects/${projectId}/payment-plan`, {});

    moveRegularItemsToCustomer = (_: Project) => this.put(`projects/${_.id}/move-regular-to-customer`);
    moveSupportToCustomer = (_: Project) => this.put(`projects/${_.id}/move-support-to-customer`, {}, Object);
    convertSupportItemsToRegular = (_: Project) => this.put(`projects/${_.id}/convert-support-to-regular`, {}, Object);
    makePdf = (parent: Serializable, type: PdfCreationType = PdfCreationType.Preview, success?: () => unknown) => this.getFile(parent.apiPathWithId() + '/pdf', { type: type }, success);

    indexMissingGit = () => this.aget('projects/missing-git', {}, Project);
    resolveProjectsByPluginLinkUrls = (urls: string[]): Observable<ProjectPluginLinkResolution[]> => {
        if (!urls.length) return of([]);
        return this.post('projects/resolve-plugin-link-urls', { urls }, Object).pipe(
            map((rows: Dictionary[]) => rows.map((row): ProjectPluginLinkResolution => ({ url: String(row['url']), pluginLinkId: String(row['plugin_link_id']), project: Project.fromJson(row['project']) }))),
        );
    };
    indexPaginated = (filters?: Dictionary) => this.paginate(this.apiPath, filters);
    indexForCompany = (_: Company | string | number, filters?: Dictionary): Observable<Project[]> => this.aget(`companies/${idOf(_)}/projects`, filters);
    indexCoParticipatedProjects = (company: Company, filters?: Dictionary): Observable<Project[]> => this.aget(`companies/${company.id}/co-participated-projects`, filters);
    indexQuoteDescriptions = (projectId: string): Observable<string[]> => this.aget(`projects/${projectId}/quote-descriptions`, {}, Object);
    indexFrameworks = (): Observable<Framework[]> => this.aget('projects/frameworks', {}, Framework);
    indexLatestFrameworks = (): Observable<FrameworkLatest[]> => this.aget('projects/frameworks/latest', {}, FrameworkLatest);
    indexReporting = (params: Dictionary) => this.aget('projects/reporting', params, Project);
    indexFeatures = (projectId: string): Observable<InvoiceItem[]> => this.aget(`projects/${projectId}/features`, {}, InvoiceItem);

    makeInvoice(project: Project, type: TInvoicing, success?: () => unknown, draft = false) {
        const stageMap: Partial<Record<TInvoicing, number>> = {
            [TInvoicing.PartialInvoice]: 2,
            [TInvoicing.SupportInvoice]: 1,
            [TInvoicing.FinalInvoice]: 0,
        };
        const stage = stageMap[type] ?? 0;
        const params: Dictionary = draft ? { type: stage, draft: 1 } : { type: stage };
        const download = nx().global.user!.getFloatParam('INVOICE_DOWNLOAD', 1);
        const done = () => {
            if (!draft) nx().global.onInvoiceCreated.next();
            success?.();
        };
        if (draft || download === 1) {
            this.getFile(`projects/${project.id}/invoice`, params, done);
        } else {
            this.getBlob(`projects/${project.id}/invoice`, params).subscribe({ next: done, error: notifyHttpError });
        }
    }

    indexConnectionProjects = (projectId: string): Observable<ParticipatingCompanyDto[]> =>
        this.aget<ParticipatingCompanyDto>(`projects/${projectId}/connection-projects`, {}).pipe(map((rows) => rows.map((row) => ({ ...row, other_company: Company.fromJson(row.other_company) }))));
    storeConnectionProject = (project: Project, connectionId: number) => this.post(`projects/${project.id}/connection-projects`, { connection_id: connectionId }, Object);
    destroyConnectionProject = (project: Project, connectionProjectId: number) => this.delete(`projects/${project.id}/connection-projects/${connectionProjectId}`, {}, Object);
}
