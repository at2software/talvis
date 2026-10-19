import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal, TemplateRef } from '@angular/core';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { FormsModule } from '@angular/forms';
import { NgbDropdownModule, NgbModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { VaultService } from '@models/vault.service';
import { ParamService } from '@models/param/param.service';
import { Param } from '@models/param/param.model';
import { Toast } from '@shards/toast/toast';
import { NComponent } from '@shards/n/n.component';
import { Dictionary } from '@constants/constants';
import { SettingsWebhooksComponent } from '@app/settings/settings-webhooks/settings-webhooks.component';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalM365SetupGuideComponent } from '@app/_modals/modal-m365-setup-guide/modal-m365-setup-guide.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface TPipelineJob {
    job: string;
    artifact: string;
    type: 'sast' | 'npm' | 'composer' | 'cargo' | 'grype';
}
interface TVault {
    prefix: string;
    name: string;
    active: boolean;
    keys: Dictionary<string>;
    map: Dictionary<string>;
    missing?: string[];
}
interface TTanChallenge {
    challenge_id: string;
    type: 'tan' | 'phototan' | 'flickertan' | 'decoupled';
    text?: string;
    medium?: string;
    image?: string;
    svg?: string;
}

const VAULT_INFO: Dictionary<{ label: string; description: string }[]> = {
    MATTERMOST: [
        { label: 'URL', description: 'Mattermost server endpoint (e.g. https://mattermost.example.com)' },
        { label: 'team id', description: 'Numeric team ID — visible in Admin Console → Teams' },
        { label: 'team name', description: 'URL slug of the team (the part shown in the browser URL)' },
        { label: 'login', description: 'Username or email address of the bot account' },
        { label: 'password', description: 'Password of the bot account' },
        { label: 'broadcast channel', description: 'Channel ID used for system-wide notifications' },
    ],
    SLACK: [
        { label: 'bot token', description: 'Bot user OAuth token (xoxb-…) — scopes: chat:write, chat:write.customize, channels:manage, channels:read, channels:history, groups:read, groups:history, users:read, users:read.email, im:write' },
        { label: 'broadcast channel', description: 'Channel ID used for system-wide notifications — the bot must be a member' },
        { label: 'admin user token', description: 'Optional: user OAuth token (xoxp-…) of a workspace admin on a paid plan with users.profile:write — only needed to set the status and title of other users' },
    ],
    GITLAB: [
        { label: 'GitLab URL', description: 'Base URL of your GitLab instance (e.g. https://gitlab.com)' },
        { label: 'access token', description: 'Personal or project access token — requires API scope' },
        { label: 'api key', description: 'Secret token configured in GitLab webhook settings for signature validation' },
    ],
    FINTS: [
        { label: 'FinTS server URL', description: 'HBCI/FinTS PIN/TAN URL of your bank. Enter your IBAN first to auto-fill. Full list at hbci-zka.de.' },
        { label: 'bank code (BLZ)', description: '8-digit German bank code — auto-filled from IBAN for DE accounts' },
        { label: 'account IBAN', description: 'IBAN of the account to monitor. Enter this first to auto-fill URL and BLZ.' },
        { label: 'login ID (Kennung)', description: 'Your online banking login ID (not the card PIN)' },
        { label: 'PIN', description: 'Your online banking PIN' },
    ],
    MANTIS: [
        { label: 'URL', description: "Base URL of your MantisBT installation (e.g. https://mantis.example.com/) — must match the URL in the users' Mantis connectors so project links are recognised" },
        { label: 'token', description: 'API token of a Mantis account that can read all linked projects (My Account → API Tokens)' },
    ],
    M365: [
        { label: 'tenant id', description: 'Directory (tenant) ID of the TALVIS app registration in Entra' },
        { label: 'client id', description: 'Application (client) ID' },
        { label: 'client secret', description: 'Client secret value (not the secret ID)' },
        { label: 'secret expires at', description: 'Optional, YYYY-MM-DD — admins get a chat reminder 30/14/7/3/1 days before' },
        { label: 'team id', description: "Optional: id of the Teams team for project channels (groupId from 'Get link to team'); enables Microsoft Teams as chat platform" },
        { label: 'town square', description: 'Optional: Teams channel id (19:…@thread.tacv2) for company-wide announcements' },
    ],
};

const VAULT_DESCRIPTION: Dictionary<string> = {
    MANTIS: 'TALVIS polls all linked Mantis projects every 5 minutes and posts new, changed and commented issues to the project chat.',
    M365: 'App-only access via an Entra app registration — the setup guide walks you through it step by step.',
};

const DEFAULT_PIPELINE_JOBS: TPipelineJob[] = [
    { job: 'semgrep-sast', artifact: 'gl-sast-report.json', type: 'sast' },
    { job: 'npm-audit', artifact: 'npm-audit.json', type: 'npm' },
    { job: 'composer audit', artifact: 'composer-audit.json', type: 'composer' },
    { job: 'cargo audit', artifact: 'cargo-audit.json', type: 'cargo' },
    { job: 'vuln_scan', artifact: 'grype-report.json', type: 'grype' },
];

@Component({
    selector: 'settings-connectors',
    imports: [FormsModule, NgbDropdownModule, NgbTooltipModule, NComponent, SettingsWebhooksComponent, SpinnerComponent],
    templateUrl: './settings-connectors.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsConnectorsComponent {
    currentVault = signal<TVault | undefined>(undefined);
    tanChallenge = signal<TTanChallenge | null>(null);
    tanInput = signal('');
    bankName = signal<string | null>(null);
    isPolling = signal(false);
    readonly jobPresets = DEFAULT_PIPELINE_JOBS;

    #vaultService = inject(VaultService);
    #paramService = inject(ParamService);
    #modalService = inject(NgbModal);
    #modalBaseService = inject(ModalBaseService);

    readonly #vaults = modelListResource(() => this.#vaultService.index());
    readonly vaults = linkedSignal(() =>
        this.#vaults.value().map((vault) => ({
            prefix: vault.prefix,
            name: vault.name,
            active: vault.active,
            keys: vault.keys,
            missing: vault.missing,
            map: Object.fromEntries(Object.keys(vault.keys).map((key) => [`${vault.prefix}_${key}`, ''])),
        })),
    );

    readonly #pipelineParam = modelResource(
        () => (this.vaults().some((_) => _.prefix === 'GITLAB') ? 'params/SETTINGS_GIT_PIPELINE' : undefined),
        (key) => this.#paramService.show(key),
    );
    readonly pipelineJobs = linkedSignal(() => {
        try {
            const parsed = JSON.parse(String(this.#pipelineParam.value()?.value));
            return Array.isArray(parsed) ? (parsed as TPipelineJob[]) : [...DEFAULT_PIPELINE_JOBS];
        } catch {
            return [...DEFAULT_PIPELINE_JOBS];
        }
    });

    openVaultModal(vault: TVault, content: TemplateRef<unknown>) {
        this.currentVault.set(vault);
        this.tanChallenge.set(null);
        this.tanInput.set('');
        this.bankName.set(null);
        if (vault.prefix === 'GITLAB') this.#pipelineParam.reload();
        this.#modalService.open(content, { size: 'lg' });
    }

    openM365SetupGuide() {
        this.#modalBaseService.open(ModalM365SetupGuideComponent, this.currentVault()?.map['M365_CLIENT_ID']);
    }

    checkCredentials() {
        this.#vaultService.checkCredentials(this.currentVault()!.map).subscribe((response) => {
            if (response.success) {
                Toast.success('Connection test successful / Credentials saved');
                this.currentVault.update((v) => (v ? { ...v, active: true } : v));
            } else if (response.tan_required) {
                this.tanChallenge.set({ ...response.challenge, challenge_id: response.challenge_id });
                if (response.challenge?.type === 'decoupled') this.#startDecoupledPolling(response.challenge_id);
            }
        });
    }

    submitTan() {
        const challenge = this.tanChallenge()!;
        const vault = this.currentVault()!;
        this.#vaultService
            .submitTan({ prefix: vault.prefix, challenge_id: challenge.challenge_id, tan: this.tanInput() || undefined })
            .subscribe((response) => {
                if (response.success) {
                    Toast.success('Authentication successful / Credentials saved');
                    this.tanChallenge.set(null);
                    this.tanInput.set('');
                    this.currentVault.update((v) => (v ? { ...v, active: true } : v));
                }
            });
    }

    cancelTan() {
        this.isPolling.set(false);
        this.tanChallenge.set(null);
        this.tanInput.set('');
    }

    onVaultFieldChange(key: string, value: string) {
        this.updateVaultMapKey(key, value);
        if (key === 'FINTS_IBAN') this.#onIbanChange(value);
    }

    savePipelineJobs() {
        Param.write('params/SETTINGS_GIT_PIPELINE', JSON.stringify(this.pipelineJobs())).subscribe(() => {
            Toast.success('Pipeline settings saved');
        });
    }

    addPipelineJob(preset: TPipelineJob) {
        this.pipelineJobs.update((jobs) => [...jobs, { ...preset }]);
    }

    removePipelineJob(i: number) {
        this.pipelineJobs.update((jobs) => jobs.filter((_, idx) => idx !== i));
    }

    updatePipelineJob(i: number, field: 'job' | 'artifact', value: string) {
        this.pipelineJobs.update((jobs) => jobs.map((j, idx) => (idx === i ? { ...j, [field]: value } : j)));
    }

    updateVaultMapKey(key: string, value: string) {
        this.currentVault.update((v) => (v ? { ...v, map: { ...v.map, [key]: value } } : v));
    }

    infoFor = (vault: TVault) => VAULT_INFO[vault.prefix] ?? [];
    descriptionFor = (vault: TVault) => VAULT_DESCRIPTION[vault.prefix];
    keysFor = (vault: TVault) => Object.keys(vault.keys);
    mapKey = (key: string) => this.currentVault()!.prefix + '_' + key;
    isKeyMissing = (key: string) => this.currentVault()?.missing?.includes(key) ?? false;
    vaultIcon = (vault: TVault) =>
        ({ MATTERMOST: 'mattermost', SLACK: 'slack', GITLAB: 'git', FINTS: 'bank', MANTIS: 'mantis', M365: 'microsoft' }[vault.prefix] ?? vault.prefix.toLowerCase());

    #onIbanChange(iban: string) {
        const normalized = iban.replace(/\s/g, '').toUpperCase();
        if (normalized.startsWith('DE') && normalized.length >= 12) {
            const blz = normalized.substring(4, 12);
            this.updateVaultMapKey('FINTS_BLZ', blz);
            this.#vaultService.bankLookup(blz).subscribe((info) => {
                if (info?.url) this.updateVaultMapKey('FINTS_URL', info.url);
                this.bankName.set(info?.name ?? null);
            });
        } else {
            this.bankName.set(null);
        }
    }

    #startDecoupledPolling(challengeId: string) {
        this.isPolling.set(true);
        const poll = () => {
            if (!this.isPolling()) return;
            this.#vaultService
                .submitTan({ prefix: this.currentVault()!.prefix, challenge_id: challengeId })
                .subscribe((response) => {
                    if (response.success) {
                        this.isPolling.set(false);
                        this.tanChallenge.set(null);
                        this.currentVault.update((v) => (v ? { ...v, active: true } : v));
                        Toast.success('Authentication successful / Credentials saved');
                    } else if (response.waiting && this.isPolling()) {
                        setTimeout(poll, 3000);
                    }
                });
        };
        setTimeout(poll, 3000);
    }
}
