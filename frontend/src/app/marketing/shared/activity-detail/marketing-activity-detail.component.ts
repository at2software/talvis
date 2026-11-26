import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { MarketingService } from '@models/marketing/marketing.service';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { MarketingInitiative } from '@models/marketing/marketing-initiative.model';
import { MarketingWorkflow } from '@models/marketing/marketing-workflow.model';
import { IActivityBase } from '@models/marketing/activity-base.interface';
import { MarketingActivity, QuickActionType } from '@models/marketing/marketing-activity.model';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { I18nTextareaComponent } from '@app/_shards/i18n-textarea/i18n-textarea.component';

type ActivityMode = 'initiative' | 'workflow';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-activity-detail',
    templateUrl: './marketing-activity-detail.component.html',
    imports: [FormsModule, NgbDropdownModule, NgbTooltipModule, SpinnerComponent, I18nTextareaComponent],
})
export class MarketingActivityDetailComponent {
    #route = inject(ActivatedRoute);
    #marketingService = inject(MarketingService);

    readonly mode: ActivityMode = this.#route.snapshot.data['mode'] ?? 'initiative';

    #target = toSignal(this.#route.params.pipe(map((params) => {
        const parentId = this.#route.parent?.snapshot.params['id'] as string | undefined;
        const activityId = params['activityId'] as string | undefined;
        return parentId && activityId ? { parentId, activityId } : undefined;
    })));

    #context = modelResource(
        () => this.#target()?.parentId,
        (parentId): Observable<MarketingInitiative | MarketingWorkflow> =>
            this.mode === 'initiative' ? this.#marketingService.showInitiative(parentId) : this.#marketingService.showWorkflow(parentId),
    );

    context = this.#context.value;
    isLoading = this.#context.isLoading;
    isSaving = signal(false);
    availableMetrics = modelListResource(() => this.#marketingService.indexMetrics()).value;

    editName = '';
    editDayOffset = 0;
    editDescription: string | { language: string; formality: string; text: string }[] = '';
    editIsRequired = false;
    editHasExternalDependency = false;
    editIsShared = false;
    editParentActivityId = signal('');
    editQuickAction = signal<QuickActionType>(null);
    selectedKpiId = signal('');

    readonly quickActions: { value: QuickActionType; label: string; icon?: string }[] = [
        { value: null, label: 'none' },
        ...MarketingActivity.QUICK_ACTIONS.map((value) => ({ value, label: MarketingActivity.quickActionLabel(value), icon: MarketingActivity.quickActionIcon(value) })),
    ];

    readonly siblingActivities = computed<IActivityBase[]>(() => {
        const ctx = this.context();
        if (!ctx) return [];
        return 'initiative_activities' in ctx
            ? (ctx as MarketingInitiative).initiative_activities ?? []
            : (ctx as MarketingWorkflow).marketing_activities ?? [];
    });

    readonly #loadedActivity = computed<IActivityBase | null>(() => {
        const activityId = this.#target()?.activityId;
        return this.siblingActivities().find((a) => String(a.id) === activityId) ?? null;
    });

    activity = linkedSignal(() => this.#loadedActivity());

    readonly selectedQuickAction = computed(() => {
        const value = this.editQuickAction();
        return this.quickActions.find((qa) => qa.value === value) ?? this.quickActions[0];
    });

    readonly selectedMetric = computed(() => {
        const kpiId = this.selectedKpiId();
        return this.availableMetrics().find((m) => String(m.id) === kpiId) ?? null;
    });

    readonly selectedParentActivityLabel = computed<string>(() => {
        const parentId = this.editParentActivityId();
        if (!parentId) return 'none';
        const a = this.siblingActivities().find((a) => String(a.id) === parentId);
        return a ? `D${a.day_offset} – ${a.name}` : 'none';
    });

    constructor() {
        effect(() => {
            const activity = this.#loadedActivity();
            if (activity) untracked(() => this.#populateForm(activity));
        });
    }

    #populateForm(activity: IActivityBase) {
        this.editName = activity.name;
        this.editDayOffset = activity.day_offset;
        this.editDescription = activity.description ?? '';
        this.editIsRequired = activity.is_required;
        this.editHasExternalDependency = activity.has_external_dependency ?? false;
        this.editIsShared = activity.is_shared ?? false;
        this.editParentActivityId.set(activity.parent_activity_id != null ? String(activity.parent_activity_id) : '');
        this.editQuickAction.set(activity.quick_action ?? null);
        this.selectedKpiId.set(activity.performance_metrics?.[0]?.id?.toString() ?? '');
    }

    saveActivity() {
        const activity = this.activity();
        const ctx = this.context();
        if (!activity || !ctx) return;

        this.isSaving.set(true);
        const parentId = String(ctx.id);
        const activityId = String(activity.id);
        const prevMetricId = activity.performance_metrics?.[0]?.id?.toString() ?? '';

        const payload = {
            name: this.editName,
            day_offset: this.editDayOffset,
            description: this.editDescription || null,
            is_required: this.editIsRequired,
            has_external_dependency: this.editHasExternalDependency,
            is_shared: this.editIsShared,
            parent_activity_id: this.editParentActivityId() || null,
            quick_action: this.editQuickAction(),
        };

        const save$: Observable<IActivityBase> = this.mode === 'initiative'
            ? this.#marketingService.updateInitiativeActivity(parentId, activityId, payload)
            : this.#marketingService.updateWorkflowActivity(parentId, activityId, payload);

        save$.pipe(
            switchMap((updated: IActivityBase) => {
                this.activity.set(updated);
                return this.#syncMetric(parentId, activityId, prevMetricId);
            })
        ).subscribe({
            next: () => {
                if (this.mode === 'initiative') {
                    this.#marketingService.initiativeActivitySaved$.next(parentId);
                } else {
                    this.#marketingService.workflowActivitySaved$.next(parentId);
                }
                this.isSaving.set(false);
            },
            error: () => this.isSaving.set(false),
        });
    }

    #syncMetric(parentId: string, activityId: string, prevMetricId: string): Observable<unknown> {
        const selectedKpiId = this.selectedKpiId();
        if (prevMetricId === selectedKpiId) return of(null);
        const ops: Observable<unknown>[] = [];
        if (this.mode === 'initiative') {
            if (prevMetricId) ops.push(this.#marketingService.detachMetricFromInitiativeActivity(parentId, activityId, prevMetricId));
            if (selectedKpiId) ops.push(this.#marketingService.attachMetricToInitiativeActivity(parentId, activityId, { metric_id: selectedKpiId }));
        } else {
            if (prevMetricId) ops.push(this.#marketingService.detachMetricFromActivity(activityId, prevMetricId));
            if (selectedKpiId) ops.push(this.#marketingService.attachMetricToActivity(activityId, { metric_id: selectedKpiId }));
        }
        return ops.length ? forkJoin(ops) : of(null);
    }
}
