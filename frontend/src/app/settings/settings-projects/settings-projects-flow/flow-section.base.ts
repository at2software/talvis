import { Directive, inject, input, output } from '@angular/core';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { FlowAdminService } from '@models/flow/flow-admin.service';
import type { Dictionary } from '@constants/constants';
import type { FlowAdminConfigDto, FlowConfigResource } from '@models/_core/api-response';

@Directive()
export abstract class FlowSectionBase {
    readonly #service = inject(FlowAdminService);
    readonly #confirm = inject(ConfirmationService);

    readonly config = input.required<FlowAdminConfigDto>();
    readonly changed = output<void>();

    stateName = (id: number | null | undefined): string => this.config().states.find((_) => _.id === id)?.name ?? '–';

    save(resource: FlowConfigResource, id: number, payload: Dictionary) {
        this.#service.change(resource, id, payload).subscribe({ next: () => this.changed.emit(), error: () => this.changed.emit() });
    }
    create(resource: FlowConfigResource, payload: Dictionary, done?: () => void) {
        this.#service.store(resource, payload).subscribe(() => {
            done?.();
            this.changed.emit();
        });
    }
    remove(resource: FlowConfigResource, id: number, label: string) {
        this.#confirm
            .confirm({ title: $localize`:@@i18n.flow.deleteTitle:delete`, message: `${label} — ${$localize`:@@i18n.flow.deleteMessage:delete this entry? The change is recorded in the protocol.`}` })
            .then(() => this.#service.remove(resource, id).subscribe(() => this.changed.emit()))
            .catch(() => undefined);
    }
    value = (event: Event): string => (event.target as HTMLInputElement | HTMLSelectElement).value;
    checked = (event: Event): boolean => (event.target as HTMLInputElement).checked;
    numberOrNull = (event: Event): number | null => {
        const raw = this.value(event).trim();
        return raw === '' ? null : +raw;
    };
}
