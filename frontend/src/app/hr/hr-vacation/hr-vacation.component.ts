import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { VacationService } from '@models/vacation/vacation.service';
import { VacationGrant } from '@models/vacation/vacation-grant.model';
import { Vacation } from '@models/vacation/vacation.model';
import { User } from '@models/user/user.model';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalEditVacationComponent } from '@app/_modals/modal-edit-vacation/modal-edit-vacation.component';
import { GlobalService } from '@models/global.service';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Nx } from '@app/nx/nx.directive';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SaldoChartComponent } from '@shards/saldo-chart/saldo-chart.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from "@shards/spinner/spinner.component";
import { StackedTableDirective } from '@directives/stacked-table.directive';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'hr-vacation',
    templateUrl: './hr-vacation.component.html',
    imports: [ValueUnitComponent, StackedTableDirective, DecimalPipe, DatePipe, Nx, NgbDropdownModule, NgbTooltipModule, SaldoChartComponent, EmptyStateComponent, SpinnerComponent],
})
export class HrVacationComponent {
    user = input.required<User>();
    isHr = input<boolean>(false);

    #vacationService = inject(VacationService);
    #modal = inject(ModalBaseService);
    #global = inject(GlobalService);

    readonly #grants = modelListResource(
        () => this.user().id,
        (userId) => this.#vacationService.indexGrants(userId),
    );
    readonly grants = this.#grants.value;
    readonly isLoading = computed(() => !['resolved', 'error'].includes(this.#grants.status()));

    reload = () => this.#grants.reload();

    onVacationAdd(grant: VacationGrant) {
        this.#modal.open(ModalEditVacationComponent, Vacation.fromJson({}), this.user()).then((a) => {
            if (a) {
                a.vacation_grant_id = grant.id;
                a.approved_by_id = this.#global.user!.id;
                a.started_at = a.var.date;
                this.#vacationService.storeManual(a).subscribe(() => this.reload());
            }
        });
    }
    onFreeDayAdd(grant: VacationGrant) {
        this.#modal.open(ModalEditVacationComponent, Vacation.fromJson({}), this.user()).then((a) => {
            if (a) {
                a.vacation_grant_id = grant.id;
                a.approved_by_id = this.#global.user!.id;
                a.started_at = a.var.date;
                a.ended_at = a.time_started().add(a.var.amount, 'days').format('YYYY-MM-DD');
                a.amount = 0;
                this.#vacationService.storeManual(a).subscribe(() => this.reload());
            }
        });
    }
}
