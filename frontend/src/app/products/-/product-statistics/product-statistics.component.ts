import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTooltipModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@charts/echarts-presets';
import * as echarts from 'echarts/core';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { BarChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import { Nx } from '@app/nx/nx.directive';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ProductService } from '@models/product/product.service';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { MoneyPipe } from '@pipes/money.pipe';
import { dayjs, Dayjs } from '@constants/date/dates';
import type { EChartsOption } from 'echarts';
import { Dictionary } from '@constants/constants';
import { ChartAxisTooltipParamDto } from '@models/_core/api-response';
import { ProductGroup } from '@models/product/product-group.model';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

echarts.use([TitleComponent, TooltipComponent, LegendComponent, GridComponent, BarChart, CanvasRenderer]);

const CHART_BASE: EChartsOption = {
    tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
        formatter: (params) => {
            const items = params as ChartAxisTooltipParamDto[];
            let result = `<div style="text-align: center;"><strong>${items[0].axisValue}</strong></div>`;
            items.forEach((param) => {
                const value = param.value || 0;
                result += `<div style="display: flex; justify-content: space-between; align-items: center; margin: 2px 0; gap: 0.5rem;">`;
                result += `<span style="display: flex; align-items: center;">`;
                result += `<span style="display:inline-block;margin-right:5px;border-radius:10px;width:10px;height:10px;background-color:${param.color};"></span>`;
                result += `${param.seriesName}</span>`;
                result += `<span style="font-weight: bold;">€${value.toLocaleString()}</span>`;
                result += `</div>`;
            });
            return result;
        },
    },
    legend: { data: [], top: 5 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '15%' },
    xAxis: { type: 'category', data: [], axisPointer: { type: 'shadow' } },
    yAxis: {
        type: 'value',
        axisLabel: { formatter: '€{value}', inside: true, align: 'left', margin: -60 },
        splitLine: { lineStyle: { color: '#222' } },
    },
    series: [],
};

@Component({
    selector: 'product-statistics',
    templateUrl: './product-statistics.component.html',
    styleUrls: ['./product-statistics.component.scss'],
    imports: [DecimalPipe, FormsModule, NgbTooltipModule, NgbDropdownModule, NgxDaterangepickerMd, NgxEchartsDirective, Nx, ToolbarComponent, MoneyPipe, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductStatisticsComponent {
    readonly #productService = inject(ProductService);

    readonly period = signal<{ startDate: Dayjs; endDate: Dayjs } | undefined>({
        startDate: dayjs().subtract(3, 'year'),
        endDate: dayjs(),
    });

    readonly #rootGroups = modelListResource(() => this.#productService.getRootGroups());
    readonly rootGroups = this.#rootGroups.value;

    readonly selectedRootGroups = linkedSignal<ProductGroup[], ProductGroup[]>({
        source: this.rootGroups,
        computation: (groups) => groups.filter((g) => g.is_active),
    });

    readonly #statistics = modelResource(
        () => {
            const selected = this.selectedRootGroups();
            if (!this.rootGroups().length || !selected.length) return undefined;
            const p = this.period();
            const filters: Dictionary = {};
            if (p?.startDate) filters.dateStart = p.startDate.format('YYYY-MM-DD');
            if (p?.endDate) filters.dateEnd = p.endDate.format('YYYY-MM-DD');
            filters.rootGroupIds = selected.map((g) => g.id);
            return filters;
        },
        (filters) => this.#productService.showStatistics(filters),
    );
    readonly statistics = this.#statistics.value;
    readonly statsLoading = computed(() => this.#statistics.isLoading() || (!this.#rootGroups.hasValue() && this.#rootGroups.status() !== 'error'));

    readonly ranges = {
        'This year': [dayjs().startOf('year'), dayjs().endOf('year')],
        'Last year': [dayjs().subtract(1, 'year').startOf('year'), dayjs().subtract(1, 'year').endOf('year')],
        'Last 3 years': [dayjs().subtract(3, 'year'), dayjs()],
        'Last 5 years': [dayjs().subtract(5, 'year'), dayjs()],
        All: [dayjs('2000-01-01'), dayjs()],
    } satisfies Record<string, [Dayjs, Dayjs]>;

    readonly selectedGroupsText = computed(() => {
        const selected = this.selectedRootGroups();
        const all = this.rootGroups();
        if (!selected.length) return 'No groups selected';
        if (selected.length === all.length) return 'All groups';
        return `${selected.length} group${selected.length > 1 ? 's' : ''} selected`;
    });

    readonly chartOption = computed<EChartsOption>(() => {
        const timeline = this.statistics()?.timeline;
        if (!timeline) return CHART_BASE;

        const months = Object.keys(timeline).sort();
        const groups = new Map<number, { name: string; color: string }>();
        months.forEach((month) => {
            timeline[month].forEach((item) => {
                if (!groups.has(item.group_id)) groups.set(item.group_id, { name: item.group_name, color: item.group_color || '#007bff' });
            });
        });

        const series: NonNullable<EChartsOption['series']> = [];
        groups.forEach((group, groupId) => {
            series.push({
                name: group.name,
                type: 'bar',
                stack: 'revenue',
                emphasis: { focus: 'series' },
                itemStyle: { color: group.color },
                data: months.map((month) => {
                    const entry = timeline[month].find((item) => item.group_id === groupId);
                    return Math.max(0, entry ? parseFloat(String(entry.total_net)) : 0);
                }),
            });
        });

        return {
            ...CHART_BASE,
            legend: { ...CHART_BASE.legend, data: Array.from(groups.values()).map((g) => g.name) },
            xAxis: { ...CHART_BASE.xAxis, data: months.map((m) => dayjs(m + '-01').format('MMM YYYY')) },
            series,
        };
    });

    readonly hasChartData = computed(() => {
        const series = this.chartOption().series;
        return Array.isArray(series) && series.length > 0;
    });

    readonly toggleRootGroup = (group: ProductGroup) =>
        this.selectedRootGroups.update((groups) => {
            const index = groups.findIndex((g) => g.id === group.id);
            return index > -1 ? groups.filter((_, i) => i !== index) : [...groups, group];
        });

    readonly isRootGroupSelected = (group: ProductGroup) => this.selectedRootGroups().some((g) => g.id === group.id);
}
