import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { tracked } from '@constants/tracked';
import { ProjectService } from '@models/project/project.service';
import { Project } from '@models/project/project.model';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { GlobalService } from '@models/global.service';
import { ProjectDetailGuard } from '../project-details.guard';
import { ProjectState } from '@models/project/project-state.model';
import { ProjectComponent } from '@shards/project/project.component';
import { ActivityTabComponent } from '@activity/activity-tab.component';
import { TabCommentsComponent } from '@activity/tab-comments/tab-comments.component';
import { HeaderComponent } from '@app/app/header/header.component';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SmartLinkDirective } from '@directives/smart-link.directive';
import { HeaderRouteNavComponent } from '@app/app/header/header-route-nav/header-route-nav.component';

@Component({
    selector: 'project-detail',
    templateUrl: './project-detail.component.html',
    styleUrls: ['./project-detail.component.scss'],
    imports: [HeaderComponent, ProjectComponent, HeaderRouteNavComponent, RouterModule, ActivityTabComponent, TabCommentsComponent, NgbDropdownModule, NgbTooltipModule, SmartLinkDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailComponent {

    #router = inject(Router);
    #projectService = inject(ProjectService);
    global = inject(GlobalService);
    parent = inject(ProjectDetailGuard);

    readonly object = tracked(this.parent.object);
    route = inject(ActivatedRoute);

    dataIntensity: unknown[] = [];
    dataPie: unknown[] = [];
    dataPieMax: number = 0;
    dataPieWage: string = '';

    onDndUploaded = () => window.location.reload();

    setParent = (_?: Project) => this.parent.object().update({ project_id: _ ? _.id : null }).subscribe();

    setState = (event: Event, requestedState: string) => {
        event.preventDefault();
        event.stopPropagation();
        const object = this.parent.object();
        object.update({ state: requestedState }).subscribe(() => {
            if (['3', '9'].contains('' + requestedState)) {
                this.#router.navigate(['/projects/' + object.id + '/invoicing/final']);
            }
        });
    };

    openProject(p: Project) {
        const [path, suffix = ''] = this.#router.url.split(/(?=[?#])/, 2);
        this.#router.navigateByUrl(path.replace(/^\/projects\/\d+/, '/projects/' + p.id) + suffix);
    }

    prepareInvoice() {
        const object = this.parent.object();
        this.#projectService.moveRegularItemsToCustomer(object).subscribe((_) => {
            this.#router.navigate(['/customers/' + object.company_id + '/billing']);
        });
    }
    isStateAllowed = (_: ProjectState) => ProjectState.allowedTargetIds(this.parent.object().state.id, this.global.user).contains('' + _.id);
}
