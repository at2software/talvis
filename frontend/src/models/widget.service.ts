import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { Invoice } from './invoice/invoice.model';
import { ApiType, TalvisHttpService } from './http/http.talvis';
import { Serializable } from '@models/_core/serializable';
import { map } from 'rxjs';
import { JubileeEntryDto, TimeBasedEmployeeDto, CashflowSeriesDto } from '@models/_core/api-response';

export const mapToObject = <T>(item: unknown, type: ApiType<T>): T => typeof type.fromJson === 'function' ? (type.fromJson(item) as T) : (item as T);
@Service()
export class WidgetService extends TalvisHttpService<Serializable> {
    apiPath = 'widgets';
    preparedInvoices        = (options: Dictionary = {}) => this.get<Dictionary>('widgets/prepared-invoices', options);
    unpaidInvoices          = () => this.aget('widgets/unpaid-invoices', {}, Invoice);
    indexJubilees           = () => this.aget<JubileeEntryDto>('widgets/index-jubilees', {});
    indexTimeBasedEmployees = () => this.aget<TimeBasedEmployeeDto>('widgets/index-time-based-employees');
    indexNewItems           = () => this.aget('widgets/new-items', {}, Object);
    indexCashflow           = <T>(param: string, options: Dictionary = {}, _type: ApiType<T>) =>
        this.get<CashflowSeriesDto<T>>(`widgets/cashflow/${param}`, options)
            .pipe(map((response) => ({
                ...response,
                objects: [response.objects]
                    .flat()
                    .map((item) => mapToObject<T>(item, _type)),
            })),
        );
}
