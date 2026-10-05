import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { GlobalService } from '@models/global.service';
import { Project } from '@models/project/project.model';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';

const PARAM_KEY = 'QUOTE_VALIDITY_DURATION';
const FALLBACK_DAYS = '30';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-quote-validity',
    imports: [NgbTooltipModule],
    templateUrl: './project-quote-validity.component.html',
})
export class ProjectQuoteValidityComponent {
    project = input.required<Project>();

    #global = inject(GlobalService);
    #inputModalService = inject(InputModalService);

    readonly individual = linkedSignal(() => this.project().getParam(PARAM_KEY));
    readonly effective = computed(() => this.individual() || this.project().company?.getParam(PARAM_KEY) || this.#global.setting(PARAM_KEY) || FALLBACK_DAYS);

    change() {
        const project = this.project();
        this.#inputModalService.open($localize`:@@i18n.projects.setQuoteValidity:Set quote validity in days`, false, undefined, this.effective()).then((result) => {
            if (!result?.text) return;
            project.updateParam(PARAM_KEY, { value: result.text }).subscribe(() => this.individual.set(result.text));
        });
    }

    remove() {
        this.project()
            .removeParam(PARAM_KEY)
            .subscribe(() => this.individual.set(undefined));
    }
}
