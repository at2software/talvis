import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Nx } from '@app/nx/nx.directive';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { modelListResource } from '@models/http/model-resource';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { MoneyPipe } from '@pipes/money.pipe';
import { SafePipe } from '@pipes/safe.pipe';

const INTERVAL_LABELS: Record<number, string> = {
    [InvoiceItemType.Daily]: $localize`:@@i18n.common.daily:daily`,
    [InvoiceItemType.Weekly]: $localize`:@@i18n.common.weekly:weekly`,
    [InvoiceItemType.Monthly]: $localize`:@@i18n.common.monthly:monthly`,
    [InvoiceItemType.Quarterly]: $localize`:@@i18n.recurrence.quarterly:quarterly`,
    [InvoiceItemType.Yearly]: $localize`:@@i18n.common.yearly:yearly`,
};

/** Subscriptions of a project: its repeating items, which seed the recurring (stage 1) items. */
@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-subscriptions-card',
    imports: [DatePipe, RouterLink, Nx, MoneyPipe, SafePipe],
    templateUrl: './project-subscriptions-card.component.html',
})
export class ProjectSubscriptionsCardComponent {
    #projectService = inject(ProjectService);

    project = input.required<Project>();

    readonly #items = modelListResource(
        () => this.project()?.id || undefined,
        (projectId) => this.#projectService.indexRepeatingItems(projectId),
    );
    readonly items = this.#items.value;
    readonly isLoaded = computed(() => this.#items.hasValue());
    readonly quoteLink = computed(() => ['/projects', this.project().id, 'invoicing', 'quote']);

    intervalLabel = (item: InvoiceItem): string => INTERVAL_LABELS[item.type] ?? item.getRepeatString();

    reload = () => this.#items.reload();
}
