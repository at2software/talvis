import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dayjs } from '@constants/date/dates';
import { MarketingTouchpoint, TouchpointChannel, TouchpointOutcome, TouchpointResult } from '@models/marketing/marketing-touchpoint.model';
import type { TouchpointPayloadDto } from '@models/_core/api-response';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'touchpoint-form',
    templateUrl: './touchpoint-form.component.html',
    imports: [FormsModule],
})
export class TouchpointFormComponent {
    initialChannel = input<TouchpointChannel>('call');
    channelLocked = input(false);
    withRetry = input(true);
    busy = input(false);
    submitted = output<TouchpointPayloadDto>();

    readonly channels = MarketingTouchpoint.CHANNELS;
    readonly outcomes = MarketingTouchpoint.OUTCOMES;

    channel = linkedSignal(() => this.initialChannel());
    result = linkedSignal<TouchpointChannel, TouchpointResult | undefined>({ source: this.channel, computation: () => undefined });
    outcome = linkedSignal<TouchpointResult | undefined, TouchpointOutcome | undefined>({ source: this.result, computation: () => undefined });
    notes = signal('');
    retryAt = signal(this.#nextWorkday());

    results = computed(() => MarketingTouchpoint.resultsFor(this.channel()));
    showOutcome = computed(() => MarketingTouchpoint.REACHED.includes(this.result()!));
    showRetry = computed(() => this.withRetry() && (MarketingTouchpoint.ATTEMPTS.includes(this.result()!) || this.outcome() === 'callback'));
    canSubmit = computed(() => !!this.result() && (this.result() !== 'connected' || !!this.outcome()) && !this.busy());

    submit() {
        if (!this.canSubmit()) return;
        this.submitted.emit({
            channel: this.channel(),
            result: this.result()!,
            outcome: this.showOutcome() ? (this.outcome() ?? null) : null,
            notes: this.notes().trim() || null,
            retry_at: this.showRetry() ? this.retryAt() : null,
        });
    }

    reset() {
        this.result.set(undefined);
        this.notes.set('');
        this.retryAt.set(this.#nextWorkday());
    }

    #nextWorkday() {
        const tomorrow = dayjs().add(1, 'day');
        const offset = ({ 6: 2, 0: 1 } as Record<number, number>)[tomorrow.day()] ?? 0;
        return tomorrow.add(offset, 'day').format('YYYY-MM-DD');
    }
}
