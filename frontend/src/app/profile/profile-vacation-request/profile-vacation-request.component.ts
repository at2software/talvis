import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { FormsModule } from '@angular/forms';
import { AffixInputDirective } from '@directives/affix-input.directive';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { dayjs } from '@constants/date/dates';
import { DaterangepickerDirective, NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { Nx } from '@app/nx/nx.directive';
import { GlobalService } from '@models/global.service';
import { VacationGrant } from '@models/vacation/vacation-grant.model';
import { Vacation } from '@models/vacation/vacation.model';
import { VacationService } from '@models/vacation/vacation.service';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

type TimePeriod = NonNullable<DaterangepickerDirective['value']>;

interface TDay {
    day: string;
    duration: number;
    originalDuration: number;
    mult: number;
    specialName: string;
    specialDescription: string | undefined;
}

const STR_REGULAR_WORKDAY = 'Regulärer Arbeitstag';
const STR_PARTIAL_VACATION = 'Partieller Urlaub';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'profile-vacation-request',
    templateUrl: './profile-vacation-request.component.html',
    styleUrls: ['./profile-vacation-request.component.scss'],
    imports: [ValueUnitComponent, DatePipe, DecimalPipe, EmptyStateComponent, Nx, FormsModule, NgbTooltipModule, NgxDaterangepickerMd, AffixInputDirective, SpinnerComponent],
})
export class ProfileVacationRequestComponent {
    global = inject(GlobalService);
    #vacationService = inject(VacationService);

    readonly #userId = computed(() => this.global.user?.id);

    readonly #grants = modelListResource(this.#userId, (userId) => this.#vacationService.indexGrants(userId));
    readonly #requests = modelListResource(this.#userId, (userId) => this.#vacationService.indexRequests(userId));
    readonly #holidays = modelListResource(() => this.#vacationService.indexHolidays());

    readonly grants = computed(() => {
        const grants = this.#grants.value();
        grants.forEach((grant) => (grant.var.total = grant.remainingHours()));
        return grants;
    });
    readonly grantsLoaded = this.#grants.hasValue;
    readonly openRequests = this.#requests.value;
    readonly holidays = this.#holidays.value;

    readonly currentGrant = linkedSignal<VacationGrant[], VacationGrant | undefined>({ source: this.grants, computation: (grants) => grants.first() });

    dayList = signal<TDay[]>([]);
    totalDeduction = signal(0);

    holidayPeriod: TimePeriod | null = null;
    comment: string = '';

    onGrantSelect = (_: VacationGrant) => this.currentGrant.set(_);
    reload = () => {
        this.#grants.reload();
        this.#requests.reload();
    };

    onDatesUpdated = () => {
        if (!this.holidayPeriod?.startDate || !this.holidayPeriod?.endDate) return;

        let start = dayjs(this.holidayPeriod.startDate.toDate());
        const end = dayjs(this.holidayPeriod.endDate.toDate());
        if (start > end) return;

        const result: TDay[] = [];
        const assignSpecialHoliday = (day: TDay, mult: number, specialName: string, specialDescription: string | undefined) =>
            Object.assign(day, { mult, specialName, specialDescription });

        while (start < end) {
            const weekDay = start.day();
            if (weekDay !== 6 && weekDay !== 0) {
                const hpd = this.global.user!.active_employment.hpwArray()[weekDay - 1] ?? 0;
                const day: TDay = { day: start.format('DD.MM.YYYY'), duration: hpd, originalDuration: hpd, mult: 1, specialDescription: '', specialName: STR_REGULAR_WORKDAY };
                for (const _ of this.holidays()) {
                    if (_.date.isSame(start.toDate(), 'day')) assignSpecialHoliday(day, 0, _.name, _.hinweis);
                }
                result.push(day);
            } else {
                result.push({ day: start.format('DD.MM.YYYY'), duration: 0, originalDuration: 0, mult: 0, specialDescription: undefined, specialName: 'Wochenende' });
            }
            start = start.add(1, 'day');
        }

        this.dayList.set(result);
        this.#recalculateTotal();
    };

    #recalculateTotal() {
        let total = 0;
        this.dayList().forEach((_) => (total += _.duration * _.mult));
        this.totalDeduction.set(total);
    }

    removePotentialHoliday = (_: TDay) => {
        _.mult = 1;
        _.duration = _.originalDuration;
        _.specialName = STR_REGULAR_WORKDAY;
        _.specialDescription = undefined;
        this.dayList.update((d) => [...d]);
        this.#recalculateTotal();
    };

    onDurationChanged = (day: TDay) => {
        this.#updateDaySpecialName(day);
        this.dayList.update((d) => [...d]);
        this.#recalculateTotal();
    };

    #updateDaySpecialName = (day: TDay) => {
        if (day.mult === 0 || day.originalDuration === 0) return;
        day.specialName = day.duration === day.originalDuration ? STR_REGULAR_WORKDAY : STR_PARTIAL_VACATION;
    };

    isDurationExceeded = (day: TDay): boolean => day.duration > day.originalDuration && day.originalDuration > 0;
    isFormValid = (): boolean => this.totalDeduction() > 0 && !this.dayList().some((day) => this.isDurationExceeded(day));

    onGrantRequested() {
        let total = 0;
        let log = '';
        for (const _ of this.dayList()) {
            total += _.mult * _.duration;
            log += _.day + ': ' + _.specialName + ' ' + _.duration * _.mult + 'h<br>';
        }
        const payload = Vacation.fromJson({
            comment: this.comment ?? '',
            started_at: this.holidayPeriod!.startDate.format('YYYY-MM-DD'),
            ended_at: this.holidayPeriod!.endDate.format('YYYY-MM-DD'),
            state: Vacation.STATE_REQUESTED,
            amount: -total,
            vacation_grant_id: this.currentGrant()!.id,
            log,
        });
        payload.store().subscribe(() => {
            this.dayList.set([]);
            this.reload();
        });
    }
}
