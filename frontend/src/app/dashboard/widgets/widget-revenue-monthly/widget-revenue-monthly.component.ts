import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-revenue-monthly',
    templateUrl: './widget-revenue-monthly.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED],
})
export class WidgetRevenueMonthlyComponent extends BaseWidgetComponent {
    data = signal<any>(null);
}
