import { Page } from '@models/http/http.talvis';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Focus } from '@models/focus/focus.model';
import { Observable, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { FocusService } from '@models/focus/focus.service';
import { User } from '@models/user/user.model';
import { GlobalService } from '@models/global.service';
import { IHasFociGuard } from '@models/focus/has-foci.interface';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { StartEnd } from '@constants/constants';
import { dayjs } from '@constants/date/dates';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { Project } from '@models/project/project.model';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { Task } from '@models/task/task.model';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '',
    imports: [],
})
export abstract class TimetrackingComponent {
    abstract parent: IHasFociGuard;

    observer!: Observable<Page<Focus>>;
    filteredFoci = signal<Focus[]>([]);
    users: User[] = [];
    filteredUsers = signal<User[]>([]);
    selection = signal<Focus[]>([]);
    selectionDuration = signal(0);
    sortField: string = 'started_at';
    sortDirection: 'asc' | 'desc' = 'desc';
    displayedColumns = ['started_at', 'timespan', 'userIcon', 'comment', 'duration', 'invoiced', 'focus_item'];

    showNotYetInvoiced = signal(false);
    dateRange?: StartEnd;
    #dateRangeChange$ = new Subject<void>();

    protected focusService = inject(FocusService);
    #global = inject(GlobalService);
    #pluginFactory = inject(PluginInstanceFactory);

    selectedIssue = signal<Task | undefined>(undefined);
    selectedIssueLinkId = signal<string>('');
    selectedIssueId = signal<string>('');
    newFocusDuration = signal<number | undefined>(undefined);
    newFocusComment = signal<string>('');

    readonly hasIssueTracker = computed(() => {
        const obj = this.parent.object();
        return obj instanceof Project && obj.hasTimeBudget() && this.#pluginFactory.getTaskInstances(obj).length > 0;
    });

    constructor() {
        effect(() => {
            const _ = this.parent.object();
            untracked(() => {
                this.setupUsersFromWorkShares();
                this.reload();
            });
        });

        this.#global
            .onSelectionIn(() => this.filteredFoci(), 'duration')
            .subscribe((_) => {
                const [selection, selectionDuration] = _;
                this.selection.set(selection);
                this.selectionDuration.set(selectionDuration);
            });

        this.#dateRangeChange$.pipe(debounceTime(300)).subscribe(() => this.reload());
    }

    onReload = () => {
        const selectedUserIds = this.users.filter((u) => !u.var.hidden).map((u) => u.id);

        const startDate = this.dateRange?.startDate?.format('YYYY-MM-DD');
        const endDate = this.dateRange?.endDate?.format('YYYY-MM-DD');
        return this.focusService.getFociFor(this.parent.object() as any, selectedUserIds.length ? selectedUserIds : undefined, this.sortField, this.sortDirection, this.showNotYetInvoiced(), startDate, endDate);
    };

    reload = () => {
        this.parent.object().foci = [];
        this.filteredFoci.set([]);
        this.observer = this.onReload();
    };
    userForFocus = (x: Focus) => this.#global.userFor(x.user_id);
    durationFor = (user: User) => this.parent.object().foci.filter((_) => _.user_id === user.id).reduce((a, b) => a + b.duration, 0);
    getTotal = () => this.filteredFoci().reduce((a, b) => a + b.duration, 0);

    setupUsersFromWorkShares() {
        const timeline_chart = this.parent.object().timeline_chart;
        if (timeline_chart?.length) {
            this.users = timeline_chart.map(foci => User.fromJson(foci['user']));
            this.filteredUsers.set([...this.users]);
        } else {
            this.users = [];
            this.filteredUsers.set([]);
        }
    }
    onResult = (data: Focus[]) => {
        this.parent.object().foci = this.parent.object().foci.concat(data as Focus[]).map((_) => {
            _.parent = this.parent.object();
            return _;
        });

        let focusItems: InvoiceItem[] = [];
        if ('invoice_items' in this.parent.object()) {
            focusItems = (this.parent.object() as any).invoice_items as InvoiceItem[];
        } else {
            focusItems = this.parent.object().foci
                .filter((focus) => focus.invoice_item?.type == InvoiceItemType.Default && focus.invoice_item?.text.length)
                .map((focus) => focus.invoice_item)
                .filter((item, index, arr) => arr.findIndex((i) => i.id === item.id) === index);
        }

        this.parent.object().foci.forEach((focus) => {
            if (!focus.var.hasAdditionalFocusActions) {
                focus.var.hasAdditionalFocusActions = true;
                focus.actions.push({
                    title: $localize`:@@i18n.foci.changeFocus:change focus...`,
                    group: true,
                    children: focusItems
                        .filter((_) => _ && _.text)
                        .map((_) => ({
                            title: this.#decodeHtmlEntities(_.text),
                            group: true,
                            action: () => focus.update({ invoice_item_id: _.id }),
                        })),
                });
            }
        });

        this.applyUserFilters();
    };

    applyUserFilters = () => this.filteredFoci.set([...this.parent.object().foci]);
    findUniqueUser = (u: User) => this.users.find((_) => _.id === u.id);
    onFilterChanged(u: User) {
        u.var.hidden = !u.var.hidden;
        this.reload();
    }

    onSort(field: string) {
        if (this.sortField === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortField = field;
            this.sortDirection = field === 'started_at' || field === 'duration' ? 'desc' : 'asc';
        }
        this.reload();
    }

    getSortIcon = (field: string): string => (this.sortField !== field ? '<i>unfold_more</i>' : this.sortDirection === 'asc' ? '<i>expand_less</i>' : '<i>expand_more</i>');

    #decodeHtmlEntities = (text: string): string => {
        const div = document.createElement('div');
        div.innerHTML = text;
        return div.textContent || '';
    };

    onNotYetInvoicedFilterChange() {
        this.reload();
    }

    onDateRangeChange() {
        this.#dateRangeChange$.next();
    }

    onIssueSelected(task: Task) {
        this.selectedIssue.set(task);
    }

    onCreateFocus() {
        const duration = this.newFocusDuration();
        const project = this.parent.object();
        if (!duration || !(project instanceof Project)) return;
        this.focusService
            .createForProject(project, {
                duration,
                started_at: dayjs().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
                comment: this.newFocusComment(),
                ext_issue_plugin_link_id: this.selectedIssueLinkId(),
                ext_issue_id: this.selectedIssueId(),
            })
            .subscribe((focus) => {
                focus.parent = project;
                project.foci = [focus, ...project.foci];
                this.applyUserFilters();
                this.selectedIssue.set(undefined);
                this.selectedIssueLinkId.set('');
                this.selectedIssueId.set('');
                this.newFocusDuration.set(undefined);
                this.newFocusComment.set('');
            });
    }
}
