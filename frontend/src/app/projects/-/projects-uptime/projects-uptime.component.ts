import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { DatePipe } from '@angular/common';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { UptimeMonitor } from '@models/uptime/uptime-monitor.model';
import { UptimeMonitorService } from '@models/uptime/uptime-monitor.service';
import { UptimeCheckDayDto } from '@models/_core/api-response';
import { GlobalService } from '@models/global.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { UptimeMonitorModalService } from '@app/_modals/modal-uptime-monitor/modal-uptime-monitor.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'projects-uptime',
    imports: [DatePipe, NgbTooltipModule, Nx, AvatarComponent, ToolbarComponent, AvatarComponent, EmptyStateComponent, SpinnerComponent],
    templateUrl: './projects-uptime.component.html',
    styleUrls: ['./projects-uptime.component.scss'],
})
export class ProjectsUptimeComponent {
    global = inject(GlobalService);
    #service = inject(UptimeMonitorService);
    #modalService = inject(UptimeMonitorModalService);

    readonly #monitors = modelListResource(() => this.#service.index());
    readonly monitors = this.#monitors.value;
    readonly loading = this.#monitors.isLoading;

    readonly #checks = modelResource(
        () => this.monitors().map((m) => m.id).join(',') || undefined,
        () => forkJoin(this.monitors().map((m) => this.#service.indexChecks(m, 30).pipe(map((checks) => ({ id: m.id, checks })), catchError(() => of({ id: m.id, checks: [] as UptimeCheckDayDto[] }))))),
    );
    readonly checksCache = computed(() => new Map(this.#checks.value()?.map((r) => [r.id, r.checks])));

    constructor() {
        effect(() =>
            this.monitors().forEach((monitor) => {
                monitor.var.onTestRequested = (m: UptimeMonitor) => this.testMonitor(m);
                monitor.var.onEditRequested = (m: UptimeMonitor) => this.openEditModal(m);
                monitor.var.onEditSuccess = () => this.loadMonitors();
                monitor.var.onDeleteSuccess = () => this.loadMonitors();
                monitor.var.onSubscribeSuccess = () => this.loadMonitors();
                monitor.var.onUnsubscribeSuccess = () => this.loadMonitors();
            }),
        );
    }

    loadMonitors = () => this.#monitors.reload();

    openEditModal(monitor: UptimeMonitor) {
        this.#modalService
            .open(monitor)
            .then(() => this.loadMonitors())
            .catch(() => {
                // Modal dismissed
            });
    }

    openCreateModal() {
        this.#modalService
            .open()
            .then(() => this.loadMonitors())
            .catch(() => {
                // Modal dismissed
            });
    }

    testMonitor(monitor: UptimeMonitor) {
        this.#service.testCheckAndReport(monitor).subscribe(() => this.loadMonitors());
    }

    getChecks(monitor: UptimeMonitor): UptimeCheckDayDto[] {
        return this.checksCache().get(monitor.id) || [];
    }

    getSparklineData(monitor: UptimeMonitor): { percentage: number; color: string; day: string }[] {
        return this.getChecks(monitor).map((d) => {
            const percentage = (d.up_count / d.total) * 100;
            let color: string;
            if (percentage === 100) color = 'success';
            else if (percentage > 95) color = 'warning';
            else if (percentage > 90) color = 'orange';
            else color = 'danger';
            return { percentage, color, day: d.day };
        });
    }

    getUptimePercentage(monitor: UptimeMonitor): number {
        const days = this.getChecks(monitor);
        if (!days.length) return 100;
        const upTotal = days.reduce((sum, d) => sum + Number(d.up_count), 0);
        const total = days.reduce((sum, d) => sum + Number(d.total), 0);
        return Math.round((upTotal / total) * 100);
    }
}
