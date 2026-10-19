import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { WidgetService } from '@models/widget.service';
import { dayjs } from '@constants/date/dates';
import { environment } from '@environments/environment';
import { WIDGET_SHARED } from '../widgets.shared';
import { DatePipe } from '@angular/common';
import { JubileeEntryDto } from '@models/_core/api-response';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-jubilees.component',
    templateUrl: './widget-jubilees.component.html',
    styleUrls: ['./widget-jubilees.component.scss', './../base.widget.component.scss'],
    imports: [...WIDGET_SHARED, DatePipe, SpinnerComponent],
})
export class WidgetJubileesComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);
    readonly env = environment;

    defaultOptions = () => ({});

    readonly #jubilees = this.optionsResource(() => this.#widgetService.indexJubilees());
    readonly jubilees = computed<JubileeEntryDto[]>(() =>
        (this.#jubilees.value() ?? [])
            .map((d) => ({ ...d, next: dayjs(d.next) }))
            .sort((a, b) => a.next.valueOf() - b.next.valueOf()),
    );

    readonly loaded = computed(() => this.#jubilees.hasValue() || this.#jubilees.status() === 'error');

    isToday = (_: JubileeEntryDto) => dayjs().isSame(_.next, 'day');
}
