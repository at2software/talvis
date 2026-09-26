import { Dictionary } from '@constants/constants';
import { Service } from '@angular/core';
import { map } from 'rxjs';
import { PdfCreationType } from '@enums/PdfCreationType';
import { Invoice } from '@models/invoice/invoice.model';
import { TalvisHttpService } from '../http/http.talvis';
import { Expense } from '@models/expense/expense.model';
import { CustomerStatsDto, LiquidityDto, TimeValuePointDto } from '@models/_core/api-response';

@Service()
export class InvoiceService extends TalvisHttpService<Invoice> {
    public apiPath = 'invoices';
    indexPaginated = (filters?: Dictionary) => this.paginate(this.apiPath, filters);
    override readonly model = Invoice;

    showLastPayments = () => this.aget('invoices/last-payments');
    cancel = (invoice: Invoice) => this.post(`invoices/${invoice.id}/cancel`);

    makePdf = (path: string, type: PdfCreationType = PdfCreationType.Preview) => this.get(path + '/pdf', { type: type });
    showCashFlow = () => this.paginate('invoices/cashflow', {}, Expense);

    getCurrentNumber = () => this.get('invoices/current_no', {}, Object).pipe(map((r) => r.value));
    getCustomerStats = () => this.get<CustomerStatsDto>('companies/stats');
    getMonthlyRevenueRanges = () => this.get('invoices/monthly-revenue-ranges', {}, Object);
    getMonthlySpiralRevenue = () => this.aget<TimeValuePointDto>('invoices/monthly-spiral-revenue');
    getLiquidity = () => this.get<LiquidityDto>('invoices/liquidity');
}
