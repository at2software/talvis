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
import { MarketingInitiativeActivity } from '@models/marketing/marketing-initiative-activity.model';
import { MarketingTouchpoint, TouchpointChannel } from '@models/marketing/marketing-touchpoint.model';
import { modelListResource, modelResource } from '@models/http/model-resource';
import type { TouchpointPayloadDto } from '@models/_core/api-response';
import { Nx } from '@app/nx/nx.directive';
import { NxService } from '@app/nx/nx.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { RteComponent } from '@shards/rte/rte.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { VcardComponent } from '@app/customers/_shards/vcard/vcard.component';
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
    imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, NgbDropdownModule, NgbTooltipModule, Nx, ToolbarComponent, RteComponent, EmptyStateComponent, SpinnerComponent, VcardComponent, TouchpointFormComponent, StatCardComponent],
})
export class MarketingOutreachComponent {
    #marketing = inject(MarketingService);
    #nxService = inject(NxService);
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

    #shared = modelListResource(() => this.#marketing.indexSharedActivities());

    queue = linkedSignal(() => this.#queue.value());
    sharedActivities = this.#shared.value;
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
    focus = signal<{ activity: MarketingProspectActivity; prospect: MarketingProspect } | undefined>(undefined);
    current = computed(() => this.focus()?.activity ?? this.queue().find((_) => _.id == this.selectedId()) ?? this.queue()[0]);
    prospect = computed(() => this.focus()?.prospect ?? this.current()?.marketing_prospect);
    pendingActivities = computed(() => (this.prospect()?.activities ?? [])
        .filter((_) => _.isPending())
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)));
    upcoming = computed(() => this.pendingActivities().filter((_) => _.id != this.current()?.id));
    vcardOpen = signal(false);

    readonly statusOptions: { key: MarketingProspect['status']; label: string }[] = [
        { key: 'new', label: $localize`:@@i18n.marketing.mark_new:Mark New` },
        { key: 'engaged', label: $localize`:@@i18n.marketing.mark_engaged:Mark Engaged` },
        { key: 'converted', label: $localize`:@@i18n.marketing.mark_converted:Mark Converted` },
        { key: 'unresponsive', label: $localize`:@@i18n.marketing.mark_unresponsive:Mark Unresponsive` },
        { key: 'disqualified', label: $localize`:@@i18n.marketing.mark_disqualified:Mark Disqualified` },
        { key: 'on_hold', label: $localize`:@@i18n.marketing.mark_on_hold:Mark On Hold` },
    ];
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

    channelOfActivity = (activity: MarketingProspectActivity) => MarketingTouchpoint.channelOf(activity.marketing_activity?.quick_action);
    iconOfActivity = (activity: MarketingProspectActivity) => this.channels.find((_) => _.key === this.channelOfActivity(activity))?.icon ?? 'task_alt';

    setChannel(channel: TouchpointChannel) {
        this.channel.set(channel);
        this.focus.set(undefined);
        this.selectedId.set(undefined);
        this.newContactValue.set('');
    }

    select(activity: MarketingProspectActivity) {
        this.focus.set(undefined);
        this.selectedId.set(activity.id);
        this.newContactValue.set('');
        this.form()?.reset();
    }

    focusUpcoming(activity: MarketingProspectActivity) {
        const prospect = this.prospect();
        if (!prospect) return;
        this.focus.set({ activity, prospect });
        this.channel.set(this.channelOfActivity(activity) ?? this.channel());
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

    async save(payload: TouchpointPayloadDto, forNextTask = false) {
        const current = this.current();
        const prospect = this.prospect();
        if (!current || !prospect) return;
        const nextTask = forNextTask ? this.upcoming()[0] : undefined;
        const wasFocused = !!this.focus();
        this.saving.set(true);
        try {
            await firstValueFrom(this.#marketing.storeProspectTouchpoint(prospect.id, { ...payload, marketing_prospect_activity_id: current.id }));
            if (nextTask) {
                prospect.activities = prospect.activities?.filter((_) => _.id != current.id);
                this.focusUpcoming(nextTask);
                this.queue.update((rows) => rows.filter((_) => _ !== current));
            } else {
                this.focus.set(undefined);
                this.#advanceFrom(current);
                this.queue.update((rows) => rows.filter((_) => _ !== current));
            }
            if (wasFocused) this.#queue.reload();
            this.#stats.reload();
        } catch {
            Toast.error($localize`:@@i18n.marketing.touchpoint_save_failed:saving the contact failed – please try again`);
        } finally {
            this.saving.set(false);
        }
    }

    openProspectMenu(event: Event, host: HTMLElement) {
        event.stopPropagation();
        const nx = (host as HTMLElement & { nx?: Nx }).nx;
        if (!nx) return;
        const anchor = (event.target as HTMLElement).getBoundingClientRect();
        this.#nxService.onRightClick(nx, new MouseEvent('contextmenu', { clientX: anchor.left, clientY: anchor.bottom }));
    }

    async markStatus(status: MarketingProspect['status']) {
        const current = this.current();
        const prospect = this.prospect();
        if (!current || !prospect) return;
        try {
            await firstValueFrom(prospect.mark(status));
        } catch {
            Toast.error($localize`:@@i18n.marketing.status_change_failed:changing the status failed – please try again`);
            return;
        }
        if (!prospect.leavesOutreachQueue()) return;
        this.focus.set(undefined);
        this.#advanceFrom(current);
        this.queue.update((rows) => rows.filter((_) => _.marketing_prospect_id != current.marketing_prospect_id));
    }

    async completeShared(activity: MarketingInitiativeActivity) {
        try {
            await activity.modalConfirm(activity.name, $localize`:@@i18n.marketing.complete_shared_confirm:Complete this activity for all ${activity.due_count}:count: waiting prospects?`);
        } catch {
            return;
        }
        const { completed } = await firstValueFrom(this.#marketing.completeSharedActivity(activity.id));
        Toast.success($localize`:@@i18n.marketing.shared_completed:${completed}:count: activities completed`);
        this.#shared.reload();
        this.#queue.reload();
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
