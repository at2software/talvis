import { Service } from '@angular/core';
import { TalvisHttpService } from '../http/http.talvis';
import { GitlabAuditProject } from './gitlab-audit-project.model';

@Service()
export class GitlabAuditService extends TalvisHttpService<GitlabAuditProject> {
    apiPath = 'gitlab-audit';
    override readonly model = GitlabAuditProject;
}
