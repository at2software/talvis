import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { modelListResource } from '@models/http/model-resource';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingWorkflow } from '@models/marketing/marketing-workflow.model';
import { MarketingActivity } from '@models/marketing/marketing-activity.model';
import { Nx } from '@app/nx/nx.directive';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

const ActivityStatsColors = MarketingActivity.STATS_COLORS;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-workflows',
    templateUrl: './marketing-workflows.component.html',
    styleUrl: './marketing-workflows.component.scss',
    imports: [FormsModule, Nx, RouterModule, NgbTooltipModule, EmptyStateComponent, GuidedTourComponent, SpinnerComponent],
})
export class MarketingWorkflowsComponent {
    #marketingService = inject(MarketingService);
    #route = inject(ActivatedRoute);
    #router = inject(Router);
    #confirm = inject(ConfirmationService);
    #destroyRef = inject(DestroyRef);

    readonly STATS_COLORS = ActivityStatsColors;

    #loaded = modelListResource(() => this.#marketingService.indexWorkflows());
    workflows = linkedSignal(() => this.#loaded.value());
    workflowsLoaded = this.#loaded.hasValue;
    currentWorkflowId: string | null = null;

    showCreateModal = signal(false);
    newWorkflow: Partial<MarketingWorkflow> = {
        name: '',
        description: '',
        is_active: true,
    };

    constructor() {
        this.#route.firstChild?.params.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((params) => {
            this.currentWorkflowId = params['id'] || null;
        });

        effect(() => {
            const first = this.workflows()[0];
            if (first && !this.currentWorkflowId) this.#router.navigate(['/marketing/workflows', first.id]);
        });
    }

    createWorkflow() {
        if (!this.newWorkflow.name) return;

        this.#marketingService
            .storeWorkflow({
                name: this.newWorkflow.name!,
                description: this.newWorkflow.description,
                is_active: this.newWorkflow.is_active ?? true,
            })
            .subscribe((workflow: MarketingWorkflow) => {
                this.workflows.update((arr) => [...arr, workflow]);
                this.resetCreateForm();
                this.#router.navigate(['/marketing/workflows', workflow.id]);
            });
    }

    async deleteWorkflow(workflow: MarketingWorkflow) {
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.delete:delete`, message: $localize`:@@i18n.marketing.confirmDeleteWorkflow:delete workflow "${workflow.name}"?` }))) return;

        this.#marketingService.destroyWorkflow(workflow.id).subscribe(() => {
            this.workflows.update((arr) => arr.filter((w) => w.id !== workflow.id));
            if (this.currentWorkflowId === workflow.id) {
                const remaining = this.workflows();
                if (remaining.length > 0) {
                    this.#router.navigate(['/marketing/workflows', remaining[0].id]);
                } else {
                    this.#router.navigate(['/marketing/workflows']);
                }
            }
        });
    }

    isWorkflowActive(workflowId: string): boolean {
        return this.currentWorkflowId === workflowId;
    }

    resetCreateForm() {
        this.showCreateModal.set(false);
        this.newWorkflow = {
            name: '',
            description: '',
            is_active: true,
        };
    }
}
