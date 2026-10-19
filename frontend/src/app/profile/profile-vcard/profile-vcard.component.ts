import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { GlobalService } from '@models/global.service';
import { tracked } from '@constants/tracked';
import { environment } from '@environments/environment';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { VcardComponent } from '@app/customers/_shards/vcard/vcard.component';
import { VCalendarService } from '@models/vcalendar/vcalendar.service';
import { modelResource } from '@models/http/model-resource';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { InputSwitchGroupComponent } from '@shards/input-group/input-switch.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Toast } from '@shards/toast/toast';

@Component({
    selector: 'profile-vcard',
    templateUrl: './profile-vcard.component.html',
    styleUrls: ['./profile-vcard.component.scss'],
    imports: [ScrollbarComponent, VcardComponent, NgbTooltipModule, InputSwitchGroupComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileVcardComponent {
    #global = inject(GlobalService);
    #calendarService = inject(VCalendarService);
    #confirmation = inject(ConfirmationService);
    #route = inject(ActivatedRoute);
    #router = inject(Router);
    readonly user = tracked(computed(() => this.#global.user));
    readonly carddavUrl = environment.envApi + 'carddav/';
    readonly caldavUrl = environment.envApi + 'caldav/';
    readonly calendarFeed = modelResource(() => this.#calendarService.showFeedUrl());
    readonly m365Autoreply = linkedSignal(() => Number(this.user()?.getParam('M365_AUTOREPLY') ?? 0));
    readonly autoreplyDefault = String(this.#global.setting('M365_AUTOREPLY_TEXT') ?? '');
    readonly autoreplyHint = $localize`:@@i18n.profile.m365AutoreplyTextHint:Leave empty to use the company default. ${'{name}'}:name: becomes your name, ${'{until}'}:until: the last day of your vacation. Changes apply to your next vacation from the next morning on.`;

    constructor() {
        const query = this.#route.snapshot.queryParamMap;
        const result = query.get('m365');
        if (!result) return;
        if (result === 'connected') Toast.success($localize`:@@i18n.profile.m365Connected:Microsoft 365 connected`);
        else Toast.error(query.get('message') || $localize`:@@i18n.profile.m365ConnectFailed:Microsoft 365 could not be connected`);
        this.#router.navigate([], { relativeTo: this.#route, queryParams: { m365: null, message: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    copyToClipboard = (text: string) => navigator.clipboard.writeText(text).catch(console.error);

    connectM365 = () => this.user()?.connectMicrosoft365().subscribe({ error: () => undefined });

    disconnectM365() {
        this.#confirmation
            .ask({
                title: $localize`:@@i18n.profile.m365Disconnect:disconnect Microsoft 365`,
                message: $localize`:@@i18n.profile.m365DisconnectConfirm:Disconnect your Microsoft 365 account? The TALVIS calendar and address book are removed from your mailbox.`,
            })
            .then((confirmed) => {
                if (confirmed) this.user()?.disconnectMicrosoft365().subscribe({ error: () => undefined });
            });
    }

    saveAutoreply(event: Event) {
        const user = this.user();
        const text = (event.target as HTMLTextAreaElement).value.trim();
        if (!user || text === (user.getParam('M365_AUTOREPLY_TEXT') ?? '')) return;
        user.params!['M365_AUTOREPLY_TEXT'] = text;
        user.updateParam('M365_AUTOREPLY_TEXT', { value: text || null }).subscribe();
    }

    rotateCalendarFeed() {
        this.#confirmation
            .ask({
                title: $localize`:@@i18n.profile.calendarFeedRotate:new link`,
                message: $localize`:@@i18n.profile.calendarFeedRotateConfirm:Create a new subscription link? The old link stops working immediately.`,
            })
            .then((confirmed) => {
                if (confirmed) this.#calendarService.rotateFeedUrl().subscribe((feed) => this.calendarFeed.set(feed));
            });
    }
}
