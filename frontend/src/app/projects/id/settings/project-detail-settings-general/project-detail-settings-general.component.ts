import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { AutosaveDirective } from '@directives/autosave.directive';
import { PermissionsDirective } from '@directives/permissions.directive';
import { GlobalService } from '@models/global.service';
import { NgbDate, NgbDateAdapter, NgbDatepickerModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { NgbDateCarbonAdapter } from '@directives/ngb-date.adapter';
import { ProjectDefaultProductComponent } from '@app/projects/_shards/project-default-product/project-default-product.component';
import { ParentProjectSelectorComponent } from '@app/projects/_shards/parent-project-selector/parent-project-selector.component';
import { AffixInputDirective } from '@directives/affix-input.directive';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, PermissionsDirective, AutosaveDirective, DatePipe, ProjectDefaultProductComponent, ParentProjectSelectorComponent, AffixInputDirective, NgbDatepickerModule, NgbTooltipModule],
    providers: [{ provide: NgbDateAdapter, useClass: NgbDateCarbonAdapter }],
    selector: 'project-detail-settings-general',
    templateUrl: './project-detail-settings-general.component.html',
})
export class ProjectDetailSettingsGeneralComponent {
    parent = inject(ProjectDetailGuard);
    global = inject(GlobalService);
    #inputModalService = inject(InputModalService);

    onIndividualWageToggle($event: Event) {
        const object = this.parent.object();
        if (($event.target as HTMLInputElement).checked) {
            object.individual_wage = parseFloat(this.global.setting('INVOICE_HOURLY_WAGE'));
        } else {
            object.individual_wage = undefined;
        }
        object.update({ individual_wage: object.individual_wage ?? null }).subscribe();
    }
    onProjectUpdate = () => this.parent.object().update().subscribe();

    updateDate = (field: string, date: NgbDate) => {
        const d = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
        this.parent.object().update({ [field]: d }).subscribe();
    };

    clearDate = (field: string) => {
        this.parent.object().update({ [field]: null }).subscribe();
    };

    onChangePaymentDuration() {
        this.#inputModalService.open($localize`:@@i18n.projects.setPaymentDuration:Set payment duration in days`).then((result) => {
            if (result?.text) {
                this.parent.object().updateParam('INVOICE_PAYMENT_DURATION', { value: result.text }).subscribe(() => this.parent.reload());
            }
        });
    }

    removePaymentDuration() {
        this.parent.object().httpService.delete(this.parent.object().getParamPath('INVOICE_PAYMENT_DURATION')).subscribe(() => this.parent.reload());
    }
}
