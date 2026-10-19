import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Company } from '@models/company/company.model';
import { WidgetService } from '@models/widget.service';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';
import { Project } from '@models/project/project.model';
import { REFLECTION } from '@constants/constants';
import { WIDGET_SHARED } from '../widgets.shared';
import { PermissionsDirective } from '@directives/permissions.directive';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-prepared-invoices',
    templateUrl: './widget-prepared-invoices.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetPreparedInvoicesComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({ ...WidgetOptions.maxItems, ...WidgetOptions.chartOnly });

    readonly #prepared = this.optionsResource((options) => this.#widgetService.preparedInvoices(options), this.hasInvoicesExpenses);
    readonly data = computed<(Company | Project)[]>(() =>
        Object.values(this.#prepared.value() ?? {})
            .map((x) => {
                const c = REFLECTION(x);
                if (c instanceof Company) c.actions[0].action = () => c.navigateTo(`/customers/${c.id}/billing`);
                if (c instanceof Project) c.actions[0].action = () => c.navigateTo(`/projects/${c.id}/invoicing`);
                return c;
            })
            .filter((a): a is Company | Project => a instanceof Company || a instanceof Project)
            .sort((a, b) => this.#getAppliedNet(b) - this.#getAppliedNet(a))
            .filter((a) => this.#getAppliedNet(a) > 0),
    );
    override value = this.headline(this.#prepared, () => this.data().reduce((a, b) => a + this.#getAppliedNet(b), 0));

    #getAppliedNet(_: Company | Project): number {
        return _.net_remaining || 0;
    }

    getAppliedNet = (_: Company | Project) => this.#getAppliedNet(_);
    asProject = (_: Company | Project) => _ as Project;

    exceedsMaxItems = (i: number): boolean => i >= ((this.options()['max-items']?.value as number) ?? 0);
}
