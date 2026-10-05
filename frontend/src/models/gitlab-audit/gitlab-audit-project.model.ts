import { Serializable } from '@models/_core/serializable';
import { NxAction } from '@models/_core/nx.actions';
import { Model } from '@constants/model/type-discriminators';
import { Type } from '@models/_core/hydrate';
import { Company } from '@models/company/company.model';
import { GitlabAuditProjectActions } from './gitlab-audit-project.actions';

@Model('GitlabAuditProject')
export class GitlabAuditProject extends Serializable {
    static API_PATH = () => 'gitlab-audit';
    static DB_TABLE_NAME = () => 'gitlab_audit_projects';

    gitlab_url!: string;
    namespace_with_path!: string;
    project_name!: string;
    gitlab_project_id?: number;
    company_id?: number;
    invoice_item_id?: number;
    invoice_item?: any;
    environment = 'production';
    cron?: string;
    jobs: string[] = [];
    last_run_at?: string;
    last_pipeline_id?: number;
    last_status?: 'retried' | 'no-deployment' | 'no-jobs' | 'foreign-gitlab';
    linked_projects: { id: number; name: string; has_chat: boolean }[] = [];

    @Type(() => Company) company?: Company;

    protected override buildActions(): NxAction[] { return GitlabAuditProjectActions(this) }

    lastPipelineUrl = () => (this.last_pipeline_id ? `${this.gitlab_url}${this.namespace_with_path}/-/pipelines/${this.last_pipeline_id}` : undefined);
}
