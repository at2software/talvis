import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgbModalOptions, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { VaultService } from '@models/vault.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Toast } from '@shards/toast/toast';
import { environment } from '@environments/environment';

const GRAPH_PERMISSIONS: { name: string; purpose: string }[] = [
    { name: 'User.Read.All', purpose: $localize`:@@i18n.m365Guide.permUserRead:match TALVIS users to Microsoft 365 accounts by e-mail` },
    { name: 'Presence.ReadWrite.All', purpose: $localize`:@@i18n.m365Guide.permPresence:set the Teams status during vacation or sick leave` },
    { name: 'Team.ReadBasic.All', purpose: $localize`:@@i18n.m365Guide.permTeamRead:read the team that holds the project channels` },
    { name: 'Channel.ReadBasic.All', purpose: $localize`:@@i18n.m365Guide.permChannelRead:find existing project channels` },
    { name: 'Channel.Create', purpose: $localize`:@@i18n.m365Guide.permChannelCreate:create one channel per project` },
    { name: 'ChannelSettings.ReadWrite.All', purpose: $localize`:@@i18n.m365Guide.permChannelSettings:update channel name and description` },
    { name: 'TeamMember.ReadWrite.All', purpose: $localize`:@@i18n.m365Guide.permTeamMember:add project members to the team` },
];

@Component({
    selector: 'modal-m365-setup-guide',
    templateUrl: './modal-m365-setup-guide.component.html',
    imports: [NgbTooltipModule, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalM365SetupGuideComponent extends ModalBaseComponent<void> {
    static override modalOptions: NgbModalOptions = { size: 'lg', scrollable: true };

    readonly permissions = GRAPH_PERMISSIONS;
    readonly entraUrl = 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade';
    readonly azureBotUrl = 'https://portal.azure.com/#create/Microsoft.AzureBot';
    readonly teamsAdminUrl = 'https://admin.teams.microsoft.com/policies/manage-apps';
    readonly messagingEndpoint = new URL(environment.envApi + 'teams/messages', location.origin).href;

    readonly clientId = signal('');
    readonly downloading = signal(false);
    readonly powershell = computed(() =>
        [
            'Connect-ExchangeOnline',
            `$appId    = '${this.clientId() || $localize`:@@i18n.m365Guide.placeholderClientId:<client id>`}'`,
            `$spObject = '${$localize`:@@i18n.m365Guide.placeholderObjectId:<object id of the enterprise application>`}'`,
            `$groupDn  = (Get-DistributionGroup '${$localize`:@@i18n.m365Guide.placeholderGroup:<group>`}').DistinguishedName`,
            `New-ServicePrincipal -AppId $appId -ObjectId $spObject -DisplayName 'TALVIS'`,
            `New-ManagementScope -Name 'TALVIS-M365' -RecipientRestrictionFilter "MemberOfGroup -eq '$groupDn'"`,
            `New-ManagementRoleAssignment -App $appId -Role 'Application MailboxSettings.ReadWrite' -CustomResourceScope 'TALVIS-M365'`,
            `New-ManagementRoleAssignment -App $appId -Role 'Application Calendars.ReadWrite' -CustomResourceScope 'TALVIS-M365'`,
            `New-ManagementRoleAssignment -App $appId -Role 'Application Contacts.ReadWrite' -CustomResourceScope 'TALVIS-M365'`,
            `Test-ServicePrincipalAuthorization -Identity $appId -Resource '${$localize`:@@i18n.m365Guide.placeholderMember:someone@yourdomain`}'`,
        ].join('\n'),
    );

    readonly #vaultService = inject(VaultService);

    init(clientId?: string): void {
        this.clientId.set(clientId?.trim() ?? '');
    }

    onSuccess = (): void => undefined;

    copy(text: string) {
        navigator.clipboard
            .writeText(text)
            .then(() => Toast.success($localize`:@@i18n.m365Guide.copied:copied to the clipboard`))
            .catch(console.error);
    }

    downloadTeamsAppPackage() {
        this.downloading.set(true);
        this.#vaultService.downloadTeamsAppPackage(() => this.downloading.set(false));
    }
}
