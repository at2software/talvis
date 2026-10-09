import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge, switchMap, tap } from 'rxjs';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { GlobalService } from '@models/global.service';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { WidgetFactory } from '@dashboard/availableWidgets';
import { ActivatedRoute } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { NxStatic } from '@app/nx/nx.static';
import { HeaderComponent } from '@app/app/header/header.component';
import { HeaderLinkItemComponent } from '@app/app/header/header-link-item/header-link-item.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { NgComponentOutlet } from '@angular/common';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { BaseWidgetListener } from './widgets/base.widget.listener';
import type { TOptions } from './widgets/base.widget.component';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { ActivityService } from '@app/_activity/activity.service';
import { TabAttentionComponent } from '@app/_activity/tab-attention/tab-attention.component';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { WidgetGettingStartedComponent } from './widgets/widget-getting-started/widget-getting-started.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    host: { '[class.is_editing]': 'is_editing()' },
    imports: [HeaderComponent, HeaderLinkItemComponent, ToolbarComponent, ScrollbarComponent, NgComponentOutlet, CdkDropList, EmptyStateComponent, NgbDropdownModule, CdkDrag, GuidedTourComponent, WidgetGettingStartedComponent],
})
export class DashboardComponent {
    is_editing = signal(false);
    currentDashboard = signal(0);

    global = inject(GlobalService);

    #input = inject(InputModalService);
    #confirm = inject(ConfirmationService);
    #route = inject(ActivatedRoute);
    #cdr = inject(ChangeDetectorRef);
    #listener = inject(BaseWidgetListener);
    #activityService = inject(ActivityService);

    componentFor = WidgetFactory.componentFor;
    hasAccess = WidgetFactory.hasWidgetAccess;

    constructor() {
        this.global.init
            .pipe(
                takeUntilDestroyed(),
                switchMap(() => {
                    this.#activityService.switchToTabByComponent(TabAttentionComponent);
                    return merge(
                        this.#listener.updated.pipe(tap((args) => this.#onWidgetOptionsChanged(...args))),
                        this.#listener.deleted.pipe(tap((args) => this.#onWidgetDelete(...args))),
                        this.#listener.added.pipe(tap((key) => this.#onWidgetAdd(key))),
                        this.#route.params.pipe(
                            tap((_) => {
                                const requested = 'dashboard' in _ ? parseInt(_['dashboard']) : 0;
                                this.currentDashboard.set(requested >= 0 && requested < this.global.dashboards.length ? requested : 0);
                                NxStatic.setTitle(this.global.dashboards[this.currentDashboard()]?.title ?? '');
                            }),
                        ),
                    );
                }),
            )
            .subscribe();
    }

    drop(event: CdkDragDrop<any[]>) {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else if (event.previousContainer.id === 'widget-list') {
            const widget = event.previousContainer.data[event.previousIndex];
            event.container.data.splice(event.currentIndex, 0, { widget: widget.key!, options: {} });
        } else {
            transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        }
        this.#updateDashboards(true);
    }

    toggleEditing = () => {
        this.is_editing.set(!this.is_editing());
        NxStatic.setDashboardEditMode(this.is_editing());
    };

    onNewDashboard = () =>
        this.#input
            .open('Title', false)
            .then((response) => {
                if (response?.text) {
                    this.global.dashboards.push({ title: response.text, cols: [[], [], [], []] });
                    this.#updateDashboards(true);
                }
            })
            .catch();

    onDashboadDelete = (pos: number) =>
        this.#confirm
            .confirm({ title: $localize`:@@i18n.common.delete:Delete`, message: $localize`:@@i18n.dashboard.confirmDeleteDashboard:Do you really want to delete this dashboard?` })
            .then(() => {
                this.global.dashboards.splice(pos, 1);
                this.#updateDashboards(true);
            })
            .catch();

    #onWidgetDelete = (_: unknown, col: number, pos: number) =>
        this.#confirm
            .confirm({ title: $localize`:@@i18n.common.delete:Delete`, message: $localize`:@@i18n.dashboard.confirmDeleteWidget:Do you really want to delete this widget?` })
            .then(() => {
                this.global.dashboards[this.currentDashboard()].cols[col].splice(pos, 1);
                this.#updateDashboards(true);
            })
            .catch();

    #onWidgetAdd = (key: string) => {
        const cols = this.global.dashboards[this.currentDashboard()]?.cols;
        if (!cols) return;
        const shortest = cols.reduce((min, col) => (col.length < min.length ? col : min), cols[0]);
        shortest.push({ widget: key, options: {} });
        this.#updateDashboards(true);
    };

    #onWidgetOptionsChanged = ($event: TOptions, col: number, pos: number) => {
        this.global.dashboards[this.currentDashboard()].cols[col][pos].options = $event;
        this.#updateDashboards();
    };

    #updateDashboards = (triggerReload = false) => {
        this.#cdr.markForCheck();
        return this.global.user?.updateParam('DASHBOARDS', { value: JSON.stringify(this.global.dashboards) }).subscribe(() => {
            if (triggerReload) {
                this.#listener.reloadRequested.next();
            }
        });
    };
}
