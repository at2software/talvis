import { PercentPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Company } from '@models/company/company.model';
import { ProgressBarComponent } from '@shards/progress-bar/progress-bar.component';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { tracked } from '@constants/tracked';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    selector: 'customer-quickstats',
    imports: [ValueUnitComponent, PercentPipe, DecimalPipe, ProgressBarComponent, MoneyShortPipe],
    templateUrl: './customer-quickstats.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerQuickstatsComponent {
    readonly company = input<Company>();
    readonly trackedCompany = tracked(this.company);

    projectSuccess = computed(() => parseFloat(this.trackedCompany()?.getParam('PROJECT_SUCCESS_RATE') ?? '0') * 0.01);
    paymentOverdue = computed(() => this.trackedCompany()?.averagePaymentDelay() ?? 0);
    paymentOverdueStyle = computed(() => (this.paymentOverdue() > 0 ? 'red' : 'green'));
    paymentDurationPerc = computed(() => Math.abs(this.paymentOverdue()) / parseFloat(this.trackedCompany()?.getParam('INVOICE_PAYMENT_DURATION') ?? '14'));
}
