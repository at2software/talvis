import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputSettingsGroupComponent } from '@shards/input-group/input-settings-group.component';
import { TalvisHttp } from '@models/http/http.talvis';
import { ParamValueDto } from '@models/_core/api-response';
import { modelResource } from '@models/http/model-resource';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

const parseThresholds = (param?: ParamValueDto): number[] => {
    try {
        return param?.value ? JSON.parse(param.value) : [];
    } catch {
        return [];
    }
};

@Component({
    selector: 'settings-projects-notifications',
    templateUrl: './settings-projects-notifications.component.html',
    imports: [InputSettingsGroupComponent, FormsModule, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProjectsNotificationsComponent {
    newThreshold = signal<number | null>(null);
    newItemThreshold = signal<number | null>(null);
    readonly years = $localize`:@@i18n.common.years:years`;
    readonly hours = $localize`:@@i18n.foci.hoursPlaceholder:hours`;

    #http = inject(TalvisHttp);

    readonly #param = modelResource(() => this.#http.get<ParamValueDto | undefined>('params/PROJECT_WORK_THRESHOLDS'));
    readonly thresholdsLoading = this.#param.isLoading;
    readonly thresholds = linkedSignal(() => parseThresholds(this.#param.value()));

    readonly #itemParam = modelResource(() => this.#http.get<ParamValueDto | undefined>('params/INVOICE_ITEM_WORK_THRESHOLDS'));
    readonly itemThresholdsLoading = this.#itemParam.isLoading;
    readonly itemThresholds = linkedSignal(() => parseThresholds(this.#itemParam.value()));

    addThreshold() {
        const val = Number(this.newThreshold());
        if (!val || val <= 0 || this.thresholds().includes(val)) return;
        this.thresholds.set([...this.thresholds(), val].sort((a, b) => a - b));
        this.newThreshold.set(null);
        this.#save('PROJECT_WORK_THRESHOLDS', this.thresholds());
    }

    removeThreshold(threshold: number) {
        this.thresholds.set(this.thresholds().filter((t) => t !== threshold));
        this.#save('PROJECT_WORK_THRESHOLDS', this.thresholds());
    }

    addItemThreshold() {
        const val = Number(this.newItemThreshold());
        if (!val || val <= 0 || this.itemThresholds().includes(val)) return;
        this.itemThresholds.set([...this.itemThresholds(), val].sort((a, b) => a - b));
        this.newItemThreshold.set(null);
        this.#save('INVOICE_ITEM_WORK_THRESHOLDS', this.itemThresholds());
    }

    removeItemThreshold(threshold: number) {
        this.itemThresholds.set(this.itemThresholds().filter((t) => t !== threshold));
        this.#save('INVOICE_ITEM_WORK_THRESHOLDS', this.itemThresholds());
    }

    #save = (key: string, thresholds: number[]) => this.#http.put(`params/${key}`, { value: JSON.stringify(thresholds) }).subscribe();
}
