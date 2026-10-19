import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { Color } from '@constants/Color';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { Task } from '@models/task/task.model';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TabTasksBaseComponent } from '../tab-tasks-base.component';

type TTask = ITaskPlugin & PluginInstance;
interface TInstanceEntry { instance: TTask; tasks: WritableSignal<Task[]>; key: string }

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'tab-tasks-plugin-tasks',
    templateUrl: './tab-tasks-plugin-tasks.component.html',
    imports: [Nx, NComponent, AvatarComponent, NgbTooltipModule, RouterModule],
})
export class TabTasksPluginTasksComponent extends TabTasksBaseComponent {
    instances = signal<TInstanceEntry[]>([]);

    factory = inject(PluginInstanceFactory);
    input = inject(InputModalService);

    readonly active = input(false);

    constructor() {
        super();
        effect(() => {
            if (this.ready() && this.active()) untracked(() => this.reload());
        });
    }

    override reload() {
        if (!this.active()) return;
        const raw = this.factory.getPluginInstances().filter((_) => 'ITaskPluginProperty' in _ && _.isRootInstance()) as TTask[];
        const entries: TInstanceEntry[] = raw.map((instance, i) => ({ instance, tasks: signal<Task[]>([]), key: instance.id != null ? instance.id.toString() : instance.getName() ?? i.toString() }));
        this.instances.set(entries);
        entries.forEach(({ instance, tasks }) => this.#loadInstance(instance, tasks));
    }

    #loadInstance(instance: TTask, tasks: WritableSignal<Task[]>) {
        instance.init.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            instance
                .indexTasks()
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((response) => {
                    tasks.set(response);
                });
        });
    }

    onNewTask(entry: TInstanceEntry) {
        this.input
            .open('title', true)
            .then((response) => {
                if (response) {
                    const n = Task.fromJson({ name: response.text });
                    entry.instance
                        .create(n)
                        .pipe(takeUntilDestroyed(this.destroyRef))
                        .subscribe((response) => {
                            const newTask = Task.fromJson(response);
                            newTask.var.user = entry.instance.getUserFor(newTask.assignee?.id);
                            newTask.var.compact = newTask.state == 1;
                            newTask.httpService = entry.instance;
                            entry.tasks.update((t) => [...t, newTask]);
                        });
                }
            })
            .catch();
    }

    colorFor(task: Task): string;
    colorFor(label: string): string;
    colorFor(input: Task | string): string {
        if (typeof input === 'string') return Color.uniqueColorFromString(input ?? '');
        return Color.uniqueColorFromString(input.project_url ?? '');
    }
}
