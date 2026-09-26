import { Dictionary } from '@constants/constants';
import type { Dayjs } from '@constants/date/dates';
import type { Milestone } from '../milestone/milestone.model';
import type { Task } from '../task/task.model';
import type { Encryption } from '../encryption/encryption.model';
import type { Company } from '../company/company.model';
import type { Project } from '../project/project.model';
import type { User } from '../user/user.model';
import type { Product } from '../product/product.model';
import type { CompanyContact } from '../company/company-contact.model';
import type { UserEmployment } from '../user/user-employment.model';
import type { ProjectState } from '../project/project-state.model';
import type { LeadSource } from '../project/lead-source.model';
import type { Expense } from '../expense/expense.model';
import type { INxContextMenu } from '@models/_core/nx.contextmenu.interface';

export interface XYPointDto<TX = string | number> {
    x: TX;
    y: number;
}

export interface ParamChartPointDto extends XYPointDto<string> {
    min: number;
    max: number;
}
export interface JubileeEntryDto {
    name: string; next: Dayjs; label: string; type: number; path: string;
}
export interface TimeBasedEmployeeDto {
    id: string; name: string; path: string; duration: number;
}
export interface MilestonesDto {
    milestones: Milestone[];
    project_tasks: Task[];
}

export interface ConvertDto {
    milestones_created: number;
}

export interface ParamChartSeriesDto {
    name: string;
    current?: number;
    data: ParamChartPointDto[];
}
export interface CashflowSeriesDto<T = unknown> {
    objects: T[];
    history?: ParamChartSeriesDto[]
}

interface SankeyNodeDto {
    id: number;
    name: string;
    color: string;
    is_finished?: boolean;
}

interface SankeyLinkDto {
    source: number;
    target: number;
    count: number;
    net: number;
}

export interface SankeyDataDto {
    nodes: SankeyNodeDto[];
    links: SankeyLinkDto[];
}

export type TimeValuePointDto<TExtra extends object = object> = { period: string; value: number } & TExtra;

export interface WorkInfoEntryDto {
    key: string;
    day: string;
    value: number;
    class: string;
    required: number;
}

export interface WorkingTimeDto {
    workinfo: WorkInfoEntryDto[];
    data: { key: string; value: number }[];
    work_this_week: number;
    required_work_this_week: number;
    required_hours: number;
    average: number;
}

export interface RevenueEntryDto {
    sum: number;
    month?: string;
}

export interface RevenueMonthEntryDto {
    sum: number;
    month: string;
}

export interface InvoiceOverallEntryDto {
    year: number;
    sum: number;
}

export interface InvoiceOverallDto {
    current: InvoiceOverallEntryDto[];
}

export interface CustomerRevenueScatterAxesDto {
    cross_sell_ratio: number;
    customer_age: number;
    lifetime_revenue: number;
    project_count: number;
    months_since_last: number;
}

export interface CustomerRevenueScatterPointDto {
    id: number;
    name: string;
    new_revenue: number;
    followup_revenue: number;
    total_revenue: number;
    customer_age_months: number;
    initial_group_id: number;
    initial_group_name: string;
    initial_group_color: string;
    x: CustomerRevenueScatterAxesDto;
}

export interface CustomerRevenueScatterDto {
    points: CustomerRevenueScatterPointDto[];
}

export interface RevenueCurrentYearDto {
    revenue: number;
    expenses: number;
    current: RevenueEntryDto[];
    last: RevenueMonthEntryDto[];
    revenue12?: RevenueMonthEntryDto[];
    expensesByMonth?: RevenueMonthEntryDto[];
}

export interface LinearRegressionDataDto {
    current: { forecast: number; r2: number; standard_error: number; formula: string; generated_at: string };
    historical_data: { date: string; forecast: number; r2: number; standard_error: number; annual_expenses: number; revenue_12?: number }[];
    meta: { data_points: number; date_range: { from: string; to: string } };
}

export interface PluginEntryDto extends Encryption {
    type: string;
    displayName: string;
}

export interface HolidayDto {
    date: Dayjs;
    datum: string;
    hinweis: string;
    name: string;
}

export interface GitlabProjectDto {
    id: number;
    name: string;
    path_with_namespace: string;
    default_branch?: string;
}

export interface QuoteAccuracyPointDto { net: number; average: number; stddev: number; }
export interface QuoteAcceptanceSignalPointDto { x: number; y: number; count: number; }
export interface QuoteAcceptanceSignalCurveDto { signal: string; points: QuoteAcceptanceSignalPointDto[]; }
export interface EchartsSeriesDto { name: string; data?: unknown[]; areaStyle?: object; [key: string]: unknown; }
export interface TooltipParamsDto { color: string; seriesName: string; value: [string | number, number]; }
export interface StatsDataDto {
    svb?: { series: EchartsSeriesDto[]; chart: { height: number; stacked?: boolean }; [key: string]: unknown };
    quote_accuracy?: object;
    quote_acceptance_signal?: object;
    product_mix?: object;
    revenue_by_group?: object;
    finished_timeline?: object;
    success_rate?: object;
    warranty_share?: object;
    warranty_by_project?: object;
}

export interface ParticipatingCompanyDto {
    id: number;
    connection_id: string;
    other_company: Company;
    project_count: number;
}

export type MonthlyBiasDataDto = TimeValuePointDto<{ projects_count: number }>;

export interface DebriefStatsDto {
    total_debriefs: number;
    completed_debriefs: number;
    draft_debriefs: number;
    total_problems_recorded: number;
    avg_problems_per_debrief: number;
    avg_solution_effectiveness: number;
    total_unique_problems: number;
    total_unique_solutions: number;
}

interface CategoryMetaDto {
    category_id: string;
    category_name: string;
    category_color: string;
    category_icon: string;
}

// Template only - not exported, mirrors the backend's ->only(['id','name','icon']) / Company::onlyAvatar() projection
interface AvatarRefDto {
    id: string;
    name: string;
    icon: string;
}

export interface ProblemSummaryDto {
    id: string;
    title: string;
    severity?: string;
    usage_count?: number;
    projects?: AvatarRefDto[];
}

export interface CategoryBreakdownDto extends CategoryMetaDto {
    total_problems: number;
    severity_counts: { low: number; medium: number; high: number; critical: number };
    weighted_score: number;
    problems?: ProblemSummaryDto[];
}

export interface CategoryBreakdownPositivesDto extends CategoryMetaDto {
    total_positives: number;
}

export interface TrendDataDto {
    month: string;
    debriefs_count: number;
    problems_count: number;
}

export interface DebriefStatsResponseDto<TProblem = Dictionary, TSolution = Dictionary, TPositive = Dictionary, TCustomer = Dictionary> {
    aggregated?: DebriefStatsDto;
    categories?: CategoryBreakdownDto[];
    categories_positives?: CategoryBreakdownPositivesDto[];
    top_problems?: TProblem[];
    top_solutions?: TSolution[];
    top_positives?: TPositive[];
    trends?: TrendDataDto[];
    top_customers_worst?: TCustomer[];
    top_customers_best?: TCustomer[];
}

export interface TeamMemberDataDto {
    encryptions?: Encryption[];
}

export interface DataLabelFormatterContextDto {
    seriesIndex: number;
    dataPointIndex: number;
    w: { config: { series: { name: string }[] } };
}

export interface ChartAxisTooltipParamDto {
    axisValue?: string;
    value?: number;
    color?: string;
    seriesName?: string;
}

export interface ProductStatisticsTimelineEntryDto {
    group_id: number;
    group_name: string;
    group_color?: string;
    total_net: string | number;
}

export interface ProductStatisticsDto {
    top_products: Product[];
    fastest_sellers: Product[];
    most_repurchased: Product[];
    timeline: Record<string, ProductStatisticsTimelineEntryDto[]>;
}

export interface ProductCustomersDto {
    customers: Company[];
    total_revenue: number;
    total_customers: number;
}

export interface ProjectProductMixGroupDto {
    id: number;
    name: string;
    color?: string;
    count: number;
    net: number;
}

export interface ProjectProductMixTimelineEntryDto {
    period: string;
    groups: Record<string, { count: number; net: number }>;
}

export interface ProjectProductMixDto {
    total: number;
    groups: ProjectProductMixGroupDto[];
    unassigned: { count: number; net: number };
    timeline: ProjectProductMixTimelineEntryDto[];
}

export interface ProjectSuccessRateDto {
    successful: number;
    unsuccessful: number;
}

export interface ProjectWarrantyLoadDto {
    regular_hours: number;
    warranty_hours: number;
    projects: { id: string; name: string; warranty_hours: number; regular_hours: number }[];
}

export interface QuoteAcceptanceSuggestionDto {
    feature: 'item_count' | 'net' | 'discount_pct' | 'prefix_length';
    from: number;
    to: number;
    delta: number;
    new_probability: number;
}

/** Response of App\Services\Project\ProjectQuoteAcceptanceService::build() - always computed on demand, never persisted. */
export interface QuoteAcceptancePredictionDto {
    probability: number | null;
    decided: boolean;
    actual_outcome: boolean | null;
    features: {
        item_count: number;
        net: number;
        discount_pct: number;
        prefix_length: number;
        days_pending: number;
        company_acceptance_rate: number | null;
        company_prior_decided_count: number;
    };
    suggestions: QuoteAcceptanceSuggestionDto[];
}

export type PaymentPlanStepStatus = 'open' | 'prepared' | 'invoiced';

export interface PaymentPlanDownpaymentDto {
    id: number;
    text: string;
    net: number;
    invoice: { id: number; name: string; created_at: string; sent: number; paid_at: string | null } | null;
}

export interface PaymentPlanStepDto {
    trigger: string;
    percentage: number;
    months: number | null;
    month_index: number | null;
    amount: number;
    status: PaymentPlanStepStatus;
    item: PaymentPlanDownpaymentDto | null;
}

/** Response of App\Traits\HasPaymentPlanTrait::getPaymentPlanOverview() - the agreed plan with each step matched to an existing downpayment item by net value. */
export interface PaymentPlanOverviewDto {
    net: number;
    is_custom: boolean;
    tier_label: string | null;
    steps: PaymentPlanStepDto[];
    unmatched: PaymentPlanDownpaymentDto[];
}

export interface ProductSplitItemDto {
    id: number;
    text: string;
    project_name?: string;
    selectedProduct?: Product | null;
    product_source_id?: number | string | null;
}

export interface AISuggestionDto {
    name: string;
    itemIds?: number[];
}

export interface LoginDto {
    user?: { id: string; api_token?: string };
}

export interface BankLookupDto {
    url?: string;
    name?: string;
}

export interface ParamValueDto {
    value?: string;
}

export interface TbeRowDto {
    month: string;
    type: number;
    duration: number;
    excluded: number;
    raw: number;
    vacation: number;
    description: string;
}

export interface TimeBasedEmploymentInfoDto {
    tbe_projects?: Dictionary[];
    tbe_table?: TbeRowDto[];
    employments: UserEmployment[];
    roles: { name: string }[];
}

export interface RemarketingDto {
    due?: Company[];
    observed?: Company[];
    suggested?: Company[];
}

export interface ProspectActivityCountDto {
    count: number;
}

export interface ProspectStatsDto {
    total?: number;
    by_status?: {
        new?: number;
        engaged?: number;
        converted?: number;
        unresponsive?: number;
        disqualified?: number;
        on_hold?: number;
    };
    activities_pending?: number;
    activities_overdue?: number;
}

export interface MarketingDashboardHeatmapEntryDto {
    date: string;
    total: number;
    completed: number;
    pending: number;
}

export interface MarketingDashboardLeadSourceDto {
    name: string;
    converted?: number;
    total?: number;
}

export interface MarketingDashboardTopInitiativeDto {
    id: number;
    name: string;
    total_prospects: number;
    converted: number;
    conversion_rate: number;
}

export interface MarketingDashboardTeamMemberDto {
    id: number;
    name: string;
    completed_30d: number;
    overdue: number;
}

export interface MarketingDashboardConversionDto {
    id: number;
    name: string;
    company?: string;
    initiative?: string;
    converted_at: string;
}

export interface MarketingDashboardWorkflowDto {
    id: number;
    name: string;
    converted_prospects: number;
    total_workflow_prospects: number;
    prospect_conversion_rate: number;
    completed_activities: number;
    total_activities: number;
    completion_rate: number;
}

export interface MarketingDashboardStatsDto {
    heatmap?: MarketingDashboardHeatmapEntryDto[];
    aging?: { fresh?: number; warm?: number; cooling?: number; stale?: number };
    lead_sources?: MarketingDashboardLeadSourceDto[];
    top_initiatives?: MarketingDashboardTopInitiativeDto[];
    team_performance?: MarketingDashboardTeamMemberDto[];
    recent_conversions?: MarketingDashboardConversionDto[];
    workflow_effectiveness?: MarketingDashboardWorkflowDto[];
}

export interface InitiativeTimelineEntryDto {
    timestamp: number;
    new?: number;
    engaged?: number;
    unresponsive?: number;
    converted?: number;
}

export type ActivityStatsMapDto = Record<string, ActivityStatsDto> | (ActivityStatsDto & { id: string | number })[];

export interface InitiativeStatsDto {
    timeline: InitiativeTimelineEntryDto[];
    activities?: ActivityStatsMapDto;
    activity_stats?: ActivityStatsMapDto;
    initiative_activities?: ActivityStatsMapDto;
    per_activity?: ActivityStatsMapDto;
}

export interface CustomerStatsDto {
    companies?: Company[];
    total_last_year?: number;
}

export interface CustomerLocationDto {
    id: string;
    name: string;
    lat: number;
    lng: number;
    path: string;
    pinSize: 'small' | 'medium' | 'large';
    pinColor: 'grey' | 'red' | 'orange' | 'yellow' | 'green';
}

export interface RoleWithPermissionsDto {
    id: number;
    name: string;
    permissions: Record<string, boolean>;
}

export interface RawBankTxDto {
    date: string;
    amount: number;
    sender: string;
    reference: string;
}

export interface RawMatchedBankItemDto {
    expense: Expense;
    is_amount_mismatch: boolean;
    latest_amount: number | string;
    transactions: RawBankTxDto[];
}

export interface BankTransactionsDto {
    matched?: RawMatchedBankItemDto[];
    unmatched?: RawBankTxDto[];
}

export interface TableColumnDto {
    Field: string;
    Type: string;
    Null?: string;
    Key?: string;
    Default?: string | null;
    Extra?: string;
}

export interface TableSchemaDto {
    name: string;
    columns: TableColumnDto[];
}

export interface RelationInfoDto {
    type: string;
    model?: string;
}

export interface TableRelationDto {
    table: string;
    relations: Dictionary<RelationInfoDto>;
}

export interface DashboardWidgetConfigDto {
    widget: string;
    options: Dictionary<unknown>;
}

export interface DashboardDto {
    title: string;
    cols: DashboardWidgetConfigDto[][];
}

export interface SentinelLabelConfigDto {
    name: string;
    primaryLabel: string;
    secondaryLabel: string;
}

export interface SentinelActiveItemDto extends Dictionary, INxContextMenu {
    id: string;
    icon?: string;
}

export interface SentinelActiveGroupDto {
    id: string;
    sentinel: SentinelLabelConfigDto;
    items: SentinelActiveItemDto[];
}

export interface ActivityStatsDto {
    total: number;
    pending: number;
    overdue: number;
    completed: number;
    skipped: number;
    pending_percentage: number;
    overdue_percentage: number;
    completed_percentage: number;
    skipped_percentage: number;
}

export interface BillingConsiderationDto {
    type: 'warning' | 'error';
    label: string;
    tooltip: string;
    project_id?: string;
    uninvoiced_hours?: number;
    invoice_item_id?: string;
}

export interface PredictionEntryDto { id: number; user: User; total: number; }
export interface PredictionStatsDto { total: number; predictions?: PredictionEntryDto[]; }

export interface ProjectTimelineEntryDto {
    user?: { id?: string; name?: string; color?: string; hours_invested?: number };
    data: TimeValuePointDto[];
}

export interface DailyWorkloadElementDto {
    type: 'assignment' | 'milestone';
    id: string;
    name: string;
    hours: number;
    project_id?: string;
    project_path?: string;
    project?: Project;
    project_name?: string;
    workload_percent?: number;
}

export interface DailyWorkloadDto {
    date: string;
    day_of_week: number;
    total_percent: number;
    available_hours: number;
    assignment_hours: number;
    milestone_hours: number;
    total_hours: number;
    is_break: boolean;
    break_type?: string;
    break_name?: string;
    elements: DailyWorkloadElementDto[];
    distinct_project_count: number;
}

export interface WorkloadDataDto {
    user_id: string;
    start_date: string;
    end_date: string;
    hpw: number;
    hpw_array: number[];
    daily_workload: DailyWorkloadDto[];
    unconfigured_milestones: Milestone[];
}

export interface UserEnvironmentDto {
    user: Dictionary;
    team: Dictionary<TeamMemberDataDto>;
    settings: Dictionary<any>;
    enums: Dictionary;
    tables: TableSchemaDto[];
    relations: TableRelationDto[];
    accessors?: Dictionary<Dictionary<string>>;
    dashboards: DashboardDto[];
    plugins: Dictionary;
    project_states: ProjectState[];
    lead_sources: LeadSource[];
    roles?: unknown[];
    eu_countries: string[];
    encryptions: Encryption[];
}

export interface UptimeCheckDayDto {
    day: string;
    up_count: number;
    down_count: number;
    degraded_count: number;
    total: number;
}

export interface UptimeTestCheckDto {
    check: {
        status: string;
        status_code?: number;
        response_time?: number;
        error_message?: string;
    };
}

export interface LiquidityEventDto {
    date: string;
    amount: number;
    type: 'expense' | 'standing_order' | 'open_invoice' | 'budget_project' | 'support' | 'downpayment';
    label: string;
    balance_after: number;
    invoice_date?: string;
    payment_days?: number;
}

export interface LiquidityDto {
    balance: number;
    events?: LiquidityEventDto[];
}

export interface AiModelDto {
    id: string;
    name: string;
    owned_by: string;
}

export interface AiCompletionDto {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface CsvColumnMappingDto {
    header: string;
    field: string;
}

export interface CsvImportResultDto {
    mappings: CsvColumnMappingDto[];
    rows: string[][];
    initiativeId: string;
    leadSourceId: number;
}

export interface PlzEntryDto {
    osm_id: number;
    ort: string;
    plz: number | string;
    bundesland: string;
}

export interface CountryEntryDto {
    name: string;
    alpha2: string;
    'country-code': string;
}

export interface TravelAllowanceRatesDto {
    country: string;
    kleinePauschale: number; // Small allowance (arrival/departure day)
    grossePauschale: number; // Large allowance (full 24-hour day)
    uebernachtung: number; // Accommodation allowance
}

export type CompanyContactStoreDto = Omit<CompanyContact, 'company'> & { company: Dictionary };

export interface RoleManagementDto {
    roles?: Dictionary[];
    users?: Dictionary[];
}
