import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { PluginConfigModalComponent } from './plugin-config-modal/plugin-config-modal.component';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { TalvisHttp } from '@models/http/http.talvis';
import { Encryption } from '@models/encryption/encryption.model';
import { GlobalService } from '@models/global.service';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { MantisPlugin } from '@models/http/plugins/plugin.mantis';
import { RsaSettingsEmptyComponent } from '@shards/rsa-settings/rsa-settings-empty.component';
import { NComponent } from '@shards/n/n.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { TabPluginsComponent } from '@activity/tab-plugins/tab-plugins.component';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { PluginEntryDto } from '@models/_core/api-response';
import { CALENDAR_CONNECTOR, ConnectorService } from './connector.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-profile-plugins',
    templateUrl: './profile-plugins.component.html',
    imports: [RsaSettingsEmptyComponent, NComponent, ToolbarComponent, TabPluginsComponent, NgbDropdownModule],
})
export class ProfilePluginsComponent {
    global = inject(GlobalService);
    factory = inject(PluginInstanceFactory);
    #http = inject(TalvisHttp);
    #confirmationService = inject(ConfirmationService);
    #modalInput = inject(InputModalService);
    #modalService = inject(NgbModal);
    #connectorService = inject(ConnectorService);

    onLinkDelete = (_: Encryption) => {
        this.#confirmationService
            .confirm({
                title: $localize`:@@i18n.profile.deletePlugin:delete plugin`,
                message: $localize`:@@i18n.common.areYouSure:are you sure?`,
                btnOkText: $localize`:@@i18n.common.yes:yes`,
                btnCancelText: $localize`:@@i18n.common.no:no`,
            })
            .then(() => {
                this.#http.delete(`encryptions/${_.id}`).subscribe(() => this.global.reload());
            });
    };
    linkMyId = (_: Encryption) => {
        this.#modalInput.open($localize`:@@i18n.profile.linkMyId:your user name or ID in this service`).then((response) => {
            _.update({ my_id: response!.text }).subscribe();
        });
    };

    getMantisProjects = (_: Encryption) => (this.factory.instanceFor(_) as MantisPlugin).projects ?? [];

    #makeEntry = (p: Encryption, type: string, displayName: string): PluginEntryDto => Object.assign(p, { type, displayName });

    getAllPlugins = (): PluginEntryDto[] => [
        ...this.factory.getPluginEncryptionsOfType('mattermost').map((p) => this.#makeEntry(p, 'mattermost', 'Mattermost')),
        ...this.factory.getPluginEncryptionsOfType('git').map((p) => this.#makeEntry(p, 'git', 'GitLab')),
        ...this.factory.getPluginEncryptionsOfType('mantis').map((p) => this.#makeEntry(p, 'mantis', 'MantisBT')),
        ...this.factory.getPluginEncryptionsOfType('jira').map((p) => this.#makeEntry(p, 'jira', 'Jira')),
        ...this.factory.getPluginEncryptionsOfType('github').map((p) => this.#makeEntry(p, 'github', 'GitHub')),
        ...this.factory.getPluginEncryptionsOfType('slack').map((p) => this.#makeEntry(p, 'slack', 'Slack')),
        ...this.factory.getPluginEncryptionsOfType('local_ai').map((p) => this.#makeEntry(p, 'local_ai', 'LocalAI Proxy')),
        ...this.factory.getPluginEncryptionsOfType('calendar').map((p) => this.#makeEntry(p, 'calendar', p.value?.name || CALENDAR_CONNECTOR)),
        ...this.factory.getPluginEncryptionsOfType('talvis').map((p) => this.#makeEntry(p, 'talvis', 'TALVIS')),
    ];

    getPluginStatusText = (plugin: PluginEntryDto): string => {
        try {
            if (plugin.type === 'talvis') return '';
            if (!plugin?.value?.url) return 'not configured';
            const originalEncryption = this.factory.getPluginEncryptionsOfType(plugin.key || plugin.type).find((e) => e.id === plugin.id);
            if (!originalEncryption) return 'unknown';
            const instance = this.factory.instanceFor(originalEncryption);
            return (instance?.state || 'unknown').toLowerCase();
        } catch (_error) {
            return 'error';
        }
    };

    isPluginConnected = (plugin: PluginEntryDto): boolean => this.getPluginStatusText(plugin) === 'connected';

    openPluginModal = (plugin: PluginEntryDto) => {
        const modalRef = this.#modalService.open(PluginConfigModalComponent, { size: 'lg' });
        modalRef.componentInstance.plugin = plugin;

        modalRef.result
            .then((result) => {
                if (result === 'delete') {
                    this.onLinkDelete(plugin);
                } else if (result === 'updated') {
                    this.global.reload();
                }
            })
            .catch(() => {
                // Modal dismissed - no action needed
            });
    };

    readonly calendarConnector = CALENDAR_CONNECTOR;

    urlHost = (url: string): string => {
        try {
            return new URL(url).host || url;
        } catch {
            return url;
        }
    };

    openNewPluginModal = (type: string, displayName: string) => this.#connectorService.create(type, displayName);

    getPluginType = (plugin: PluginEntryDto): string => plugin.type;
    getPluginDisplayName = (plugin: PluginEntryDto): string => plugin.displayName;
}
