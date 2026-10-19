import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { PermissionsDirective } from '@directives/permissions.directive';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-project-success',
    templateUrl: './widget-project-success.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetProjectSuccessComponent extends BaseWidgetComponent {}
