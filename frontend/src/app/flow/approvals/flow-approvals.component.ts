import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { HeaderComponent } from '@app/app/header/header.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Dictionary } from '@constants/constants';
import { modelListResource } from '@models/http/model-resource';
import { Approval } from '@models/flow/approval.model';
import { FlowApprovalService } from '@models/flow/approval.service';

@Component({
    selector: 'flow-approvals',
    templateUrl: './flow-approvals.component.html',
    imports: [HeaderComponent, ScrollbarComponent, EmptyStateComponent, SpinnerComponent, NgbTooltipModule, RouterLink, DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowApprovalsComponent {
    #service = inject(FlowApprovalService);
    #input = inject(InputModalService);

    readonly #approvals = modelListResource(() => this.#service.index());
    readonly approvals = this.#approvals.value;
    readonly isLoading = this.#approvals.isLoading;
    readonly selectedOptions = signal<Dictionary<string>>({});

    selectOption = (approval: Approval, option: string) => this.selectedOptions.update((_) => ({ ..._, [approval.id]: option }));

    async approve(approval: Approval) {
        const result = await this.#input.open($localize`:@@i18n.flow.approveReason:reason for the approval (optional)`, false, undefined, '');
        if (!result) return;
        this.#service.approve(approval, result.text, this.selectedOptions()[approval.id]).subscribe(() => this.#approvals.reload());
    }

    async requestChanges(approval: Approval) {
        const result = await this.#input.open($localize`:@@i18n.flow.requestChangesReason:what has to change?`);
        if (!result) return;
        this.#service.requestChanges(approval, result.text).subscribe(() => this.#approvals.reload());
    }

    async reject(approval: Approval) {
        const result = await this.#input.open($localize`:@@i18n.flow.rejectReason:why is this rejected?`);
        if (!result) return;
        this.#service.reject(approval, result.text).subscribe(() => this.#approvals.reload());
    }
}
