import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { Dictionary } from '@constants/constants';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { SetupService, validationErrors } from '@models/setup/setup.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface WorkingTimeForm {
    hpw: number;
    days: Dictionary<boolean>;
    work_zip: string;
    vacation_days: number;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-setup-working-time',
    templateUrl: './modal-setup-working-time.component.html',
    imports: [FormsModule, HotkeyDirective, SpinnerComponent],
})
export class ModalSetupWorkingTimeComponent extends ModalBaseComponent<boolean> {
    static override modalOptions: NgbModalOptions = { size: 'md' };

    readonly DAYS = [
        { key: 'mo', label: $localize`:@@i18n.setup.day.mo:Mon` },
        { key: 'tu', label: $localize`:@@i18n.setup.day.tu:Tue` },
        { key: 'we', label: $localize`:@@i18n.setup.day.we:Wed` },
        { key: 'th', label: $localize`:@@i18n.setup.day.th:Thu` },
        { key: 'fr', label: $localize`:@@i18n.setup.day.fr:Fri` },
        { key: 'sa', label: $localize`:@@i18n.setup.day.sa:Sat` },
        { key: 'su', label: $localize`:@@i18n.setup.day.su:Sun` },
    ];

    #setup = inject(SetupService);

    form = signal<WorkingTimeForm | undefined>(undefined);
    saving = signal(false);
    errors = signal<Dictionary<string>>({});

    init() {
        this.#setup.showWorkingTime().subscribe((workingTime) =>
            this.form.set({
                hpw: Object.values(workingTime.hours).reduce((sum, hours) => sum + Number(hours), 0),
                days: Object.fromEntries(this.DAYS.map((_) => [_.key, Number(workingTime.hours[_.key]) > 0])),
                work_zip: workingTime.work_zip,
                vacation_days: workingTime.vacation_days,
            }),
        );
    }
    onSuccess = () => true;

    workdays = (form: WorkingTimeForm) => this.DAYS.filter((_) => form.days[_.key]).length;
    hoursPerDay = (form: WorkingTimeForm) => (this.workdays(form) ? Math.round((Number(form.hpw) / this.workdays(form)) * 100) / 100 : 0);

    save() {
        const form = this.form();
        if (!form || this.saving() || !this.workdays(form)) return;
        this.saving.set(true);
        const hoursPerDay = this.hoursPerDay(form);
        this.#setup
            .updateWorkingTime({
                hours: Object.fromEntries(this.DAYS.map((_) => [_.key, form.days[_.key] ? hoursPerDay : 0])),
                work_zip: form.work_zip,
                vacation_days: form.vacation_days,
            })
            .subscribe({
                next: () => this.accept(),
                error: (err) => {
                    this.saving.set(false);
                    this.errors.set(validationErrors(err));
                },
            });
    }
}
