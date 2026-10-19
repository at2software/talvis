import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ActionEmitterType } from '@app/nx/nx.directive';
import { modelListResource } from '@models/http/model-resource';
import { Sentinel } from '@models/sentinel/sentinel.model';
import { SentinelService } from '@models/sentinel/sentinel.service';
import { Nx } from '@app/nx/nx.directive';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    selector: 'profile-sentinels',
    templateUrl: './profile-sentinels.component.html',
    imports: [ToolbarComponent, Nx, RouterModule, NgbTooltipModule, EmptyStateComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSentinelsComponent {
    #sentinelService = inject(SentinelService);
    #router = inject(Router);

    readonly #sentinels = modelListResource(() => this.#sentinelService.index());
    readonly sentinels = this.#sentinels.value;
    readonly sentinelsLoaded = this.#sentinels.hasValue;

    #reload = () => this.#sentinels.reload();

    store = () =>
        new Sentinel().store().subscribe((_) => {
            this.#reload();
            this.#router.navigate(['profile', 'sentinels', _.id]);
        });

    nxResolve(e: ActionEmitterType) {
        if (e.action.title == 'Delete') {
            this.#reload();
            this.#router.navigate(['profile', 'sentinels']);
        }
    }
}
