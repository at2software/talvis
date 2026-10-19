import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { MantisPlugin } from '@models/http/plugins/plugin.mantis';
import { IAIPlugin } from '@models/http/plugins/ai.plugin.interface';
import { AiModelDto } from '@models/_core/api-response';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { Encryption } from '@models/encryption/encryption.model';
import { FormsModule } from '@angular/forms';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { PluginEntryDto } from '@models/_core/api-response';

@Component({
    selector: 'plugin-config-modal',
    templateUrl: './plugin-config-modal.component.html',
    styleUrls: ['./plugin-config-modal.component.scss'],
    imports: [FormsModule, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PluginConfigModalComponent {
    factory = inject(PluginInstanceFactory);
    activeModal = inject(NgbActiveModal);
    #confirmationService = inject(ConfirmationService);
    #inputModalService = inject(InputModalService);

    plugin!: PluginEntryDto;
    isNewPlugin = signal(false);
    availableModels = signal<AiModelDto[]>([]);
    isLoadingModels = signal(false);
    isTestingConnection = signal(false);

    constructor() {
        Promise.resolve().then(() => this.#init());
    }

    #init() {
        if (this.plugin && (!this.plugin.value || typeof this.plugin.value !== 'object')) {
            this.plugin.value = this.#getDefaultValuesForType(this.plugin.type);
        }
        if (this.plugin?.type === 'local_ai' && !this.isNewPlugin() && this.plugin.value?.url) {
            this.loadAvailableModels();
        }
    }

    #getDefaultValuesForType(type: string): Record<string, string | undefined> {
        switch (type) {
            case 'mattermost': return { url: '', team: '', token: '' };
            case 'git': return { url: '', token: '' };
            case 'mantis': return { url: '', token: '', filterId: undefined };
            case 'jira': return { url: '', email: '', token: '' };
            case 'github': return { url: 'https://github.com/', token: '' };
            case 'slack': return { url: '', token: '' };
            case 'local_ai': return { url: '', login: '', password: '', model: '' };
            case 'calendar': return { name: '', url: '', login: '', password: '' };
            default: return {};
        }
    }

    onDelete = () => {
        this.#confirmationService
            .confirm({
                title: $localize`:@@i18n.profile.deletePlugin:delete plugin`,
                message: $localize`:@@i18n.common.areYouSure:are you sure?`,
                btnOkText: $localize`:@@i18n.common.yes:yes`,
                btnCancelText: $localize`:@@i18n.common.no:no`,
            })
            .then(() => this.activeModal.close('delete'));
    };

    onLinkMyId = () => {
        this.#inputModalService.open($localize`:@@i18n.profile.linkMyId:your user name or ID in this service`).then((response) => {
            if (response?.text) this.plugin.update({ my_id: response.text }).subscribe();
        });
    };

    getMantisProjects = () => {
        if (!this.plugin || this.isNewPlugin() || !this.plugin.value?.url) return [];
        try {
            return (this.factory.instanceFor(this.plugin) as MantisPlugin).projects ?? [];
        } catch {
            return [];
        }
    };

    getMantisConnectionStatus = (): string => {
        if (!this.plugin || this.isNewPlugin() || !this.plugin.value?.url) return 'not configured';
        try {
            const encryption = this.factory.getPluginEncryptionsOfType('mantis').find((p) => p.id === this.plugin.id);
            if (!encryption) return 'unknown';
            return this.factory.instanceFor(encryption)?.state || 'unknown';
        } catch {
            return 'error';
        }
    };

    close = () => this.activeModal.close();

    save = () => {
        if (this.isNewPlugin()) {
            this.activeModal.close('save');
        } else {
            const originalEncryption = this.factory.getPluginEncryptions().find((e) => e.id === this.plugin.id);
            if (!originalEncryption) return;

            originalEncryption.value = { ...this.plugin.value };
            originalEncryption.update().subscribe({
                next: (updatedPlugin: Encryption) => {
                    this.plugin.value = updatedPlugin.value as Record<string, unknown>;
                    if (this.plugin.value?.url && this.factory.instances[this.plugin.value.url]) {
                        delete this.factory.instances[this.plugin.value.url];
                    }
                    this.activeModal.close('updated');
                },
            });
        }
    };

    loadAvailableModels = () => {
        if (!this.plugin || this.plugin.type !== 'local_ai' || !this.plugin.value?.url || this.isNewPlugin()) return;

        let encryption: Encryption = this.plugin;
        if (!this.plugin.key) {
            const found = this.factory.getPluginEncryptionsOfType('local_ai').find((p) => p.id === this.plugin.id);
            if (!found) return;
            encryption = found;
        }

        try {
            const aiPlugin = this.factory.instanceFor(encryption) as IAIPlugin & PluginInstance;
            if (!aiPlugin?.IAIPluginProperty || aiPlugin.state !== 'connected') return;

            this.isLoadingModels.set(true);
            aiPlugin.listModels().subscribe({
                next: (models) => {
                    const sorted = models.sort((a, b) => (a.name || a.id || '').toLowerCase().localeCompare((b.name || b.id || '').toLowerCase()));
                    this.availableModels.set(sorted);
                    this.isLoadingModels.set(false);
                    if (!this.plugin.value.model && sorted.length > 0) this.plugin.value.model = sorted[0].id;
                },
                error: () => {
                    this.isLoadingModels.set(false);
                    this.availableModels.set([]);
                },
            });
        } catch {
            this.isLoadingModels.set(false);
        }
    };

    onLocalAIConnectionTest = () => {
        if (!this.plugin?.value?.url) return;
        if (this.factory.instances[this.plugin.value.url]) delete this.factory.instances[this.plugin.value.url];
        setTimeout(() => this.loadAvailableModels(), 100);
    };

    onMantisConnectionTest = () => {
        if (!this.plugin?.value?.url || !this.plugin?.value?.token || this.isNewPlugin()) return;

        let encryption: Encryption = this.plugin;
        if (!this.plugin.key) {
            const found = this.factory.getPluginEncryptionsOfType('mantis').find((p) => p.id === this.plugin.id);
            if (!found) return;
            encryption = found;
        }

        this.isTestingConnection.set(true);
        try {
            if (this.factory.instances[this.plugin.value.url]) delete this.factory.instances[this.plugin.value.url];
            if (encryption && 'state' in encryption) (encryption as any).state = 'idle';

            const mantisPlugin = this.factory.instanceFor(encryption) as MantisPlugin;
            if (!mantisPlugin) { this.isTestingConnection.set(false); return; }

            const timeout = setTimeout(() => { if (this.isTestingConnection()) this.isTestingConnection.set(false); }, 10000);

            const checkState = () => {
                if (mantisPlugin.state === 'connected') {
                    clearTimeout(timeout);
                    this.isTestingConnection.set(false);
                } else if (mantisPlugin.state === 'connection fail') {
                    clearTimeout(timeout);
                    this.isTestingConnection.set(false);
                } else if (mantisPlugin.state === 'connecting') {
                    setTimeout(checkState, 1000);
                }
            };

            setTimeout(checkState, 500);
            mantisPlugin.init.subscribe({
                next: () => {
                    clearTimeout(timeout);
                    this.isTestingConnection.set(false);
                },
            });
        } catch {
            this.isTestingConnection.set(false);
        }
    };
}
