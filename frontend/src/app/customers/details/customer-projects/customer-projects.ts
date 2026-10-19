import { ChangeDetectionStrategy, Component, computed, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ProjectService } from '@models/project/project.service';
import { Project } from '@models/project/project.model';
import { dayjsMax } from '@constants/date/dates';
import { ProjectStateFilterComponent } from '@app/projects/_shards/project-state-filter/project-state-filter.component';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ProjectComponent } from '@shards/project/project.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { PermissionsDirective } from '@directives/permissions.directive';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { CdkDragDrop, CdkDropList, CdkDrag, CdkDragPreview } from '@angular/cdk/drag-drop';
import { modelListResource } from '@models/http/model-resource';
import { Dictionary } from '@constants/constants';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    selector: 'customer-projects',
    templateUrl: './customer-projects.html',
    styleUrls: ['./customer-projects.scss'],
    imports: [ToolbarComponent, ScrollbarComponent, ProjectStateFilterComponent, EmptyStateComponent, FormsModule, DatePipe, NgTemplateOutlet, Nx, AvatarComponent, ProjectComponent, NgbTooltipModule, MoneyShortPipe, PermissionsDirective, HotkeyDirective, CdkDropList, CdkDrag, CdkDragPreview, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerProjects {
    #projectService = inject(ProjectService);
    #parent = inject(CustomerDetailGuard);
    #router = inject(Router);

    stateFilter = viewChild(ProjectStateFilterComponent);

    #collapsedIds = signal(new Set<string>());
    hoveredProjectId = signal<string | null>(null);
    getLevelArray = (level: number) => Array.from({length: level}, (_, i) => i);

    #reloadTick = signal(0);
    #params = computed<{ tick: number; companyId: string; filters: Dictionary } | undefined>(
        () => {
            const filter = this.stateFilter();
            const companyId = this.#parent.object()?.id;
            if (!filter || !companyId) return undefined;
            return { tick: this.#reloadTick(), companyId, filters: { ...filter.getFilters(), withParents: true } };
        },
        { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );

    #projects = modelListResource(this.#params, ({ filters }) => this.#projectService.indexForCompany(untracked(this.#parent.object), filters));
    #coParticipated = modelListResource(this.#params, ({ filters }) => this.#projectService.indexCoParticipatedProjects(untracked(this.#parent.object), filters));

    projects = computed(() => this.#buildProjectTree(this.#projects.value()));
    coParticipatedProjects = computed(() => this.#buildProjectTree(this.#coParticipated.value()));
    loaded = computed(() => this.#projects.hasValue() && this.#coParticipated.hasValue());
    #allDropListIds = computed(() => this.#collectIds(this.projects()));

    reload = () => this.#reloadTick.update((_) => _ + 1);

    #buildProjectTree(data: Project[]): Project[] {
        data.forEach((_: Project) => { _.var.subprojects = []; _.var.total = 0; _.var.has_circular_dependency = false; });

        const hasCircularDependency = (projectId: string, visited = new Set<string>()): boolean => {
            if (visited.has(projectId)) return true;
            visited.add(projectId);
            const project = data.find((p) => p.id === projectId);
            return project?.project_id ? hasCircularDependency(project.project_id, new Set(visited)) : false;
        };

        data.forEach((_: Project) => { if (_.project_id && hasCircularDependency(_.id)) _.var.has_circular_dependency = true; });
        data.forEach((_: Project) => {
            if (_.project_id && !_.var.has_circular_dependency) {
                const parent = data.find((p: Project) => p.id === _.project_id);
                parent?.var.subprojects.push(_);
                if (!parent) { console.warn('unknown base project', _.project_id, _.name); _.project_id = ''; }
            }
        });

        const result = data.filter((_: Project) => !_.project_id || _.var.has_circular_dependency);
        const recurse = (_: Project[]) => _.forEach((item) => {
            recurse(item.var.subprojects);
            item.var.total = item.net + item.var.subprojects.reduce((a: number, b: Project) => a + b.var.total, 0);
            item.var.latest = dayjsMax(item.createdAt(), ...item.var.subprojects.map((a: Project) => a.createdAt()));
        });
        recurse(result);
        return result.sort((a: Project, b: Project) => b.var.latest.diff(a.var.latest, 'seconds'));
    }

    #collectIds(items: Project[]): string[] {
        return items.flatMap((item) => ['drop-' + item.id, ...(item.var.subprojects?.length ? this.#collectIds(item.var.subprojects) : [])]);
    }

    getConnectedDropLists = () => this.#allDropListIds();
    onDragStarted = () => document.body.classList.add('project-dragging');
    onDragEnded = () => { document.body.classList.remove('project-dragging'); this.hoveredProjectId.set(null); };
    isCollapsed = (project: Project) => this.#collapsedIds().has(project.id);

    toggleCollapse(project: Project) {
        this.#collapsedIds.update((s) => {
            const n = new Set(s);
            if (n.has(project.id)) n.delete(project.id); else n.add(project.id);
            return n;
        });
    }

    onDropOnProject(event: CdkDragDrop<Project[]>, targetProject: Project) {
        const draggedProject = event.item.data as Project;
        if (draggedProject.id !== targetProject.id) this.#makeSubproject(draggedProject, targetProject);
    }

    onAddProject = () => this.#projectService.addProject(this.#parent.object().id).subscribe((x) => this.#router.navigate(['/projects/' + x.id]));

    #makeSubproject(draggedProject: Project, targetProject: Project) {
        if (this.#wouldCreateCircularDependency(draggedProject.id, targetProject.id)) return;
        if (draggedProject.project_id === targetProject.id) return;
        draggedProject.update({ project_id: targetProject.id }).subscribe(() => this.reload());
    }

    #wouldCreateCircularDependency(projectId: string, newParentId: string): boolean {
        if (projectId === newParentId) return true;
        const findProject = (id: string): Project | undefined => {
            const search = (projects: Project[]): Project | undefined => {
                for (const p of projects) {
                    if (p.id === id) return p;
                    const found = search(p.var.subprojects || []);
                    if (found) return found;
                }
                return undefined;
            };
            return search(this.projects());
        };
        let current = findProject(newParentId);
        while (current) {
            if (current.id === projectId) return true;
            current = current.project_id ? findProject(current.project_id) : undefined;
        }
        return false;
    }
}
