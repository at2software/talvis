import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { SentinelOptionField } from '@app/profile/profile-sentinels/sentinel-condition-option-field.model';
import { modelListResource } from '@models/http/model-resource';
import { WebhookEndpoint } from '@models/webhook/webhook-endpoint.model';
import { WebhookEndpointService } from '@models/webhook/webhook-endpoint.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'webhook-endpoint-select',
    templateUrl: './webhook-endpoint-select.component.html',
    styleUrl: './webhook-endpoint-select.component.scss',
    imports: [NgbDropdownModule],
})
export class WebhookEndpointSelectComponent {
    option = input.required<SentinelOptionField>();

    readonly #service = inject(WebhookEndpointService);
    readonly endpoints = modelListResource(() => this.#service.index()).value;
    readonly #value = signal<string | undefined>(undefined);
    readonly selectedId = computed(() => this.#value() ?? String(this.option().value ?? ''));
    readonly selected = computed(() => this.endpoints().find((_) => _.id == this.selectedId()));

    select(endpoint: WebhookEndpoint) {
        this.option().value = String(endpoint.id);
        this.#value.set(String(endpoint.id));
    }
}
