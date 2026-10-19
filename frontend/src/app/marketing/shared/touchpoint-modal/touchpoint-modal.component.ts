import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import type { TouchpointChannel } from '@models/marketing/marketing-touchpoint.model';
import type { TouchpointPayloadDto } from '@models/_core/api-response';
import { TouchpointFormComponent } from '../touchpoint-form/touchpoint-form.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'touchpoint-modal',
    templateUrl: './touchpoint-modal.component.html',
    imports: [TouchpointFormComponent],
})
export class TouchpointModalComponent extends ModalBaseComponent<TouchpointPayloadDto> {
    static override modalOptions: NgbModalOptions = {};

    title = signal('');
    channel = signal<TouchpointChannel>('call');
    channelLocked = signal(false);
    withRetry = signal(false);
    #payload?: TouchpointPayloadDto;

    init(args: { title: string; channel?: TouchpointChannel; channelLocked?: boolean; withRetry?: boolean }) {
        this.title.set(args.title);
        this.channel.set(args.channel ?? 'call');
        this.channelLocked.set(!!args.channelLocked);
        this.withRetry.set(!!args.withRetry);
    }

    onSubmitted(payload: TouchpointPayloadDto) {
        this.#payload = payload;
        this.accept();
    }

    onSuccess = (): TouchpointPayloadDto => this.#payload!;
}
