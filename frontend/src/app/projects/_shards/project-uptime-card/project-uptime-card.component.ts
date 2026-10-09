import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';

import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Project } from '@models/project/project.model';
import { UptimeMonitor } from '@models/uptime/uptime-monitor.model';
import { UptimeMonitorService } from '@models/uptime/uptime-monitor.service';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ProjectComponent } from '@shards/project/project.component';
import { CollapsibleDirective } from '@directives/collapsible.directive';
import { UptimeMonitorModalService } from '@app/_modals/modal-uptime-monitor/modal-uptime-monitor.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { tracked } from '@constants/tracked';

@Component({
    selector: 'project-uptime-card',
    imports: [NgbDropdownModule, NgbTooltipModule, Nx, NComponent, AvatarComponent, ProjectComponent, CollapsibleDirective, SpinnerComponent],
    templateUrl: './project-uptime-card.component.html',
    styleUrls: ['./project-uptime-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectUptimeCardComponent {
    readonly project = input.required<Project>();
    readonly trackedProject = tracked(this.project);

    #service = inject(UptimeMonitorService);
    #modalService = inject(UptimeMonitorModalService);

    readonly #monitors = modelListResource(
        () => this.project().id,
        (projectId) => this.#service.index({ project_id: projectId }),
    );
    readonly monitors = this.#monitors.value;
    readonly loading = this.#monitors.isLoading;

    readonly #allMonitors = modelListResource(() => this.#service.index());
    readonly allMonitors = computed(() => {
        const linked = new Set(this.monitors().map((m) => m.id));
        return this.#allMonitors.value().filter((m) => !linked.has(m.id));
    });

    constructor() {
        effect(() =>
            this.monitors().forEach((monitor) => {
                monitor.var.onTestRequested = (m: UptimeMonitor) => this.#testMonitor(m);
                monitor.var.onEditRequested = (m: UptimeMonitor) => this.#openEditModal(m);
                monitor.var.onEditSuccess = () => this.#monitors.reload();
                monitor.var.onUnlinkFromProject = (m: UptimeMonitor) => this.#unlinkMonitor(m);
            }),
        );
    }

    #openEditModal(monitor: UptimeMonitor) {
        this.#modalService.open(monitor).then(() => this.#monitors.reload()).catch(() => void 0);
    }

    #testMonitor(monitor: UptimeMonitor) {
        this.#service.testCheckAndReport(monitor).subscribe(() => this.#monitors.reload());
    }

    createNew() {
        this.#modalService.open(undefined, [this.trackedProject().id]).then(() => {
            this.#monitors.reload();
            this.#allMonitors.reload();
        }).catch(() => void 0);
    }

    linkExisting(monitor: UptimeMonitor) {
        const projectIds = [...(monitor.projects?.map((p) => p.id) || []), this.trackedProject().id];
        monitor.update({ project_ids: projectIds } as any).subscribe(() => {
            this.#monitors.reload();
            this.#allMonitors.reload();
        });
    }

    #unlinkMonitor(monitor: UptimeMonitor) {
        const projectIds = (monitor.projects?.map((p) => p.id) || []).filter((id) => id !== this.trackedProject().id);
        monitor.update({ project_ids: projectIds } as any).subscribe(() => {
            this.#monitors.reload();
            this.#allMonitors.reload();
        });
    }
}
