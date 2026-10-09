import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { ActivityTabComponent } from '@activity/activity-tab.component';
import { ActivityService } from '@activity/activity.service';
import { WidgetFactory, TAWidget } from '@dashboard/availableWidgets';
import { NgComponentOutlet } from '@angular/common';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { NxStatic } from '@app/nx/nx.static';
import { GlobalService } from '@models/global.service';
import { ActivatedRoute } from '@angular/router';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { DashboardWidgetConfigDto } from '@models/_core/api-response';
import { BaseWidgetListener } from '@dashboard/widgets/base.widget.listener';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'activity-tab-widgets',
    templateUrl: './tab-widgets.component.html',
    styleUrls: ['./tab-widgets.component.scss'],
    imports: [ActivityTabComponent, ScrollbarComponent, NgComponentOutlet, CdkDrag, CdkDropList, NgbTooltipModule],
})
export class TabWidgetsComponent {
    readonly tab = viewChild.required(ActivityTabComponent);
    readonly #global = inject(GlobalService);
    readonly #activityService = inject(ActivityService);
    readonly #widgetListener = inject(BaseWidgetListener);
    readonly #usedWidgetKeys = new Set<string>();
    readonly #currentDashboard = toSignal(
        inject(ActivatedRoute).params.pipe(map(p => 'dashboard' in p ? parseInt(p['dashboard']) : 0)),
        { initialValue: 0 }
    );

    readonly isEditMode = signal(false);
    readonly allWidgets = signal<TAWidget[]>([]);
    readonly isUsedWidget = (widgetKey: string) => this.#usedWidgetKeys.has(widgetKey);

    addWidget(widgetKey: string) {
        this.#usedWidgetKeys.add(widgetKey);
        this.#widgetListener.added.next(widgetKey);
    }

    constructor() {
        NxStatic.dashboardEditMode$.pipe(takeUntilDestroyed()).subscribe(isEditing => {
            this.isEditMode.set(isEditing);
            const tab = this.tab();
            if (isEditing) {
                this.#usedWidgetKeys.clear();
                this.#global.dashboards?.[this.#currentDashboard()]?.cols.forEach((col: DashboardWidgetConfigDto[]) =>
                    col.forEach((widget) => this.#usedWidgetKeys.add(widget.widget))
                );
                this.allWidgets.set(WidgetFactory.availableWidgets());
                tab.show();
                setTimeout(() => tab.focus(), 0);
            } else {
                tab.hide();
                setTimeout(() => {
                    const idx = this.#activityService.tabs().findIndex(t => t !== tab && !t.hidden());
                    if (idx !== -1) this.#activityService.switchToTab(idx);
                }, 0);
            }
        });
    }
}
