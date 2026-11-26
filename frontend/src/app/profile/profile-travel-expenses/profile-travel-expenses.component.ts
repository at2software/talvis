import { ChangeDetectionStrategy, Component, inject, signal, viewChild, Type } from '@angular/core';
import { NxStatic } from '@app/nx/nx.static';
import { dayjs } from '@constants/date/dates';
import { dateToMoment, momentToDate } from '@constants/date/momentToDate';
import { DndDirective } from '@directives/dnd.directive';
import { FileService } from '@models/file/file.service';
import { TRAVEL_ALLOWANCE_DATA, getTravelAllowanceByCountry, getAvailableCountries } from './travel-allowance-data';
import { TravelAllowanceRatesDto } from '@models/_core/api-response';

import { FormsModule } from '@angular/forms';
import { NgbDatepickerModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { MoneyPipe } from '@pipes/money.pipe';
import { AffixInputDirective } from '@directives/affix-input.directive';

interface IData { 
    purpose: string; 
    way: string; 
    start: string; 
    end: string; 
    days: TDay[]; 
    expenses: TExpense[] 
}
interface IYMD {
    year: number;
    month: number;
    day: number;
}
interface IHM {
    hours: number;
    minutes: number;
}
interface TDay {
    name: string;
    brunch: boolean;
    lunch: boolean;
    dinner: boolean;
    sleep: boolean;
    base: number;
    sum: number;
}
type TExpenseType = [string, Type<TExpense>, string, boolean];
class TExpense {
    type: number;
    name: string;
    value: number = 0;
    suffix: string = NxStatic.global.currencySymbol();
    sum: number = 0;
    constructor(type: number) {
        this.type = type;
        this.name = ExpenseType[type][0];
    }
    hasInputField = (): boolean => ExpenseType[this.type][3];
    getTotal = (): number => this.value;
    getIcon = (): string => ExpenseType[this.type][2];
}
class TCarExpense extends TExpense {
    suffix = 'km';
    getTotal = () => this.value * 0.3;
}
const ExpenseType: TExpenseType[] = [
    [$localize`:@@i18n.profile.car:car`, TCarExpense, 'directions_car', false],
    [$localize`:@@i18n.profile.train:train`, TExpense, 'train', false],
    [$localize`:@@i18n.profile.taxi:taxi`, TExpense, 'local_taxi', false],
    [$localize`:@@i18n.profile.publicTransport:public transport`, TExpense, 'commute', false],
    [$localize`:@@i18n.profile.oilFuelRepairs:oil, fuel, repairs`, TExpense, 'local_gas_station', false],
    [$localize`:@@i18n.profile.miscellaneous:miscellaneous`, TExpense, 'miscellaneous_services', true],
];

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'profile-travel-expenses',
    templateUrl: './profile-travel-expenses.component.html',
    imports: [FormsModule, NgbDatepickerModule, MoneyPipe, AffixInputDirective, DndDirective, NgbDropdownModule],
})
export class ProfileTravelExpensesComponent {
    fileService = inject(FileService);

    protected readonly dragDrop = viewChild(DndDirective);

    pauschSmall     : number         = 14;
    pauschLarge     : number         = 28;
    pauschSleep     : number         = 20;
    selectedCountry: string          = 'Deutschland';
    purpose         : string         = '';
    way             : string         = '';
    days            : TDay[]         = [];
    expenses        : TExpense[]     = [];
    timeDiff        : number         = 0;
    startDate       : IYMD           = momentToDate(dayjs());
    endDate         : IYMD           = momentToDate(dayjs());
    startTime       : IHM            = { hours: 10, minutes: 0 };
    endTime         : IHM            = { hours: 10, minutes: 0 };
    types           : TExpenseType[] = ExpenseType;

    availableCountries: string[] = getAvailableCountries();
    travelAllowanceData: TravelAllowanceRatesDto[] = TRAVEL_ALLOWANCE_DATA;

    twoDayTrip      = signal(false);
    withSleep       = signal(false);
    
    constructor() {
        this.onCountryChange();
    }

    onCountryChange() {
        const rates = getTravelAllowanceByCountry(this.selectedCountry);
        if (rates) {
            this.pauschSmall = rates.kleinePauschale;
            this.pauschLarge = rates.grossePauschale;
            this.pauschSleep = rates.uebernachtung;
            if (this.days) this.updateDays();
        }
    }

    #start = () => dateToMoment({ ...this.startDate, ...this.startTime });
    #end = () => dateToMoment({ ...this.endDate, ...this.endTime });

    onSubmit() {
        const dragDrop = this.dragDrop();
        if (!dragDrop) return;
        this.days.forEach((_) => (_.sum = this.sumFor(_)));
        this.expenses.forEach((_) => (_.sum = _.getTotal()));
        const data: IData = {
            purpose: this.purpose,
            way: this.way,
            start: this.#start().format('YYYY-MM-DD HH:mm'),
            end: this.#end().format('YYYY-MM-DD HH:mm'),
            days: this.days,
            expenses: this.expenses,
        };
        dragDrop.formData.set('data', JSON.stringify(data));
        this.fileService.uploadTravelExpenses(dragDrop.formData, () => dragDrop.clear());
    }

    updateDays() {
        const response: TDay[] = [];
        const end = this.#end().endOf('day');
        let m = this.#start().startOf('day');
        while (m.isSameOrBefore(end)) {
            response.push({ name: m.format('YYYY-MM-DD'), brunch: false, lunch: false, dinner: false, sleep: true, base: this.pauschLarge, sum: 0 });
            m = m.add(1, 'day');
        }
        this.twoDayTrip.set(response.length === 2);
        if (response.length === 2 && !this.withSleep()) response.pop();
        if (response.length) {
            response.first()!.base = this.pauschSmall;
            response.last()!.base = this.pauschSmall;
        }
        this.timeDiff = this.#end().diff(this.#start(), 'hours');
        this.days = response;
    }

    addExpense = (type: number) => this.expenses.push(new this.types[type][1](type));
    sumFor = (_: TDay) => Math.max(0, _.base - this.pauschLarge * (0.2 * (_.brunch ? 1 : 0) + 0.4 * (_.lunch ? 1 : 0) + 0.4 * (_.dinner ? 1 : 0)) + (!_.sleep ? this.pauschSleep : 0));
}
