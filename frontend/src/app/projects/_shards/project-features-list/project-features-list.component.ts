import { sanitizeHtml } from '@constants/html/sanitize-html';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { DecimalPipe, NgTemplateOutlet, PercentPipe } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Dictionary } from '@constants/constants';
import { GlobalService } from '@models/global.service';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { MilestoneState } from '@models/milestone/milestone-state.enum';
import { User } from '@models/user/user.model';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';

interface UserContribution {
    user: User | Dictionary | undefined;
    hours: number;
    percentage: number;
    color: string;
}
interface FeatureItemMeta {
    contributions: UserContribution[];
    safeText: SafeHtml;
    done: boolean;
    textColor: string;
    progressColor: string;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-features-list',
    templateUrl: './project-features-list.component.html',
    imports: [DecimalPipe, PercentPipe, NgTemplateOutlet, NgbTooltipModule, Nx, AvatarComponent],
})
export class ProjectFeaturesListComponent {
    project = input.required<Project>();
    includeInvoiced = input(false);

    #global = inject(GlobalService);
    #sanitizer = inject(DomSanitizer);
    #projectService = inject(ProjectService);

    #needsSeparateFetch = computed(() => this.includeInvoiced() || (this.project()?.state?.isFinishedAny() ?? false));

    #allItems = modelListResource(
        () => (this.#needsSeparateFetch() ? this.project()?.id || undefined : undefined),
        (id) => this.#projectService.indexFeatures(id),
    );

    unfocusedProgress = computed(() => {
        const project = this.project();
        return project?.hours_invested ? project.no_invoice_focus / project.hours_invested : 0;
    });
    focusedProgress = computed(() => 1 - this.unfocusedProgress());

    focusItems = computed(() => {
        if (this.#needsSeparateFetch()) {
            return [...this.#allItems.value()].sort(this.#compareFocusItems);
        }
        const items = this.project()?.invoice_items;
        if (!Array.isArray(items)) return [];
        return items.filter((item) => item?.type === InvoiceItemType.Default).sort(this.#compareFocusItems);
    });

    #featureMeta = computed(() => {
        const meta = new Map<string, FeatureItemMeta>();
        for (const item of this.focusItems()) {
            const milestones = item.milestones ?? [];
            const done = milestones.length > 0 && milestones.every((m) => m.state === MilestoneState.DONE);
            meta.set(item.id, {
                contributions: this.#computeUserContributions(item),
                safeText: this.#sanitizer.bypassSecurityTrustHtml(sanitizeHtml(item.text ?? '')),
                done,
                textColor: !milestones.length ? '' : done ? 'text-body-emphasis' : milestones.some((m) => m.state === MilestoneState.TODO) ? 'text-muted' : '',
                progressColor: !item.progress ? 'text-muted' : item.progress < 1 ? 'text-body-emphasis' : item.progress < 1.5 ? 'text-warning' : 'text-danger',
            });
        }
        return meta;
    });

    safeItemText = (item: InvoiceItem): SafeHtml | string => this.#featureMeta().get(item.id)?.safeText ?? '';
    allMilestonesDone = (item: InvoiceItem): boolean => this.#featureMeta().get(item.id)?.done ?? false;
    getItemTextColor = (item: InvoiceItem): string => this.#featureMeta().get(item.id)?.textColor ?? '';
    getProgressColorClass = (item: InvoiceItem): string => this.#featureMeta().get(item.id)?.progressColor ?? 'text-muted';
    getUserContributions = (item: InvoiceItem): UserContribution[] => this.#featureMeta().get(item.id)?.contributions ?? [];
    getUserName = (user: User | Dictionary | undefined): string => {
        if (!user) return 'Unknown';
        if (user instanceof User) return user.getName();
        return String(user['name'] || 'Unknown');
    };

    #compareFocusItems = (a: InvoiceItem, b: InvoiceItem): number => {
        const category = (item: InvoiceItem): number => {
            if (!item.milestones || item.milestones.length === 0) return 1;
            if (item.milestones.some((m) => m.state === MilestoneState.TODO || m.state === MilestoneState.IN_PROGRESS)) return 2;
            if (item.milestones.some((m) => !m.user_id)) return 3;
            if (item.milestones.every((m) => m.state === MilestoneState.DONE)) return 4;
            return 5;
        };
        return category(a) - category(b) || (b.progress ?? 0) - (a.progress ?? 0);
    };

    #computeUserContributions(item: InvoiceItem): UserContribution[] {
        if (!item.foci_by_user || item.foci_by_user.length === 0) return [];
        const project = this.project();
        const totalHours = item.foci_by_user.reduce((sum, f) => sum + f.duration, 0);
        const estimatedHours = (item.pt || 0) * 8;
        const maxValue = Math.max(totalHours, estimatedHours) || totalHours || 100;
        return item.foci_by_user
            .map((foci) => {
                const userData = project.timeline_chart?.find((tc) => tc.user?.id === foci.user_id);
                const user = userData?.user || this.#global.userFor(foci.user_id);
                return {
                    user,
                    hours: foci.duration,
                    percentage: maxValue > 0 ? (foci.duration / maxValue) * 100 : 0,
                    color: user?.color || '#cccccc',
                };
            })
            .sort((a, b) => b.hours - a.hours);
    }
}
