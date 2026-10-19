import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { dayjs } from '@constants/date/dates';
import { GlobalService } from '@models/global.service';
import { modelListResource } from '@models/http/model-resource';
import { VacationService } from '@models/vacation/vacation.service';
import { LoadingPipe } from '@pipes/loading.pipe';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    selector: 'profile-vacation-widget',
    templateUrl: './profile-vacation-widget.component.html',
    imports: [ValueUnitComponent, LoadingPipe, DecimalPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileVacationWidgetComponent {
    global = inject(GlobalService);
    #vacationService = inject(VacationService);

    readonly #grants = modelListResource(
        () => this.global.user?.id,
        (userId) => this.#vacationService.indexGrants(userId),
    );
    readonly #settled = computed(() => this.#grants.status() === 'resolved');
    readonly totalVacationHours = computed(() => (this.#settled() ? this.#grants.value().reduce((sum, _) => sum + _.remainingHours(), 0) : undefined));
    readonly totalVacationDays = computed(() => (this.#settled() ? this.#grants.value().reduce((sum, _) => sum + _.remainingDays(this.global.user!), 0) : undefined));

    getWorkingHoursPerDay = () => this.global.user?.getHpwArray().map((_, k) => [dayjs().day((k + 1) % 7).format('dd'), _]);
}
