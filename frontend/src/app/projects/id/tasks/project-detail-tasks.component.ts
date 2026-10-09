import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Task } from '@models/task/task.model';
import { User } from '@models/user/user.model';
import { forkJoin, map } from 'rxjs';
import { modelListResource } from '@models/http/model-resource';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Color } from '@constants/Color';
import { ProjectDetailGuard } from '../../project-details.guard';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { UlCompactComponent } from '@shards/ul-compact/ul-compact.component';
import { CompactItemDirective } from '@shards/ul-compact/CompactItemDirective';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { RouterLink } from '@angular/router';
import { HotkeyDirective } from '@directives/hotkey.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-detail-tasks',
    templateUrl: './project-detail-tasks.component.html',
    styleUrls: ['./project-detail-tasks.component.scss'],
    imports: [NgTemplateOutlet, FormsModule, UlCompactComponent, CompactItemDirective, Nx, NComponent, NgbTooltipModule, EmptyStateComponent, RouterLink, HotkeyDirective],
})
export class ProjectDetailTasksComponent {
    newTask!: Task;
    instances = signal<ITaskPlugin[]>([]);
    instancesLoaded = signal(false);

    #parent = inject(ProjectDetailGuard);
    factory = inject(PluginInstanceFactory);

    readonly #tasks = modelListResource(
        () => (this.instances().length ? this.instances() : undefined),
        (instances) => forkJoin(instances.map((_) => _.indexTasks())).pipe(map((tasks) => tasks.flat())),
    );
    readonly tasks = this.#tasks.value;
    readonly tasksLoading = this.#tasks.isLoading;

    constructor() {
        effect(() => {
            this.#parent.object();
            untracked(() => {
                this.#parent.object().taskPluginInstances().then((instances) => {
                    this.instances.set(instances);
                    this.instancesLoaded.set(true);
                    this.newTask = new Task();
                    this.newTask.httpService = instances[0];
                });
            });
        });
    }

    onCreate = (event: Event) => {
        event.stopPropagation();
        event.preventDefault();
        const service = this.newTask.httpService;
        service.create(this.newTask).subscribe((_) => this.reloadTasks());
        this.newTask = new Task();
        this.newTask.httpService = service;
    };
    actionsResolved = () => this.reloadTasks();
    getLabelFor = (_: string, i: Task) => i.httpService.getLabelFor(_);

    reloadTasks = () => this.#tasks.reload();
    hideIcon = ($e: Event) => {
        ($e.target as HTMLImageElement).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==';
    };
    colorFor = (_: Task) => (_?.user_name?.length ? Color.uniqueColorFromString(_.user_name) : '#333333');
    coAssigneeUsers = (item: Task): User[] => (item.co_assignees ?? []).map((c) => c.assignee).filter((a): a is User => a instanceof User);
}
