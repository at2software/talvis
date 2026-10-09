import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbDateAdapter, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalEditComponent } from '@app/_modals/modal-edit.component';
import { NgbDateCarbonAdapter } from '@directives/ngb-date.adapter';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { Cash } from '@models/cash/cash.model';
import { GlobalService } from '@models/global.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-edit-cash',
    templateUrl: './modal-edit-cash.component.html',
    providers: [{ provide: NgbDateAdapter, useClass: NgbDateCarbonAdapter }],
    imports: [FormsModule, NgbDatepickerModule, HotkeyDirective],
})
export class ModalEditCashComponent extends ModalEditComponent<Cash> {
    global = inject(GlobalService);

    new = () => Cash;
    keys = () => ['occured_at', 'value', 'description', 'approver'];
}
