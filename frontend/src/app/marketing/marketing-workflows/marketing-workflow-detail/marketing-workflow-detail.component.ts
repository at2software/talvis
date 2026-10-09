import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingActivity } from '@models/marketing/marketing-activity.model';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { IActivityBase } from '@models/marketing/activity-base.interface';
import { Nx } from '@app/nx/nx.directive';
import { I18nTextareaComponent } from '@app/_shards/i18n-textarea/i18n-textarea.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { ActivityTableComponent } from '@app/marketing/shared/activity-table/activity-table.component';
import { Dictionary } from '@constants/constants';
import { Toast } from '@shards/toast/toast';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';

const ActivityStatsColors = MarketingActivity.STATS_COLORS;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-workflow-detail',
    templateUrl: './marketing-workflow-detail.component.html',
    styleUrl: './marketing-workflow-detail.component.scss',
    imports: [NgTemplateOutlet, FormsModule, RouterModule, Nx, NgbTooltipModule, ActivityTableComponent, I18nTextareaComponent, ScrollbarComponent, EmptyStateComponent],
})
export class MarketingWorkflowDetailComponent {
    #marketingService = inject(MarketingService);
    #route = inject(ActivatedRoute);
    #router = inject(Router);
    #confirm = inject(ConfirmationService);

    #workflowId = toSignal(this.#route.params.pipe(map((params) => params['id'] as string | undefined)));
    #workflow = modelResource(this.#workflowId, (id) => this.#marketingService.showWorkflow(id));
    selectedWorkflow = this.#workflow.value;

    availableMetrics = modelListResource(() => this.#marketingService.indexMetrics()).value;

    readonly STATS_COLORS = ActivityStatsColors;

    showActivityModal = signal(false);
    editingActivity: MarketingActivity | null = null;
    newActivity: Partial<MarketingActivity> = {
        name: '',
        day_offset: 1,
        description: '',
        is_required: true,
        quick_action: null,
    };

    constructor() {
        this.#marketingService.workflowActivitySaved$
            .pipe(takeUntilDestroyed())
            .subscribe((workflowId) => {
                if (String(this.#workflowId()) === workflowId) this.#workflow.reload();
            });

        effect(() => {
            const first = this.selectedWorkflow()?.marketing_activities?.[0];
            if (first && !this.#route.firstChild) this.#router.navigate(['activity', first.id], { relativeTo: this.#route });
        });
    }

    loadWorkflow = () => this.#workflow.reload();

    createActivity() {
        const wf = this.selectedWorkflow();
        if (!wf || !this.newActivity.name) return;

        if (this.editingActivity) {
            this.#marketingService
                .updateWorkflowActivity(wf.id, this.editingActivity.id, {
                    name: this.newActivity.name,
                    day_offset: this.newActivity.day_offset!,
                    description: this.newActivity.description,
                    is_required: this.newActivity.is_required ?? true,
                    quick_action: this.newActivity.quick_action,
                    parent_activity_id: this.newActivity.parent_activity_id || null,
                })
                .subscribe(() => {
                    this.loadWorkflow();
                    this.resetActivityForm();
                });
        } else {
            this.#marketingService
                .storeWorkflowActivity(wf.id, {
                    name: this.newActivity.name,
                    day_offset: this.newActivity.day_offset!,
                    description: this.newActivity.description || '',
                    is_required: this.newActivity.is_required ?? true,
                    quick_action: this.newActivity.quick_action,
                    parent_activity_id: this.newActivity.parent_activity_id || null,
                })
                .subscribe(() => {
                    this.loadWorkflow();
                    this.resetActivityForm();
                });
        }
    }

    openEditActivityModal(activity: IActivityBase) {
        if (!('marketing_workflow_id' in activity) || !activity.marketing_workflow_id) {
            console.warn('Cannot edit initiative activities from workflow view');
            return;
        }

        this.editingActivity = activity as MarketingActivity;
        this.newActivity = {
            name: activity.name,
            day_offset: activity.day_offset,
            description: activity.description,
            is_required: activity.is_required,
            quick_action: activity.quick_action || null,
            parent_activity_id: activity.parent_activity_id || undefined,
        };
        this.showActivityModal.set(true);
    }

    async deleteActivity(activity: MarketingActivity) {
        const wf = this.selectedWorkflow();
        if (!wf) return;
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.delete:delete`, message: $localize`:@@i18n.marketing.confirmDeleteActivity:delete activity "${activity.name}"?` }))) return;

        this.#marketingService.destroyWorkflowActivity(wf.id, activity.id).subscribe(() => this.loadWorkflow());
    }

    resetActivityForm() {
        this.showActivityModal.set(false);
        this.editingActivity = null;
        this.newActivity = {
            name: '',
            day_offset: 1,
            description: '',
            is_required: true,
            quick_action: null,
            parent_activity_id: undefined,
        };
    }

    getRootActivities(): MarketingActivity[] {
        return this.selectedWorkflow()?.marketing_activities?.filter((a) => !a.parent_activity_id) ?? [];
    }

    getChildActivities(parentId: string): MarketingActivity[] {
        return this.selectedWorkflow()?.marketing_activities?.filter((a) => a.parent_activity_id === parentId) ?? [];
    }

    getAbsoluteDay(activity: MarketingActivity): number {
        if (!activity.parent_activity_id) return activity.day_offset;
        const parent = this.selectedWorkflow()?.marketing_activities?.find((a) => a.id === activity.parent_activity_id);
        return parent ? this.getAbsoluteDay(parent) + activity.day_offset : activity.day_offset;
    }

    onActivityActionResolved = () => this.loadWorkflow();

    onDependencyAdded(event: { sourceId: string; targetId: string }) {
        const wf = this.selectedWorkflow();
        if (!wf) return;
        const targetActivity = wf.marketing_activities?.find((a) => a.id === event.targetId);
        if (!targetActivity) return;
        this.#marketingService.updateWorkflowActivity(wf.id, targetActivity.id, { parent_activity_id: event.sourceId }).subscribe({
            next: () => this.loadWorkflow(),
            error: () => Toast.error($localize`:@@i18n.marketing.dependencyCreateFailed:failed to create dependency – please try again`),
        });
    }

    async onDependencyRemoved(event: { activityId: string }) {
        const wf = this.selectedWorkflow();
        if (!wf) return;
        const activity = wf.marketing_activities?.find((a) => a.id === event.activityId);
        if (!activity || !activity.parent_activity_id) return;
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.remove:remove`, message: $localize`:@@i18n.marketing.confirmRemoveDependency:remove dependency from "${activity.name}"?` }))) return;
        this.#marketingService.updateWorkflowActivity(wf.id, activity.id, { parent_activity_id: null }).subscribe({
            next: () => this.loadWorkflow(),
            error: () => Toast.error($localize`:@@i18n.marketing.dependencyRemoveFailed:failed to remove dependency – please try again`),
        });
    }

    getQuickActionIcon(qa: string): string {
        const icons: Dictionary<string> = { EMAIL: 'email', LINKEDIN: 'open_in_new', LINKEDIN_SEARCH: 'search', CALL: 'phone' };
        return icons[qa] || '';
    }
}
