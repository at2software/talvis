import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingInitiative } from '@models/marketing/marketing-initiative.model';
import { modelResource } from '@models/http/model-resource';
import { FormsModule } from '@angular/forms';
import { Nx } from '@app/nx/nx.directive';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { NxStatic, TBroadcast } from '@app/nx/nx.static';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GlobalService } from '@models/global.service';
import { filter } from 'rxjs';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-initiatives',
    templateUrl: './marketing-initiatives.component.html',
    styleUrls: ['./marketing-initiatives.component.scss'],
    imports: [FormsModule, RouterModule, Nx, NgbTooltipModule, EmptyStateComponent, GuidedTourComponent, SpinnerComponent],
})
export class MarketingInitiativesComponent {
    #marketingService = inject(MarketingService);
    #router = inject(Router);
    #route = inject(ActivatedRoute);
    #global = inject(GlobalService);

    #initiatives = modelResource(() => this.#marketingService.indexInitiatives());
    isLoading = this.#initiatives.isLoading;

    allInitiatives = linkedSignal<MarketingInitiative[]>(() => this.#initiatives.value()?.data ?? []);

    showCreateModal = signal(false);
    showRootOnly = signal(true);
    searchTerm = signal('');
    statusFilter = signal('active');
    onlySubscribed = signal(false);

    newInitiative: Partial<MarketingInitiative> = {
        name: '',
        description: '',
        status: 'active',
    };

    initiatives = computed(() => {
        const term = this.searchTerm().toLowerCase();
        const status = this.statusFilter();
        const onlySubscribed = this.onlySubscribed();
        return this.allInitiatives()
            .filter((i) => !term || i.name?.toLowerCase().includes(term) || i.description?.toLowerCase().includes(term))
            .filter((i) => !status || i.status === status)
            .filter((i) => !this.showRootOnly() || !i.parent_id)
            .filter((i) => !onlySubscribed || this.#isSubscribed(i))
            .sort((a, b) => (b.prospects_count || 0) - (a.prospects_count || 0));
    });

    stats = computed(() => {
        const all = this.allInitiatives();
        return {
            total: all.length,
            active: all.filter((i) => i.status === 'active').length,
            paused: all.filter((i) => i.status === 'paused').length,
            completed: all.filter((i) => i.status === 'completed').length,
            subscribed: all.filter((i) => this.#isSubscribed(i)).length,
        };
    });

    constructor() {
        NxStatic.broadcast$
            .pipe(
                takeUntilDestroyed(),
                filter((e) => e.type === TBroadcast.Update && e.data instanceof MarketingInitiative),
            )
            .subscribe(() => this.allInitiatives.update((all) => [...all]));

        this.#marketingService.initiativeSubscriptionChanged$.pipe(takeUntilDestroyed()).subscribe(() => this.#initiatives.reload());

        effect(() => {
            const first = this.initiatives()[0];
            if (!first) return;
            untracked(() => {
                if (!this.#route.firstChild?.snapshot.params['id']) this.#router.navigate(['/marketing/initiatives', first.id]);
            });
        });
    }

    createInitiative() {
        if (!this.newInitiative.name) return;
        this.#marketingService.storeInitiative(this.newInitiative).subscribe((initiative: MarketingInitiative) => {
            this.allInitiatives.update((arr) => [initiative, ...arr]);
            this.resetCreateForm();
        });
    }

    filterByStatus = (status: string) => this.statusFilter.set(status);
    toggleSubscribed = () => this.onlySubscribed.update((v) => !v);
    #isSubscribed = (initiative: MarketingInitiative) => initiative.users?.some((u) => u.id === this.#global.user?.id) ?? false;

    resetCreateForm() {
        this.newInitiative = { name: '', description: '', status: 'active' };
        this.showCreateModal.set(false);
    }
}
