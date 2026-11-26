import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { Vacation } from '@models/vacation/vacation.model';
import { VacationGrant } from '@models/vacation/vacation-grant.model';
import { VacationGrantService } from '@models/vacation/vacation-grant.service';
import { ReviewDecision } from '@models/_core/modal-results';
import { AvatarComponent } from '@shards/avatar/avatar.component';

@Component({
    selector: 'modal-review-vacation',
    templateUrl: './modal-review-vacation.component.html',
    styleUrls: ['./modal-review-vacation.component.scss'],
    imports: [AvatarComponent, FormsModule, DatePipe, DecimalPipe, NgbTooltipModule, HotkeyDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalReviewVacationComponent extends ModalBaseComponent<ReviewDecision> {
    vacation!: Vacation;
    grant = signal<VacationGrant | undefined>(undefined);
    isOwner = signal(false);
    isHR = signal(false);
    showDeclineReason = signal(false);
    declineReason = '';

    #grantService = inject(VacationGrantService);
    #destroyRef = inject(DestroyRef);
    #decision?: ReviewDecision;

    init(vacation: Vacation): void {
        this.vacation = vacation;
        this.isOwner.set(vacation.isOwnedByCurrentUser());
        this.isHR.set(vacation.hasVacationPermissions());
        if (!this.isOwner() && !this.isHR()) {
            this.decline();
            return;
        }
        if (vacation.vacation_grant_id) {
            this.#grantService
                .show(vacation.vacation_grant_id)
                .pipe(takeUntilDestroyed(this.#destroyRef))
                .subscribe((grant) => this.grant.set(grant));
        }
    }

    isOpen = () => this.vacation.isRequested();
    canWithdraw = () => this.isOpen() && this.isOwner();
    canDecide = () => this.isOpen() && this.isHR();

    absHours = () => Math.abs(this.vacation.amount);
    absDays = () => this.absHours() / (this.vacation.user?.getAverageHpd() ?? 0);
    remainingAfterApproval = () => (this.grant()?.remainingHours() ?? 0) + this.vacation.amount;

    onApprove() {
        this.#decision = { type: 'approve' };
        this.accept();
    }

    onDecline() {
        if (!this.showDeclineReason()) {
            this.showDeclineReason.set(true);
            return;
        }
        if (!this.declineReason.trim()) return;
        this.#decision = { type: 'decline', reason: this.declineReason.trim() };
        this.accept();
    }

    onWithdraw() {
        this.#decision = { type: 'withdraw' };
        this.accept();
    }

    onSuccess(): ReviewDecision {
        return this.#decision!;
    }
}
