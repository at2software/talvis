import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { Focus } from '@models/focus/focus.model';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { dayjs } from '@constants/date/dates';
import { FormsModule } from '@angular/forms';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { Dictionary } from '@constants/constants';

@Component({
    selector: 'modal-edit-focus',
    templateUrl: './modal-edit-focus.component.html',
    imports: [SearchInputComponent, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalEditFocusComponent extends ModalBaseComponent<Dictionary> {

    private readonly project = viewChild.required(SearchInputComponent);

    readonly title = signal('Focus');
    readonly focus = signal<Focus>(null!);
    readonly commentText = signal('');
    readonly dateTimeText = signal('');
    readonly durationText = signal('');
    readonly initialParent = computed(() => this.focus()?.parent);

    #activeModal = inject(NgbActiveModal);

    init(focus: Focus): void {
        this.focus.set(focus);
        this.commentText.set(focus.comment || '');
        this.dateTimeText.set(focus.momentStarted().format('DD.MM.YYYY HH:mm'));
        this.durationText.set(focus.duration.toString());
    }

    onSuccess() {
        const payload: Dictionary = {
            started_at: dayjs(this.dateTimeText(), 'DD.MM.YYYY HH:mm').format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
            duration: parseFloat(this.durationText()),
            comment: this.commentText(),
        };
        const selected = this.project().selected();
        if (selected) payload['parent_path'] = selected.apiPathWithId();
        return payload;
    }

    override decline = () => this.#activeModal.close(undefined);
}
