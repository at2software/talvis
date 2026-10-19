import { computed } from '@angular/core';
import { Serializable } from '@models/_core/serializable';
import { Type } from '@models/_core/hydrate';
import { Model } from '@constants/model/type-discriminators';
import { User } from '@models/user/user.model';

export type TouchpointChannel = 'call' | 'email' | 'linkedin';
export type TouchpointResult = 'connected' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number' | 'sent' | 'replied' | 'bounced';
export type TouchpointOutcome = 'meeting_booked' | 'callback' | 'info_requested' | 'gatekeeper' | 'not_interested';

export interface TouchpointOption<T> {
    key: T;
    label: string;
    icon: string;
    color: string;
}

@Model('MarketingTouchpoint')
export class MarketingTouchpoint extends Serializable {
    static API_PATH = (): string => 'marketing/touchpoints';

    static readonly CHANNELS: TouchpointOption<TouchpointChannel>[] = [
        { key: 'call', label: $localize`:@@i18n.marketing.touchpoint_call:call`, icon: 'phone', color: 'text-cyan' },
        { key: 'email', label: $localize`:@@i18n.common.email:email`, icon: 'email', color: 'text-cyan' },
        { key: 'linkedin', label: 'LinkedIn', icon: 'open_in_new', color: 'text-cyan' },
    ];

    static readonly RESULTS: TouchpointOption<TouchpointResult>[] = [
        { key: 'connected', label: $localize`:@@i18n.marketing.result_connected:reached`, icon: 'call', color: 'text-success' },
        { key: 'no_answer', label: $localize`:@@i18n.marketing.result_no_answer:no answer`, icon: 'phone_missed', color: 'text-warning' },
        { key: 'voicemail', label: $localize`:@@i18n.marketing.result_voicemail:voicemail`, icon: 'voicemail', color: 'text-warning' },
        { key: 'busy', label: $localize`:@@i18n.marketing.result_busy:busy`, icon: 'phone_paused', color: 'text-warning' },
        { key: 'wrong_number', label: $localize`:@@i18n.marketing.result_wrong_number:wrong number`, icon: 'phone_disabled', color: 'text-danger' },
        { key: 'sent', label: $localize`:@@i18n.marketing.result_sent:sent`, icon: 'send', color: 'text-cyan' },
        { key: 'replied', label: $localize`:@@i18n.marketing.result_replied:replied`, icon: 'reply', color: 'text-success' },
        { key: 'bounced', label: $localize`:@@i18n.marketing.result_bounced:bounced`, icon: 'unsubscribe', color: 'text-danger' },
    ];

    static readonly OUTCOMES: TouchpointOption<TouchpointOutcome>[] = [
        { key: 'meeting_booked', label: $localize`:@@i18n.marketing.outcome_meeting_booked:meeting booked`, icon: 'event_available', color: 'text-success' },
        { key: 'callback', label: $localize`:@@i18n.marketing.outcome_callback:call back`, icon: 'update', color: 'text-warning' },
        { key: 'info_requested', label: $localize`:@@i18n.marketing.outcome_info_requested:info requested`, icon: 'description', color: 'text-cyan' },
        { key: 'gatekeeper', label: $localize`:@@i18n.marketing.outcome_gatekeeper:gatekeeper`, icon: 'support_agent', color: 'text-warning' },
        { key: 'not_interested', label: $localize`:@@i18n.marketing.outcome_not_interested:not interested`, icon: 'thumb_down', color: 'text-danger' },
    ];

    static readonly CHANNEL_RESULTS: Record<TouchpointChannel, TouchpointResult[]> = {
        call: ['connected', 'no_answer', 'voicemail', 'busy', 'wrong_number'],
        email: ['sent', 'replied', 'bounced'],
        linkedin: ['sent', 'replied'],
    };

    static readonly REACHED: TouchpointResult[] = ['connected', 'replied'];
    static readonly ATTEMPTS: TouchpointResult[] = ['no_answer', 'voicemail', 'busy'];

    static channelOf = (quickAction?: string | null): TouchpointChannel | undefined =>
        ({ CALL: 'call', EMAIL: 'email', LINKEDIN: 'linkedin', LINKEDIN_SEARCH: 'linkedin' } as Record<string, TouchpointChannel>)[quickAction ?? ''];
    static resultsFor = (channel: TouchpointChannel) => MarketingTouchpoint.RESULTS.filter((_) => MarketingTouchpoint.CHANNEL_RESULTS[channel].includes(_.key));

    override readonly getName = computed(() => { this.snapshot(); return [this.channelOption()?.label, this.resultOption()?.label, this.outcomeOption()?.label].filter(Boolean).join(' · '); });

    user_id?: string;
    marketing_prospect_id?: string;
    marketing_prospect_activity_id?: string;
    company_id?: string;
    channel!: TouchpointChannel;
    result!: TouchpointResult;
    outcome?: TouchpointOutcome | null;
    notes?: string | null;
    occurred_at!: string;

    @Type(() => User) user?: User;

    channelOption = () => MarketingTouchpoint.CHANNELS.find((_) => _.key === this.channel);
    resultOption = () => MarketingTouchpoint.RESULTS.find((_) => _.key === this.result);
    outcomeOption = () => MarketingTouchpoint.OUTCOMES.find((_) => _.key === this.outcome);
}
