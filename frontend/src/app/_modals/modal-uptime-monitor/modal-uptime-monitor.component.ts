import { ChangeDetectionStrategy, Component, inject, signal, Service } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';

import { UptimeMonitor } from '@models/uptime/uptime-monitor.model';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Dictionary } from '@constants/constants';
import { Toast } from '@shards/toast/toast';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-uptime-monitor',
    templateUrl: './modal-uptime-monitor.component.html',
    styleUrls: ['./modal-uptime-monitor.component.scss'],
    imports: [FormsModule, SpinnerComponent],
})
export class ModalUptimeMonitorComponent {
    monitor!: UptimeMonitor;
    isCreating = signal(false);
    isSaving = signal(false);
    projectIds: string[] = [];

    activeModal = inject(NgbActiveModal);

    isValid(): boolean {
        return !!(this.monitor.name?.trim() && this.monitor.url?.trim());
    }

    save() {
        if (!this.isValid()) {
            Toast.warn($localize`:@@i18n.uptime.requiredFields:please fill in all required fields (name and URL)`);
            return;
        }

        const payload: Dictionary = {
            name: this.monitor.name,
            url: this.monitor.url,
            method: this.monitor.method,
            expected_status_code: this.monitor.expected_status_code,
            timeout: this.monitor.timeout,
            response_time_threshold: this.monitor.response_time_threshold,
            check_interval: this.monitor.check_interval,
            is_active: this.monitor.is_active,
            request_headers: this.monitor.request_headers,
            request_body: this.monitor.request_body,
        };

        if (this.isCreating() && this.projectIds.length > 0) {
            payload.project_ids = this.projectIds;
        }

        this.isSaving.set(true);
        const action = this.isCreating() ? this.monitor.store(payload) : this.monitor.update(payload);
        action.subscribe({
            next: (result) => {
                this.isSaving.set(false);
                if (Array.isArray(result) && result.length === 0) {
                    Toast.error($localize`:@@i18n.uptime.saveFailed:failed to save monitor` + ': ' + $localize`:@@i18n.uptime.emptyResponse:server returned an empty response`);
                    return;
                }
                this.activeModal.close(true);
            },
            error: (err) => {
                this.isSaving.set(false);
                Toast.error($localize`:@@i18n.uptime.saveFailed:failed to save monitor` + `: ${err?.error?.message || err?.message || 'Unknown error'}`);
            },
        });
    }

    close() {
        this.activeModal.dismiss();
    }
}

@Service()
export class UptimeMonitorModalService {
    modalService = inject(NgbModal);

    open(monitor?: UptimeMonitor, projectIds?: string[]): Promise<boolean> {
        const modalRef = this.modalService.open(ModalUptimeMonitorComponent, { size: 'lg' });

        if (monitor) {
            modalRef.componentInstance.monitor = Object.assign(new UptimeMonitor(), monitor);
            modalRef.componentInstance.isCreating.set(false);
        } else {
            const newMonitor = new UptimeMonitor();
            newMonitor.method = 'GET';
            newMonitor.expected_status_code = 200;
            newMonitor.timeout = 30;
            newMonitor.response_time_threshold = 5000;
            newMonitor.check_interval = 300;
            newMonitor.is_active = true;
            modalRef.componentInstance.monitor = newMonitor;
            modalRef.componentInstance.isCreating.set(true);
            modalRef.componentInstance.projectIds = projectIds || [];
        }
        return modalRef.result;
    }
}
