import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { modelResource } from '@models/http/model-resource';

import { FormsModule } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { ParamService } from '@models/param/param.service';
import { Param } from '@models/param/param.model';
import { PaymentPlanStep, sortSteps } from './payment-plan-editor.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

export interface PaymentPlanTier {
    label: string;
    threshold: number | null; // null = catch-all (no upper limit)
    steps: PaymentPlanStep[];
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'payment-plan-tiers-editor',
    templateUrl: './payment-plan-tiers-editor.component.html',
    styleUrls: ['./payment-plan-editor.component.scss'],
    imports: [FormsModule, NgbTooltipModule, EmptyStateComponent, SpinnerComponent],
    host: { style: 'display:contents' },
})
export class PaymentPlanTiersEditorComponent {
    #paramService = inject(ParamService);

    readonly #tiers = modelResource(() => this.#paramService.show('params/PROJECT_PAYMENT_PLAN_TIERS'));
    loaded = computed(() => this.#tiers.hasValue() || this.#tiers.status() === 'error');
    tiers = linkedSignal<PaymentPlanTier[]>(() => {
        const tiers = this.#parseTiers(this.#tiers.hasValue() ? this.#tiers.value().value : undefined);
        for (const tier of tiers) tier.steps = sortSteps(tier.steps);
        return tiers;
    });

    save() {
        const tiers = this.tiers();
        for (const tier of tiers) tier.steps = sortSteps(tier.steps);
        const json = JSON.stringify(tiers);
        Param.write('params/PROJECT_PAYMENT_PLAN_TIERS', json).subscribe();
        this.#touch();
    }

    addTier() {
        this.tiers().push({ label: '', threshold: null, steps: [{ percentage: 100, trigger: 'acceptance' }] });
        this.save();
    }

    removeTier(index: number) {
        this.tiers().splice(index, 1);
        this.save();
    }

    addStep(tier: PaymentPlanTier) {
        const remaining = 100 - this.totalPercentage(tier);
        tier.steps.push({ percentage: remaining, trigger: 'acceptance' });
        this.save();
    }

    removeStep(tier: PaymentPlanTier, index: number) {
        tier.steps.splice(index, 1);
        this.#touch();
    }

    onTriggerChange(step: PaymentPlanStep) {
        if (step.trigger === 'monthly' && !step.months) step.months = 6;
        if (step.trigger === 'yearly' && !step.years) step.years = 3;
        if (step.trigger !== 'monthly') delete step.months;
        if (step.trigger !== 'yearly') delete step.years;
        this.#touch();
    }

    #touch() {
        this.tiers.update((tiers) => [...tiers]);
    }

    totalPercentage(tier: PaymentPlanTier): number {
        return tier.steps.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
    }

    getTriggerLabel(step: PaymentPlanStep): string {
        switch (step.trigger) {
            case 'project_start':
                return $localize`:@@i18n.payment.triggerProjectStart:upon project start`;
            case 'feature_complete':
                return $localize`:@@i18n.payment.triggerFeatureComplete:upon feature complete`;
            case 'acceptance':
                return $localize`:@@i18n.payment.triggerAcceptance:upon acceptance`;
            case 'monthly':
                return $localize`:@@i18n.payment.triggerMonthly:${step.months ?? 0} monthly prepayments after project start`;
            case 'yearly':
                return $localize`:@@i18n.payment.triggerYearly:${step.years ?? 0} yearly prepayments after project start`;
            default:
                return step.trigger;
        }
    }

    #parseTiers(value: unknown): PaymentPlanTier[] {
        if (!value) return [];
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch {
                return [];
            }
        }
        return [];
    }
}
