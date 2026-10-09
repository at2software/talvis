import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NComponent } from '@shards/n/n.component';
import { SmartLinkDirective } from '@directives/smart-link.directive';
import { Company } from '@models/company/company.model';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Color } from '@constants/Color';
import { tracked } from '@constants/tracked';
import { ExtIssueRef } from '@models/ext-issue/ext-issue-resolver.service';

@Component({
    selector: '[tr-item-info]',
    templateUrl: './tr-item-info.component.html',
    host: { class: 'text-nowrap' },
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NComponent, DecimalPipe, PercentPipe, NgbTooltipModule, SmartLinkDirective, NComponent],
})
export class TableRowItemInfoComponent {
    readonly item = input.required<InvoiceItem>();
    readonly trackedItem = tracked(this.item);
    text = input('');
    readonly company = input<Company | undefined>(undefined);
    readonly trackedCompany = tracked(this.company);
    mode = input<'quote' | 'invoice' | 'support'>('invoice');
    extIssues = input<Record<string, ExtIssueRef>>({});

    readonly extIssue = computed(() => this.extIssues()[this.trackedItem()?.id]);

    readonly #COL_CENTER = 140;

    readonly avg = computed(() => {
        const item = this.trackedItem();
        return Math.round(10 * (item.predictions?.length ? item.predictions.reduce((a, b) => a + b.qty, 0) / item.predictions.length : item.qty)) / 10;
    });

    readonly diff = computed(() => (this.avg() - this.trackedItem().qty) / this.trackedItem().qty);

    readonly col = computed(() => {
        const iCol = this.#COL_CENTER - this.#COL_CENTER * Math.min(1, Math.max(-1, this.diff()));
        return Color.fromHsl(iCol, 100, 60).toHexString();
    });

    readonly fociPercentage = computed(() => this.trackedItem().qty / (this.trackedItem().billed_foci_sum_duration || 1));

    readonly fociColor = computed(() => {
        const p = this.fociPercentage();
        const hue = p <= 0.6 ? 0 : ((p - 0.6) / 0.4) * 120;
        return Color.fromHsl(hue, 100, 50).toHexString();
    });
}
