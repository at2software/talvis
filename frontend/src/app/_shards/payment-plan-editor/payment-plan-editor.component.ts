import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { modelResource } from '@models/http/model-resource';

import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GlobalService } from '@models/global.service';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Serializable } from '@models/_core/serializable';
import { ParamService } from '@models/param/param.service';
import { ParamValueDto } from '@models/_core/api-response';

export interface PaymentPlanStep {
    percentage: number;
    amount?: number;
    trigger: 'acceptance' | 'project_start' | 'feature_complete' | 'monthly' | 'yearly';
    months?: number;
    years?: number;
}

const TRIGGER_ORDER: Dictionary<number> = { project_start: 0, monthly: 1, yearly: 2, feature_complete: 3, acceptance: 4 };
export function sortSteps<T extends { trigger: string }>(steps: T[]): T[] {
    return [...steps].sort((a, b) => (TRIGGER_ORDER[a.trigger] ?? 99) - (TRIGGER_ORDER[b.trigger] ?? 99));
}

export function paymentPlanTriggerLabel(step: { trigger: string; months?: number | null; month_index?: number | null; years?: number | null; year_index?: number | null }): string {
    switch (step.trigger) {
        case 'project_start':
            return $localize`:@@i18n.payment.triggerProjectStart:upon project start`;
        case 'feature_complete':
            return $localize`:@@i18n.payment.triggerFeatureComplete:upon feature complete`;
        case 'acceptance':
            return $localize`:@@i18n.payment.triggerAcceptance:upon acceptance`;
        case 'monthly':
            return step.month_index
                ? $localize`:@@i18n.payment.triggerMonthlyNth:monthly prepayment ${step.month_index}:index: of ${step.months ?? 0}:total: after project start`
                : $localize`:@@i18n.payment.triggerMonthly:${step.months ?? 0} monthly prepayments after project start`;
        case 'yearly':
            return step.year_index
                ? $localize`:@@i18n.payment.triggerYearlyNth:yearly prepayment ${step.year_index}:index: of ${step.years ?? 0}:total: after project start`
                : $localize`:@@i18n.payment.triggerYearly:${step.years ?? 0} yearly prepayments after project start`;
        default:
            return step.trigger;
    }
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'payment-plan-editor',
    templateUrl: './payment-plan-editor.component.html',
    styleUrls: ['./payment-plan-editor.component.scss'],
    imports: [FormsModule, NgbTooltipModule, DecimalPipe],
})
export class PaymentPlanEditorComponent {
    object = input<Serializable>();

    editSteps: PaymentPlanStep[] = [];
    isEditing = signal(false);

    #paramService = inject(ParamService);
    readonly currency = inject(GlobalService).currencySymbol;

    readonly #plan = modelResource(
        () => this.object()?.id || undefined,
        () => this.object()!.showParam('PROJECT_PAYMENT_PLAN', { fallback: false }) as Observable<ParamValueDto>,
    );
    readonly #tiers = modelResource(
        () => (this.#plan.hasValue() && !this.#plan.value()?.value ? 'params/PROJECT_PAYMENT_PLAN_TIERS' : undefined),
        (key) => this.#paramService.show(key),
    );

    readonly #resolved = computed(() => {
        const own = this.#plan.hasValue() ? this.#plan.value()?.value : undefined;
        if (own) return { steps: sortSteps(this.#parseSteps(own)), isFallback: false, label: '' };
        if (!this.#tiers.hasValue()) return { steps: [] as PaymentPlanStep[], isFallback: false, label: '' };

        const budget = (this.object() as unknown as { net?: number } | undefined)?.net ?? 0;
        const tiers = this.#parseTiers(this.#tiers.value()?.value);
        const tier = tiers.find((t) => t.threshold === null || budget < t.threshold) ?? tiers[tiers.length - 1];
        return { steps: sortSteps(tier?.steps ?? []), isFallback: true, label: tier?.label ?? '' };
    });
    readonly #state = linkedSignal(this.#resolved);

    steps = computed(() => this.#state().steps);
    isFallback = computed(() => this.#state().isFallback);
    activeTierLabel = computed(() => this.#state().label);

    startEdit() {
        this.editSteps = this.steps().map((s) => ({ ...s }));
        if (this.editSteps.length === 0) {
            this.editSteps = [{ percentage: 100, trigger: 'acceptance' }];
        }
        this.isEditing.set(true);
    }

    cancelEdit() {
        this.isEditing.set(false);
        this.editSteps = [];
    }

    save() {
        if (!this.isBalanced || !this.object) return;
        this.editSteps = sortSteps(this.editSteps.map((s) => this.#normalized(s)));
        const json = JSON.stringify(this.editSteps);
        this.object()
            ?.updateParam('PROJECT_PAYMENT_PLAN', { value: json })
            .subscribe(() => {
                this.#state.set({ steps: this.editSteps.map((s) => ({ ...s })), isFallback: false, label: '' });
                this.isEditing.set(false);
            });
    }

    revertToDefault() {
        this.object()
            ?.updateParam('PROJECT_PAYMENT_PLAN', { value: null })
            .subscribe(() => this.#plan.reload());
    }

    addStep() {
        this.editSteps.push({ percentage: 0, trigger: 'acceptance' });
    }

    removeStep(index: number) {
        this.editSteps.splice(index, 1);
    }

    onTriggerChange(step: PaymentPlanStep) {
        if (step.trigger === 'monthly' && !step.months) step.months = 6;
        if (step.trigger === 'yearly' && !step.years) step.years = 3;
        if (step.trigger !== 'monthly') delete step.months;
        if (step.trigger !== 'yearly') delete step.years;
    }

    repeatsOf = (step: PaymentPlanStep): number => Math.max(1, (step.trigger === 'monthly' ? Number(step.months) : step.trigger === 'yearly' ? Number(step.years) : 0) || 0);

    unitOf = (step: PaymentPlanStep): 'percent' | 'amount' => (step.amount === undefined ? 'percent' : 'amount');

    setUnit(step: PaymentPlanStep, unit: 'percent' | 'amount') {
        if (unit === 'amount') {
            step.amount = Math.round((this.net * (Number(step.percentage) || 0)) / this.repeatsOf(step)) / 100;
            step.percentage = 0;
        } else {
            step.percentage = this.net > 0 ? Math.round(((step.amount ?? 0) * this.repeatsOf(step) / this.net) * 10000) / 100 : 0;
            delete step.amount;
        }
    }

    stepTotal = (step: PaymentPlanStep): number => (step.amount !== undefined ? (Number(step.amount) || 0) * this.repeatsOf(step) : (this.net * (Number(step.percentage) || 0)) / 100);

    getTriggerLabel = (step: PaymentPlanStep): string => paymentPlanTriggerLabel(step);

    get net(): number {
        return (this.object() as unknown as { net?: number } | undefined)?.net ?? 0;
    }

    get hasAmountSteps(): boolean {
        return this.editSteps.some((s) => s.amount !== undefined);
    }

    get totalPercentage(): number {
        return this.editSteps.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
    }

    get totalAmount(): number {
        return this.editSteps.reduce((sum, s) => sum + this.stepTotal(s), 0);
    }

    get isBalanced(): boolean {
        if (!this.hasAmountSteps) return this.totalPercentage === 100;
        return this.net > 0 && Math.abs(this.totalAmount - this.net) <= 0.01;
    }

    #normalized(step: PaymentPlanStep): PaymentPlanStep {
        return step.amount === undefined ? { ...step } : { ...step, amount: Number(step.amount) || 0, percentage: 0 };
    }

    #parseSteps(value: unknown): PaymentPlanStep[] {
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

    #parseTiers(value: unknown): { label: string; threshold: number | null; steps: PaymentPlanStep[] }[] {
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
