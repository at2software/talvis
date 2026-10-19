import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { ShortPipe } from '@pipes/short.pipe';
import { PermissionsDirective } from '@directives/permissions.directive';
import { EchartsRangeCardComponent } from '@charts/echarts-card/echarts-range-card.component';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-revenue-12',
    templateUrl: './widget-revenue-12.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, ShortPipe, PermissionsDirective],
})
export class WidgetRevenue12Component extends BaseWidgetComponent {
    readonly chart = viewChild(EchartsRangeCardComponent);
}
