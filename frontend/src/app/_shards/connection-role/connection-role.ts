import { Component, computed, input } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Connection, ConnectionSource, ConnectionType } from '@models/company/connection.model';

@Component({
    selector: 'connection-role',
    template: `
        @if (option(); as _option) {
            <span class="small" [style.color]="'var(--tv-accent-' + _option.color + ')'">{{ isCompany1() ? _option.asCompany1 : _option.asCompany2 }}</span>
        }
        @if (source() === 'research') {
            <i class="small text-muted ms-1" ngbTooltip="researched" i18n-ngbTooltip="@@i18n.connections.researched">travel_explore</i>
        }
    `,
    styles: [':host { display: inline-flex; align-items: center; white-space: nowrap; }'],
    imports: [NgbTooltipModule],
})
export class ConnectionRole {
    type = input<ConnectionType | null>(null);
    isCompany1 = input(false);
    source = input<ConnectionSource>('manual');

    option = computed(() => Connection.TYPES.find((_) => _.key === this.type()));
}
