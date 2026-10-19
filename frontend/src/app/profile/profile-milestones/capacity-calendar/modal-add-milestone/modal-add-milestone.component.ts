import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { Project } from '@models/project/project.model';
import { Company } from '@models/company/company.model';

const DEFAULT_WORKLOAD_HOURS = 8;

export interface AddMilestoneResult {
    name: string;
    workload_hours: number;
    started_at: string;
    due_at: string;
    project: Project;
}

export interface InboxStep {
    name: string;
    description?: string;
    link?: string;
    linked?: Project | Company;
    index: number;
    total: number;
}

export type InboxDecision = 'skip' | 'discard';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-add-milestone',
    templateUrl: './modal-add-milestone.component.html',
    imports: [FormsModule, AvatarComponent],
})
export class ModalAddMilestoneComponent extends ModalBaseComponent<AddMilestoneResult | InboxDecision> {
    #activeModal = inject(NgbActiveModal);

    projects = signal<Project[]>([]);

    projectId = signal('');
    name = signal('');
    workloadHours = signal(DEFAULT_WORKLOAD_HOURS);
    startedAt = signal('');
    dueAt = signal('');
    inboxStep = signal<InboxStep | undefined>(undefined);

    readonly selectedProject = computed(() => this.projects().find((p) => String(p.id) === this.projectId()));

    init(projects: Project[], date: string, inboxStep?: InboxStep): void {
        this.inboxStep.set(inboxStep);
        this.name.set(inboxStep?.name ?? '');
        this.projects.set(projects);
        this.projectId.set(String((inboxStep?.linked instanceof Project ? inboxStep.linked.id : undefined) ?? (inboxStep && this.#projectMentionedIn(inboxStep.name, projects)) ?? projects[0]?.id ?? ''));
        this.startedAt.set(date);
        this.dueAt.set(date);
    }

    #projectMentionedIn(text: string, projects: Project[]): string | undefined {
        const haystack = text.toLowerCase();
        return projects
            .filter((p) => p.name && haystack.includes(p.name.toLowerCase()))
            .sort((a, b) => b.name.length - a.name.length)[0]?.id;
    }

    fillWholeProject(): void {
        const project = this.selectedProject();
        if (!project) return;
        this.name.set(project.name);
        this.workloadHours.set(project.wholeProjectHours() ?? DEFAULT_WORKLOAD_HOURS);
    }

    skip = () => this.#activeModal.close('skip' satisfies InboxDecision);
    discard = () => this.#activeModal.close('discard' satisfies InboxDecision);

    canSubmit = (): boolean => !!this.selectedProject() && !!this.name().trim() && this.workloadHours() > 0 && !!this.startedAt() && !!this.dueAt();

    onSuccess(): AddMilestoneResult {
        return {
            name: this.name().trim(),
            workload_hours: this.workloadHours(),
            started_at: this.startedAt(),
            due_at: this.dueAt(),
            project: this.selectedProject()!,
        };
    }
}
