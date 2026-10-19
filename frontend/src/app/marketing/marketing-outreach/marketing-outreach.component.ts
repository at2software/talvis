import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { dayjs, type Dayjs } from '@constants/date/dates';
import { storageGet, storageSet } from '@constants/storage';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingProspect } from '@models/marketing/marketing-prospect.model';
import { MarketingProspectActivity } from '@models/marketing/marketing-prospect-activity.model';
import { MarketingTouchpoint, TouchpointChannel } from '@models/marketing/marketing-touchpoint.model';
import { modelListResource, modelResource } from '@models/http/model-resource';
import type { TouchpointPayloadDto } from '@models/_core/api-response';
import { Nx } from '@app/nx/nx.directive';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { RteComponent } from '@shards/rte/rte.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { Toast } from '@shards/toast/toast';
import { StatCardComponent } from '@shards/stat-card/stat-card.component';
import { TouchpointFormComponent } from '../shared/touchpoint-form/touchpoint-form.component';

interface ChannelUi {
    vcardKey: 'TEL' | 'EMAIL' | 'URL';
    icon: string;
    missing: string;
    placeholder: string;
}

const STORAGE_KEY = 'marketing.outreach.channel';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-outreach',
    templateUrl: './marketing-outreach.component.html',
    imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, NgbDropdownModule, NgbTooltipModule, Nx, ToolbarComponent, RteComponent, EmptyStateComponent, SpinnerComponent, AvatarComponent, TouchpointFormComponent, StatCardComponent],
})
export class MarketingOutreachComponent {
    #marketing = inject(MarketingService);
    readonly form = viewChild(TouchpointFormComponent);

    readonly channels = MarketingTouchpoint.CHANNELS;
    readonly channelUi: Record<TouchpointChannel, ChannelUi> = {
        call: { vcardKey: 'TEL', icon: 'phone', missing: $localize`:@@i18n.marketing.no_phone_number:no phone number`, placeholder: $localize`:@@i18n.marketing.add_phone_number:add phone number` },
        email: { vcardKey: 'EMAIL', icon: 'email', missing: $localize`:@@i18n.marketing.no_email_address:no email address`, placeholder: $localize`:@@i18n.marketing.add_email_address:add email address` },
        linkedin: { vcardKey: 'URL', icon: 'open_in_new', missing: $localize`:@@i18n.marketing.no_linkedin_profile:no LinkedIn profile`, placeholder: $localize`:@@i18n.marketing.add_linkedin_profile:add LinkedIn profile URL` },
    };

    channel = signal<TouchpointChannel>(storageGet<TouchpointChannel>(STORAGE_KEY, 'call'));
    ui = computed(() => this.channelUi[this.channel()]);

    #queue = modelListResource(this.channel, (channel) => this.#marketing.indexOutreachQueue(channel));
    #stats = modelResource(() => this.#marketing.showTouchpointStats());

    queue = linkedSignal(() => this.#queue.value());
    isLoading = this.#queue.isLoading;
    stats = computed(() => this.#stats.value()?.total);
    readonly thisWeek = $localize`:@@i18n.marketing.this_week:this week`;
    bestHourHint = computed(() => {
        const best = (this.#stats.value()?.by_hour ?? [])
            .filter((_) => _.dials >= 3)
            .sort((a, b) => b.connects / b.dials - a.connects / a.dials)[0];
        return best ? $localize`:@@i18n.marketing.best_time_hint:best: ${this.weekdayLabel(best.weekday)}:weekday: ${best.hour}:hour::00` : this.thisWeek;
    });
    bouncedHint = computed(() => $localize`:@@i18n.marketing.bounced_hint:${this.stats()?.emails_bounced ?? 0}:count: bounced`);
    replyRate = computed(() => { const sent = this.stats()?.emails_sent ?? 0; return sent ? (this.stats()?.emails_replied ?? 0) / sent : 0; });

    selectedId = signal<string | undefined>(undefined);
    current = computed(() => this.queue().find((_) => _.id == this.selectedId()) ?? this.queue()[0]);
    prospect = computed(() => this.current()?.marketing_prospect);
    #contactVersion = signal(0);
    contactValues = computed(() => {
        this.#contactVersion();
        const values = this.prospect()?.contactValues(this.ui().vcardKey) ?? [];
        return this.channel() === 'linkedin' ? values.filter((_) => _.includes('linkedin.com')) : values;
    });
    script = computed(() => { const current = this.current(); return current ? (this.prospect()?.personalizedText(current) ?? '') : ''; });
    history = computed(() => (this.prospect()?.touchpoints ?? []).slice(0, 5));
    saving = signal(false);
    newContactValue = signal('');
    addingContactValue = signal(false);

    readonly rescheduleTargets = [
        { label: $localize`:@@i18n.common.tomorrow:tomorrow`, date: () => dayjs().add(1, 'day') },
        { label: $localize`:@@i18n.marketing.next_monday:next monday`, date: () => dayjs().day(8) },
        { label: $localize`:@@i18n.marketing.postpone_1w:1 week`, date: () => dayjs().add(1, 'week') },
    ];

    constructor() {
        effect(() => storageSet(STORAGE_KEY, this.channel()));
    }

    weekdayLabel = (weekday: number) => dayjs().day(weekday + 1).format('dd');
    isOverdue = (activity: MarketingProspectActivity) => dayjs(activity.scheduled_at).isBefore(dayjs(), 'day');
    resultOf = (touchpoint: MarketingTouchpoint) => touchpoint.resultOption();

    contactHref(value: string): string {
        switch (this.channel()) {
            case 'call':
                return `tel:${value.replace(/[^\d+]/g, '')}`;
            case 'email':
                return `mailto:${value}?subject=${encodeURIComponent(this.current()?.getName() ?? '')}&body=${encodeURIComponent(this.script())}`;
            case 'linkedin':
                return value;
        }
    }

    linkedInSearchUrl = (prospect: MarketingProspect) =>
        `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${prospect.name()} ${prospect.company()}`.trim())}`;

    setChannel(channel: TouchpointChannel) {
        this.channel.set(channel);
        this.selectedId.set(undefined);
        this.newContactValue.set('');
    }

    select(activity: MarketingProspectActivity) {
        this.selectedId.set(activity.id);
        this.newContactValue.set('');
        this.form()?.reset();
    }

    async addContactValue() {
        const value = this.newContactValue().trim();
        const prospect = this.prospect();
        if (!value || !prospect) return;
        this.addingContactValue.set(true);
        try {
            await firstValueFrom(prospect.addContactValue(this.ui().vcardKey, value));
            this.newContactValue.set('');
            this.#contactVersion.update((_) => _ + 1);
        } catch {
            Toast.error($localize`:@@i18n.marketing.add_contact_value_failed:saving the contact data failed`);
        } finally {
            this.addingContactValue.set(false);
        }
    }

    skip() {
        const current = this.current();
        if (!current) return;
        this.queue.update((rows) => [...rows.filter((_) => _ !== current), current]);
        this.#advanceFrom(current);
    }

    async save(payload: TouchpointPayloadDto) {
        const current = this.current();
        const prospect = this.prospect();
        if (!current || !prospect) return;
        this.saving.set(true);
        try {
            await firstValueFrom(this.#marketing.storeProspectTouchpoint(prospect.id, { ...payload, marketing_prospect_activity_id: current.id }));
            this.#advanceFrom(current);
            this.queue.update((rows) => rows.filter((_) => _ !== current));
            this.#stats.reload();
        } catch {
            Toast.error($localize`:@@i18n.marketing.touchpoint_save_failed:saving the contact failed – please try again`);
        } finally {
            this.saving.set(false);
        }
    }

    async rescheduleOverdue(date: Dayjs) {
        const { moved } = await firstValueFrom(this.#marketing.rescheduleOverdueActivities({ date: date.format('YYYY-MM-DD'), channel: this.channel() }));
        Toast.success($localize`:@@i18n.marketing.overdue_moved:${moved}:count: prospects moved`);
        this.#queue.reload();
    }

    #advanceFrom(current: MarketingProspectActivity) {
        const rows = this.queue();
        const next = rows[rows.indexOf(current) + 1] ?? rows.find((_) => _ !== current);
        this.selectedId.set(next?.id);
        this.form()?.reset();
    }
}
