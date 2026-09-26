import { DatePipe } from '@angular/common';
import { debounceTime, filter } from 'rxjs/operators';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { PermissionsDirective } from '@directives/permissions.directive';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ActivityTabComponent } from '@activity/activity-tab.component';
import { REFLECTION } from '@constants/constants';
import { dayjs } from '@constants/date/dates';
import { whenIdle } from '@constants/idle';
import { GlobalService } from '@models/global.service';
import { WidgetService } from '@models/widget.service';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { SafePipe } from '@pipes/safe.pipe';
import { WebSocketService } from '@services/websocket.service';
import { modelListResource } from '@models/http/model-resource';
import type { Serializable } from '@models/_core/serializable';
import { Comment } from '@models/comment/comment.model';
import { Invoice } from '@models/invoice/invoice.model';
import { Company } from '@models/company/company.model';
import { Project } from '@models/project/project.model';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'activity-tab-attention',
    templateUrl: './tab-attention.component.html',
    styleUrls: ['./tab-attention.component.scss'],
    imports: [ActivityTabComponent, ScrollbarComponent, Nx, NComponent, AvatarComponent, DatePipe, NgbTooltipModule, MoneyShortPipe, PermissionsDirective, SafePipe],
})
export class TabAttentionComponent {
    #widgetService = inject(WidgetService);
    #globalInit = inject(GlobalService).init;
    #ws = inject(WebSocketService);
    #knownItemCount = 0;
    #initialized = false;
    #untilDestroyed = takeUntilDestroyed();

    #watchedClasses = new Set(['Comment', 'Invoice', 'Company', 'Project']);

    readonly componentType = TabAttentionComponent;
    readonly tabComponent = viewChild.required(ActivityTabComponent);

    
    protected readonly Comment = Comment;
    protected readonly Invoice = Invoice;
    protected readonly Company = Company;
    protected readonly Project = Project;

    #ready = signal<true | undefined>(undefined);
    #newItems = modelListResource(this.#ready, () => this.#widgetService.indexNewItems());
    newItems = computed<Serializable[]>(() => this.#newItems.value().map((_) => REFLECTION(_)));
    groupedItems = computed(() => {
        const today = dayjs().startOf('day');
        const yesterday = today.subtract(1, 'day');

        const groups: Record<string, Serializable[]> = {};
        for (const item of this.newItems()) {
            const dateKey = dayjs(item.created_at).format('YYYY-MM-DD');
            (groups[dateKey] ??= []).push(item);
        }

        return Object.keys(groups)
            .sort((a, b) => b.localeCompare(a))
            .map((dateKey) => {
                const itemDate = dayjs(dateKey);
                const displayDate = itemDate.isSame(today)
                    ? $localize`:@@i18n.common.today:today`
                    : itemDate.isSame(yesterday)
                        ? $localize`:@@i18n.common.yesterday:yesterday`
                        : itemDate.toDate().toLocaleDateString();
                return { date: dateKey, displayDate, items: groups[dateKey] };
            });
    });

    constructor() {
        effect(() => {
            const tab = this.tabComponent();
            if (!tab) return;
            untracked(() => {
                tab.onFocus = () => {
                    tab.badge.set(undefined);
                    this.#knownItemCount = this.newItems().length;
                };
            });
        });
        this.#globalInit.subscribe(() => {
            if (this.#ready()) this.reload();
            else whenIdle(() => this.#ready.set(true));
            this.#ws.dataChanged$
                .pipe(
                    filter((payload) => this.#watchedClasses.has(payload.class) && (payload.event === 'created' || payload.event === 'deleted')),
                    debounceTime(500),
                    this.#untilDestroyed,
                )
                .subscribe(() => this.reload());
        });

        effect(() => {
            if (!this.#newItems.hasValue()) return;
            const count = this.newItems().length;
            if (!this.#initialized) {
                this.#initialized = true;
                this.#knownItemCount = count;
            } else if (count > this.#knownItemCount) {
                this.tabComponent().badge.set('!');
            }
        });
    }

    reload = () => this.#newItems.reload();
}
