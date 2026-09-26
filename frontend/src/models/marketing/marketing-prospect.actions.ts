import { NxActionType } from "@models/_core/nx.actions";
import { MarketingProspect } from "./marketing-prospect.model";
import { firstValueFrom } from 'rxjs';

export const MarketingProspectActions = (that: MarketingProspect) => [
    {
        title: $localize`:@@i18n.common.open:open`,
        doubleClick: true,
        action: () => that.navigateTo(`/marketing/prospects`),
    },
    {
        title: $localize`:@@i18n.marketing.open_linkedin:Open LinkedIn`,
        on: () => !!that.linkedin_url,
        action: () => {
            if (that.linkedin_url) window.open(that.linkedin_url, '_blank');
        },
    },
    {
        title: $localize`:@@i18n.marketing.mark_status:Mark...`,
        group: true,
        children: [
            {
                title: $localize`:@@i18n.marketing.mark_new:Mark New`,
                group: true,
                on: () => that.status !== 'new',
                action: () => that.mark('new'),
            },
            {
                title: $localize`:@@i18n.marketing.mark_engaged:Mark Engaged`,
                group: true,
                on: () => that.status !== 'engaged',
                action: () => that.mark('engaged'),
            },
            {
                title: $localize`:@@i18n.marketing.mark_converted:Mark Converted`,
                group: true,
                on: () => that.status !== 'converted',
                action: () => that.mark('converted'),
            },
            {
                title: $localize`:@@i18n.marketing.mark_unresponsive:Mark Unresponsive`,
                group: true,
                on: () => that.status !== 'unresponsive',
                action: () => that.mark('unresponsive'),
            },
            {
                title: $localize`:@@i18n.marketing.mark_disqualified:Mark Disqualified`,
                group: true,
                on: () => that.status !== 'disqualified',
                action: () => that.mark('disqualified'),
            },
            {
                title: $localize`:@@i18n.marketing.mark_on_hold:Mark On Hold`,
                group: true,
                on: () => that.status !== 'on_hold',
                action: () => that.mark('on_hold'),
            },
        ],
    },
    {
        title: $localize`:@@i18n.common.delete:delete`,
        group: true,
        type: NxActionType.Destructive,
        action: () => that.modalConfirm().then(() => firstValueFrom(that.httpService.delete(`marketing/prospects/${that.id}`)).then(() => that)),
        hotkey: 'DEL',
        roles: 'marketing',
    },
]