import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ProgressBarComponent } from '@shards/progress-bar/progress-bar.component';
import { ValueUnitComponent } from '../value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'stat-card',
    templateUrl: './stat-card.component.html',
    styleUrls: ['./stat-card.component.scss'],
    imports: [ValueUnitComponent, ProgressBarComponent],
})
export class StatCardComponent {
    label = input.required<string>();
    value = input.required<string | number>();
    unit = input<string>();
    icon = input.required<string>();
    color = input('cyan');
    hint = input<string>();
    progress = input<number>();

    isZero = computed(() => /^0+([.,]0+)?\s*%?$/.test(String(this.value()).trim()));
}
