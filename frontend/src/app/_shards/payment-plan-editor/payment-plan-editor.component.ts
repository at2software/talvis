import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { modelResource } from '@models/http/model-resource';

import { FormsModule } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Serializable } from '@models/_core/serializable';
import { ParamService } from '@models/param/param.service';
import { ParamValueDto } from '@models/_core/api-response';

export interface PaymentPlanStep {
    percentage: number;
    trigger: 'acceptance' | 'project_start' | 'feature_complete' | 'monthly';
    months?: number;
}

const TRIGGER_ORDER: Dictionary<number> = { project_start: 0, monthly: 1, feature_complete: 2, acceptance: 3 };
export function sortSteps<T extends { trigger: string }>(steps: T[]): T[] {
    return [...steps].sort((a, b) => (TRIGGER_ORDER[a.trigger] ?? 99) - (TRIGGER_ORDER[b.trigger] ?? 99));
}

export function paymentPlanTriggerLabel(step: { trigger: string; months?: number | null; month_index?: number | null }): string {
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
        default:
            return step.trigger;
    }
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'payment-plan-editor',
    templateUrl: './payment-plan-editor.component.html',
    styleUrls: ['./payment-plan-editor.component.scss'],
    imports: [FormsModule, NgbTooltipModule],
})
export class PaymentPlanEditorComponent {
    object = input<Serializable>();

    editSteps: PaymentPlanStep[] = [];
    isEditing = signal(false);

    #paramService = inject(ParamService);

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
        if (this.totalPercentage !== 100 || !this.object) return;
        this.editSteps = sortSteps(this.editSteps);
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
        if (step.trigger === 'monthly' && !step.months) {
            step.months = 6;
        } else if (step.trigger !== 'monthly') {
            delete step.months;
        }
    }

    getTriggerLabel = (step: PaymentPlanStep): string => paymentPlanTriggerLabel(step);

    get totalPercentage(): number {
        return this.editSteps.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
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
