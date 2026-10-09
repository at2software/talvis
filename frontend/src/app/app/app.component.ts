import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { NxContextMenu } from '@app/nx/nx.contextmenu';
import { NgbTooltipConfig } from '@ng-bootstrap/ng-bootstrap';
import { fromEvent, map } from 'rxjs';
import { GlobalService } from '@models/global.service';
import { LiveSyncService } from '@models/live/live-sync.service';
import { NavigationComponent } from './navigation/navigation.component';
import { ActivityComponent } from '@activity/activity.component';
import { ActivitySidebarStateService } from '@activity/activity-sidebar-state.service';
import { TabAttentionComponent } from '@activity/tab-attention/tab-attention.component';
import { TabCopypasteComponent } from '@activity/tab-copypaste/tab-copypaste.component';
import { TabTasksComponent } from '@activity/tab-tasks/tab-tasks.component';
import { TabInvoicingComponent } from '@activity/tab-invoicing/tab-invoicing.component';
import { TabWidgetsComponent } from '@activity/tab-widgets/tab-widgets.component';
import { ToastsContainer } from '@shards/toast/toast.container';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { RouteChangeListenerService } from '@app/routeChangeListener.service';
import { BusyService } from '@app/busy.service';
import { BacklightService } from '@app/backlight.service';

const BREAKPOINT_ACTIVITY = 1700;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    imports: [NxContextMenu, RouterModule, NavigationComponent, ActivityComponent, TabAttentionComponent, TabCopypasteComponent, TabTasksComponent, TabInvoicingComponent, TabWidgetsComponent, ToastsContainer, SpinnerComponent],
})
export class AppComponent {
    #tooltipConfig = inject(NgbTooltipConfig);
    #sidebarState = inject(ActivitySidebarStateService);

    authResolved = inject(GlobalService).authResolved;
    #navigating = inject(RouteChangeListenerService).navigating;
    #busy = inject(BusyService).active;
    loading = computed(() => this.#navigating() || this.#busy());

    #narrow = toSignal(
        fromEvent<UIEvent>(window, 'resize').pipe(map(e => (e.target as Window).innerWidth < BREAKPOINT_ACTIVITY)),
        { initialValue: window.innerWidth < BREAKPOINT_ACTIVITY }
    );

    constructor() {
        inject(LiveSyncService);
        inject(BacklightService);

        this.#tooltipConfig.container = 'body';
        this.#tooltipConfig.animation = false;

        effect(() => this.#sidebarState.applyViewport(this.#narrow()));

        window.addEventListener('dragover', (e) => e.preventDefault(), true);
        window.addEventListener('drop', (e) => e.preventDefault(), false);
    }
}
