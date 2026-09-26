import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputSettingsGroupComponent } from '@shards/input-group/input-settings-group.component';
import { TalvisHttp } from '@models/http/http.talvis';
import { ParamValueDto } from '@models/_core/api-response';
import { modelResource } from '@models/http/model-resource';

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
    imports: [InputSettingsGroupComponent, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProjectsNotificationsComponent {
    newThreshold = signal<number | null>(null);
    readonly years = $localize`:@@i18n.common.years:years`;

    #http = inject(TalvisHttp);

    readonly #param = modelResource(() => this.#http.get<ParamValueDto | undefined>('params/PROJECT_WORK_THRESHOLDS'));
    readonly thresholds = linkedSignal(() => parseThresholds(this.#param.value()));

    addThreshold() {
        const val = Number(this.newThreshold());
        if (!val || val <= 0 || this.thresholds().includes(val)) return;
        this.thresholds.set([...this.thresholds(), val].sort((a, b) => a - b));
        this.newThreshold.set(null);
        this.#save();
    }

    removeThreshold(threshold: number) {
        this.thresholds.set(this.thresholds().filter((t) => t !== threshold));
        this.#save();
    }

    #save = () => this.#http.put('params/PROJECT_WORK_THRESHOLDS', { value: JSON.stringify(this.thresholds()) }).subscribe();
}
