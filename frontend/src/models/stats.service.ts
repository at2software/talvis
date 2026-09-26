import { Service } from '@angular/core';
import { TalvisHttpService } from './http/http.talvis';
import { User } from './user/user.model';
import { CustomerRevenueScatterDto, InvoiceOverallDto, LinearRegressionDataDto, ProjectProductMixDto, ProjectSuccessRateDto, ProjectWarrantyLoadDto, QuoteAcceptanceSignalCurveDto, QuoteAccuracyPointDto, RevenueCurrentYearDto, WorkingTimeDto } from '@models/_core/api-response';

@Service()
export class StatsService extends TalvisHttpService<any> {
    apiPath = 'stats';

    quoteAcceptanceSignalCurve              = (signal: string) => this.get<QuoteAcceptanceSignalCurveDto>(`stats/quote-acceptance-signal-curve/${signal}`);
    showMyWorkingTime                       = () => this.get<WorkingTimeDto>('stats/my-working-time');
    showLinearRegressionForecast            = () => this.get<LinearRegressionDataDto>('stats/linear-regression-forecast');
    showRevenueCurrentYear                  = () => this.get<RevenueCurrentYearDto>('stats/revenue-current-year');
    showSvB                                 = () => this.get('stats/service-vs-budget');
    showTeamStatus                          = () => this.aget('stats/team-status', {}, User);
    showQuoteAccuracy                       = (period: { startDate: string; endDate: string }) => this.aget<QuoteAccuracyPointDto>('stats/quote-accuracy', period);
    showProjectProductMix                   = (period: { startDate: string; endDate: string }) => this.get<ProjectProductMixDto>('stats/project-product-mix', period);
    showProjectSuccessRate                  = (period: { startDate: string; endDate: string }) => this.get<ProjectSuccessRateDto>('stats/project-success-rate', period);
    showProjectWarrantyLoad                 = (period: { startDate: string; endDate: string }) => this.get<ProjectWarrantyLoadDto>('stats/project-warranty-load', period);
    showInvoiceOverall                      = () => this.get<InvoiceOverallDto>('stats/invoice-overall');
    showFocusCategories                     = () => this.get('stats/focus-categories');
    showPredictionAccuracy                  = () => this.get('stats/prediction-accuracy');
    showFocusAccuracy                       = () => this.get('stats/focus-accuracy');
    getCustomerRevenueScatter               = () => this.get<CustomerRevenueScatterDto>('stats/customer-revenue-scatter');
}
