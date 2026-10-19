import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, effect, linkedSignal, signal, untracked, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { CustomerQuickstatsComponent } from '@app/customers/_shards/customer-quickstats/customer-quickstats.component';
import { ListGroupItemContactComponent } from '@app/customers/_shards/list-group-item-contact/list-group-item-contact.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ProjectComponent } from '@shards/project/project.component';
import { ActionEmitterType } from '@app/nx/nx.directive';
import { EchartsRangeCardComponent } from '@charts/echarts-card/echarts-range-card.component';
import { Comment } from '@models/comment/comment.model';
import { Company } from '@models/company/company.model';
import { CompanyContact } from '@models/company/company-contact.model';
import { CompanyService } from '@models/company/company.service';
import { Connection } from '@models/company/connection.model';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { VcardRow } from '@models/vcard/vcard-row';
import { NgbPopoverModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { RteComponent } from '@shards/rte/rte.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { dayjs } from '@constants/date/dates';
import { forkJoin, Observable } from 'rxjs';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { MoneyPipe } from '@pipes/money.pipe';
import { AssignmentService } from '@models/assignee/assignment.service';
import { User } from '@models/user/user.model';
import { GlobalService } from '@models/global.service';
import { ActivityService } from '@app/_activity/activity.service';
import { Serializable } from '@models/_core/serializable';
import { SafePipe } from '@pipes/safe.pipe';
import { VcardComponent } from '@app/customers/_shards/vcard/vcard.component';
import { MediaPreviewComponent } from '@app/projects/id/project-media/media-preview/media-preview.component';
import { CompactItemDirective } from '@shards/ul-compact/CompactItemDirective';
import { UlCompactComponent } from '@shards/ul-compact/ul-compact.component';
import { KnownseqCallerCardsComponent } from './knownseq-caller-cards.component';
import { modelListResource } from '@models/http/model-resource';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customers-known-sequitur',
    templateUrl: './customers-known-sequitur.component.html',
    styleUrls: ['./customers-known-sequitur.component.scss'],
    imports: [ValueUnitComponent, ToolbarComponent, ListGroupItemContactComponent, Nx, AvatarComponent, ProjectComponent, NgbPopoverModule, NgbDropdownModule, SearchInputComponent, NgTemplateOutlet, EchartsRangeCardComponent, VcardComponent, CustomerQuickstatsComponent, EmptyStateComponent, UlCompactComponent, CompactItemDirective, FormsModule, HotkeyDirective, MoneyPipe, MediaPreviewComponent, AvatarComponent, RteComponent, SafePipe, KnownseqCallerCardsComponent, SpinnerComponent],
})
export class CustomersKnownSequiturComponent {
    company = input.required<Company>();
    autoSelectContact = input(false);
    callerNumber = input('');
    #companyService = inject(CompanyService);
    #projectService = inject(ProjectService);
    #inputModalService = inject(InputModalService);
    #assignmentService = inject(AssignmentService);
    #global = inject(GlobalService);
    #activityService = inject(ActivityService);
    customer = signal<Company | undefined>(undefined);
    noCustomerFound: boolean = false;
    notes = signal<Comment[]>([]);
    selectedItem: Serializable | null = null;

    #projects = modelListResource(
        () => this.customer()?.id || undefined,
        () => this.#projectService.indexForCompany(untracked(this.customer)!),
    );
    #connections = modelListResource(
        () => this.customer()?.id || undefined,
        (companyId) => this.#companyService.showConnections(companyId),
    );
    projects = linkedSignal(() => this.#projects.value());
    projectsLoaded = this.#projects.hasValue;
    connections = linkedSignal<Connection[], Connection[]>({
        source: this.#connections.value,
        computation: (rows) => {
            const company = untracked(this.customer);
            if (company) rows.forEach((_) => _.addCompanyAction(_.otherCompany(company)));
            return rows;
        },
    });

    protected readonly Project = Project;
    protected readonly Company = Company;
    protected readonly CompanyContact = CompanyContact;

    constructor() {
        effect(() => {
            this.setCustomer(this.company());
        });
        afterNextRender(() => {
            const commentsTab = this.#activityService.tabs().find((tab) => tab.icon() === 'chat');
            if (commentsTab) {
                commentsTab.focus();
            }
        });
    }

    isSameItem = (a: Serializable | null | undefined, b: Serializable | null | undefined) => a?.apiPathWithId() === b?.apiPathWithId();

    #target = (note: Comment): Serializable | undefined => note.parent as Serializable | undefined;
    noteKey = (note: Comment): string => this.#target(note)?.apiPathWithId() ?? '';
    isSelected = (item: Serializable | null | undefined): boolean => !!item && this.isSameItem(this.selectedItem, item);

    onSearchResultSelect(_: Serializable & { company?: Company }) {
        let customerId = '';
        switch (_.class) {
            case 'Company':
                customerId = _.id;
                break;
            case 'CompanyContact':
                customerId = _.company!.id;
                break;
        }
        if (customerId != '') this.#companyService.show(customerId).subscribe((_) => this.setCustomer(_));
    }

    onAssignmentActions = (_e?: ActionEmitterType) => {
        this.#companyService.show(this.customer()!.id).subscribe((_) => this.customer.set(_));
    };

    setCustomer(company: Company) {
        this.customer.set(company);
        this.noCustomerFound = false;
        const commentData = {
            path: company.apiPathWithId(),
            parent: company,
        };
        const note = Comment.fromJson(commentData);
        note.parent = company;
        note.var.active = true;
        this.notes.set([note]);

        if (this.autoSelectContact()) {
            const contact = company.employees?.find((_) => !_.is_retired);
            if (contact) this.selectItem(contact);
        }
    }

    onQuickLinksLoaded(p: Project[]) {
        this.projects.set(p);
    }

    selectItem(item: Serializable, event?: Event): void {
        if (event) event.stopPropagation();

        const cust = this.customer();
        if (item instanceof Connection) {
            if (item.company1.id == cust?.id) item = item.company2;
            else if (item.company2.id == cust?.id) item = item.company1;
        }

        this.selectedItem = item;
        const key = item.apiPathWithId();
        this.notes.update(notes => {
            notes.forEach(n => (n.var.active = false));
            const existing = notes.find(n => this.noteKey(n) === key);
            if (existing) {
                existing.var.active = true;
                return [existing, ...notes.filter(n => n !== existing)];
            }
            const note = Comment.fromJson({ path: key, text: item instanceof Project ? item.description : '' });
            note.parent = item;
            note.var.active = true;
            return [note, ...notes];
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    replaceSlashes(_: string) {
        return _.replace('/', '_');
    }

    removeNote(item: Serializable) {
        const key = item.apiPathWithId();
        this.notes.update(notes => notes.filter(n => this.noteKey(n) !== key));
    }

    getItem(note: Serializable): Project | CompanyContact | Company | undefined {
        return this.#target(note as Comment) as Project | CompanyContact | Company | undefined;
    }

    createProject = (event: Event) => {
        event.stopPropagation();
        this.#inputModalService.open($localize`:@@i18n.customers.project_name:Project name`).confirmed(({ text }) => {
            this.#projectService.addProject(this.customer()!.id, text).subscribe((x) => this.projects.update(p => [...p, x]));
        });
    };

    createSubProject = (event: Event, parentProject: Project) => {
        event.stopPropagation();
        this.#inputModalService.open($localize`:@@i18n.customers.project_name:Project name`).confirmed(({ text }) => {
            this.#projectService.post(`companies/${this.customer()!.id}/projects`, { name: text, project_id: parentProject.id }).subscribe((x) => this.projects.update(p => [...p, x]));
        });
    };

    createContact = () => {
        this.#companyService.createEmployee(this.customer()!.id).subscribe(() => {
            this.#companyService.show(this.customer()!.id).subscribe((_) => this.customer.set(_));
        });
    };

    createCompany = () => {
        this.#inputModalService.open($localize`:@@i18n.customers.company_name:company name`).confirmed(({ text }) => {
            this.#companyService.create(text).subscribe((x) => {
                this.onCompanySelect(x);
            });
        });
    };

    onCompanySelect(x: Serializable) {
        const company = x.assert(Company);
        if (!company) return;
        Connection.fromJson({
            company1_id: this.customer()!.id,
            company2_id: company.id,
        })
            .store()
            .subscribe((_) => {
                this.connections.update(cons => [...cons, Connection.fromJson(_)]);
            });
    }

    isFinishedProject = (_: Serializable) => !!(_ as Project).state?.isFinishedAny();
    birthdayMissing = (item: Serializable) => this.isInstanceOf(item, 'CompanyContact') && !(item as unknown as { contact?: { card?: { get?: (k: string) => unknown[] } } }).contact?.card?.get?.('BDAY')?.length;
    linkedinMissing = (item: Serializable) => this.isInstanceOf(item, 'CompanyContact') && !(item as unknown as { contact?: { card?: { get?: (k: string) => VcardRow[] } } }).contact?.card?.get?.('URL')?.filter((row: VcardRow) => row.getType() == 'linkedin')?.length;

    webUrlMissing = (item: Serializable) => this.isInstanceOf(item, 'Company') && (item as unknown as { card: { get: (k: string) => VcardRow[] } }).card.get('URL').every((row: VcardRow) => row.isSocialMedia());
    commercialRegisterNumberMissing = (item: Serializable) => {
        const company = item as Company & { name: string };
        return this.isInstanceOf(item, 'Company') && (company.name.includes('GmbH') || company.name.includes('AG')) && !company.commercial_register;
    };

    isInstanceOf(item: Serializable | null | undefined, className: string) {
        return item?.class == className;
    }

    saveComments() {
        const subs: Observable<unknown>[] = [];
        this.notes().forEach((note) => {
            const target = this.getItem(note);
            if (note.text == null || note.text === '' || !target) return;
            if (target instanceof Project) {
                target.description = note.text;
                subs.push(target.update({ description: target.description }));
            } else {
                const data = { text: note.text, type: note.type, path: target.apiPathWithId() };
                subs.push(note.id ? note.update(data) : note.store(data));
            }
        });
        if (subs.length > 0) {
            forkJoin(subs).subscribe();
        }
    }

    autoExpand(element: HTMLTextAreaElement) {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    }

    onKeyDown(event: KeyboardEvent, project: Project, textareaElement: HTMLTextAreaElement) {
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            this.addProjectComment(project, textareaElement);
        }
    }

    addProjectComment(project: Project, textareaElement: HTMLTextAreaElement) {
        const comment = textareaElement.value.trim();
        if (!comment) return;

        const now = dayjs().format('YYYY-MM-DD HH:mm');
        const userName = this.#global.user?.getName() || 'Unknown User';

        const formattedComment = comment.replace(/\n/g, '<br>');
        const newCommentText = `<br><br><code>${now} - ${userName}</code> ${formattedComment}`;

        project.description = (project.description || '') + newCommentText;

        project.update({ description: project.description }).subscribe(() => {
            this.projects.update(ps => {
                const index = ps.findIndex(p => p.id === project.id);
                if (index > -1) ps[index].description = project.description;
                return [...ps];
            });
        });

        textareaElement.value = '';
        textareaElement.style.height = 'auto';
    }

    availableUsersForItem(item: Company | Project): User[] {
        const assignedUserIds = item.assignees?.map((a) => a.assignee.id) || [];
        return this.#global.team.filter((user: User) => !assignedUserIds.includes(user.id));
    }

    addUserToItem(item: Company | Project, user: User) {
        if (item instanceof Company) {
            this.#assignmentService.addToCompany(item, { id: user.id, class: 'user' }).subscribe((response) => {
                if (!item.assignees) {
                    item.assignees = [];
                }
                item.assignees.push(response);
            });
        } else if (item instanceof Project) {
            this.#assignmentService.addToProject(item, { id: user.id, class: 'user' }).subscribe((response) => {
                if (!item.assignees) {
                    item.assignees = [];
                }
                item.assignees.push(response);
            });
        }
    }
}
