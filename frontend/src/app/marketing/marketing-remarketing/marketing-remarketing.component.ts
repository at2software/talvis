import { NgTemplateOutlet, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { AutosaveDirective } from '@directives/autosave.directive';
import { Company } from '@models/company/company.model';
import { MarketingService } from '@models/marketing/marketing.service';
import { modelResource } from '@models/http/model-resource';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ProgressBarComponent } from '@shards/progress-bar/progress-bar.component';
import { MoneyPipe } from '@pipes/money.pipe';
import { REPEATING_RECURRENCES } from '@enums/recurrence.type';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { Toast } from '@shards/toast/toast';
import { TouchpointModalComponent } from '../shared/touchpoint-modal/touchpoint-modal.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-remarketing',
    templateUrl: './marketing-remarketing.component.html',
    styleUrls: ['./marketing-remarketing.component.scss'],
    imports: [NgTemplateOutlet, DatePipe, FormsModule, Nx, AvatarComponent, AutosaveDirective, ProgressBarComponent, NgbTooltipModule, MoneyPipe, SpinnerComponent],
})
export class MarketingRemarketingComponent {
    service = inject(MarketingService);
    #modal = inject(ModalBaseService);

    readonly recurrences = REPEATING_RECURRENCES;

    #remarketing = modelResource(() => this.service.getRemarketing());

    loaded = computed(() => this.#remarketing.hasValue() || this.#remarketing.status() === 'error');
    observed = computed(() => this.#byProgress(this.#remarketing.value()?.observed));
    suggested = computed(() => this.#byProgress(this.#remarketing.value()?.suggested));

    #byProgress = (companies?: Company[]) => [...(companies ?? [])].sort((a, b) => b.remarketingProgress() - a.remarketingProgress());

    logContact(item: Company) {
        this.#modal.open(TouchpointModalComponent, { title: item.getName() }).then((payload) => {
            if (!payload) return;
            this.service.storeCompanyTouchpoint(item.id, payload).subscribe({
                next: () => this.#remarketing.reload(),
                error: () => Toast.error($localize`:@@i18n.marketing.touchpoint_save_failed:saving the contact failed – please try again`),
            });
        });
    }

    clearRemarketingInterval(item: Company) {
        item.update({ remarketing_interval: null }).subscribe();
    }
}
