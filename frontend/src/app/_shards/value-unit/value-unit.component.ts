import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const TRAILING_UNIT = /^(.*[\d■][KMBT]?)\s*([^\d■]+)$/;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'value-unit',
    template: `{{ parts().amount }}@if (parts().unit) {<span class="text-lowercase text-muted fs-6">{{ parts().unit }}</span>}`,
})
export class ValueUnitComponent {
    value = input.required<string | number | null | undefined>();
    unit = input<string>();

    parts = computed(() => {
        const value = String(this.value() ?? '').trim();
        if (this.unit()) return { amount: value, unit: this.unit() };
        const match = TRAILING_UNIT.exec(value);
        return match ? { amount: match[1], unit: match[2].trim() } : { amount: value, unit: '' };
    });
}
