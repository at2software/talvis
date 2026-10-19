import type { NxAction } from '@models/_core/nx.actions';
import type { Serializable } from '@models/_core/serializable';
import { VcardClass } from '@models/vcard/vcard-class.model';
import { Vcard } from '@models/vcard/vcard';
import { Type } from '@models/_core/hydrate';
import { CompanyContact } from '@models/company/company-contact.model';
import { User } from '@models/user/user.model';
import { LeadSource } from '@models/project/lead-source.model';
import { MarketingProspectActivity } from './marketing-prospect-activity.model';
import { MarketingTouchpoint } from './marketing-touchpoint.model';
import { MarketingInitiative } from './marketing-initiative.model';
import { IHasMarker, Marker } from '@enums/marker';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { VcardRow } from '@models/vcard/vcard-row';
import { personalized } from '@constants/personalized';
import { MarketingProspectActions } from './marketing-prospect.actions';
import { Dictionary } from '@constants/constants';
import { nx } from '@models/_core/nx-bridge';

@Model('MarketingProspect')
export class MarketingProspect extends VcardClass implements IHasMarker {
    static API_PATH = (): string => 'marketing/prospects';
    static DB_TABLE_NAME = (): string => 'marketing_prospects';

    static readonly FREEMAIL_DOMAINS = ['gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'web.de', 't-online.de', 'outlook.com', 'hotmail.com', 'yahoo.com', 'yahoo.de', 'icloud.com', 'aol.com', 'freenet.de', 'posteo.de', 'mail.de'];

    static readonly STATUS_ICONS: Dictionary<string> = {
        new: 'add_circle',
        engaged: 'chat_bubble',
        converted: 'check_circle',
        unresponsive: 'sms_failed',
        disqualified: 'block',
        on_hold: 'pause_circle',
    }

    static readonly STATUS_BG_CLASSES: Dictionary<string> = {
        new: 'bg-cyan',
        engaged: 'bg-teal',
        converted: 'bg-success',
        unresponsive: 'bg-warning',
        disqualified: 'bg-danger',
        on_hold: 'bg-secondary',
    }

    static readonly STATUS_TEXT_CLASSES: Dictionary<string> = {
        new: 'text-cyan',
        engaged: 'text-teal',
        converted: 'text-success',
        unresponsive: 'text-warning',
        disqualified: 'text-danger',
        on_hold: 'text-muted',
    }

    override frontendUrl = (): string | undefined => (nx().global.user?.hasRole('marketing') ? `/marketing/prospects/${this.id}` : undefined);

    protected override buildActions(): NxAction[] { return MarketingProspectActions(this) }
    override readonly getName = computed((): string => { this.snapshot(); return this.company_contact?.getName() || this.card()?.name || this.email || ''; });

    email!: string;
    user_id!: number;
    linkedin_url?: string;
    position?: string;
    phone?: string;
    notes?: string;
    marketing_initiative_id?: string;
    company_id?: string;
    company_contact_id?: string;
    companyModel?: { company_name?: string; [key: string]: unknown };
    company = computed((): string => {
        this.snapshot();
        const src: VcardClass = this.company_contact?.company?.card() ? this.company_contact.company : this;
        return src.card()?.get('ORG')?.map((_: { vals: string[] }) => _.vals.join(' '))?.join(', ') ?? '';
    });
    status!: 'new' | 'engaged' | 'converted' | 'unresponsive' | 'disqualified' | 'on_hold';
    added_via!: 'addon' | 'manual' | 'import';
    has_overdue_activities?: boolean;
    marker: number | null = null;

    statusIcon      = () => MarketingProspect.STATUS_ICONS[this.status]      ?? 'help_outline'
    statusBgClass   = () => MarketingProspect.STATUS_BG_CLASSES[this.status]  ?? 'bg-secondary'
    statusTextClass = () => MarketingProspect.STATUS_TEXT_CLASSES[this.status] ?? 'text-muted'

    readonly #inactiveStatuses = ['unresponsive', 'disqualified', 'on_hold'];

    override markerClass = computed((): string => {
        this.snapshot();
        if (this.#inactiveStatuses.includes(this.status)) return '';
        return this.marker !== null && Marker.COLORS[this.marker as number] ? `marker marker-${Marker.COLORS[this.marker as number]}` : '';
    });

    @Type(()=>CompanyContact) company_contact?: CompanyContact;
    @Type(()=>User) user?: User;
    @Type(()=>LeadSource) lead_source?: LeadSource;
    @Type(()=>MarketingInitiative) marketing_initiative?: MarketingInitiative;
    @Type(()=>MarketingProspectActivity) activities?: MarketingProspectActivity[];
    @Type(()=>MarketingTouchpoint) touchpoints?: MarketingTouchpoint[];

    mark = (state: string) =>
        this.httpService.put(`marketing/prospects/${this.id}`, { status: state })
            .pipe(tap((response) => this.status = ((response as { status?: string }).status ?? state) as typeof this.status));

    name = computed(() => this.getName());

    getPersonal = (): VcardClass | undefined => this.company_contact?.contact ?? this;

    #cards = (): VcardClass[] => ([this, this.company_contact, this.company_contact?.contact] as (VcardClass | undefined)[]).filter((_): _ is VcardClass => !!_);
    contactValues = (key: 'EMAIL' | 'TEL' | 'URL'): string[] =>
        [...new Set(this.#cards().flatMap((_) => _.card()?.get(key) ?? []).map((_) => _.vals[0]?.trim()).filter((_): _ is string => !!_))];
    emailAddress = (): string | null => this.contactValues('EMAIL')[0] ?? (this.email || null);
    phoneNumber = (): string | null => this.contactValues('TEL')[0] ?? (this.phone || null);
    websiteUrl = (): string | null => {
        const cards = [...this.#cards(), this.company_contact?.company].filter((_): _ is VcardClass => !!_);
        const url = cards.flatMap((_) => _.card()?.get('URL') ?? []).map((_) => _.vals[0]?.trim()).find((_) => !!_ && !_.includes('linkedin.com'));
        const domain = this.emailAddress()?.split('@')[1]?.toLowerCase();
        const site = url ?? (domain && !MarketingProspect.FREEMAIL_DOMAINS.includes(domain) ? domain : null);
        return site ? (/^https?:\/\//i.test(site) ? site : `https://${site}`) : null;
    };
    companySearchUrl = (): string => `https://www.google.com/search?q=${encodeURIComponent(`${this.company() || this.name()} Telefon`)}`;
    addContactValue = (key: 'TEL' | 'EMAIL' | 'URL', value: string): Observable<VcardClass> => {
        const target: VcardClass = this.company_contact ?? this;
        const card = target.card() ?? new Vcard('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD');
        card.rows = card.rows.filter((_) => _.key !== key || !!_.vals.join('').trim());
        const row = VcardRow.fromString(`${key}${key === 'URL' ? '' : ';TYPE=work'}:${value.trim()}`)!;
        const end = card.rows.findIndex((_) => _.key === 'END');
        card.rows.splice(end === -1 ? card.rows.length : end, 0, row);
        target.card.set(card);
        return target.saveCard();
    };
    personalizations = (): Dictionary<string> => {
        const cc = this.company_contact;
        const contact = cc?.contact;
        const firstName = this.firstName() || cc?.firstName() || contact?.firstName() || '';
        const familyName = this.familyName() || cc?.familyName() || contact?.familyName() || '';
        const fullName = this.fullName() || cc?.fullName() || contact?.fullName() || this.getName() || '';
        const salutation = this.#salutation(firstName, familyName, fullName,
            this.salutation() || cc?.salutation() || contact?.salutation() || '',
            this.gender || cc?.gender || contact?.gender || '');
        const company = this.company() || this.companyModel?.company_name || cc?.company?.getName() || '';
        const email = this.emailAddress() || '';
        const phone = this.phoneNumber() || '';

        return { salutation, firstName, familyName, fullName, name: fullName, company, companyName: company, email, phone,
                 first_name: firstName, family_name: familyName, full_name: fullName };
    };
    personalizedText = (activity: MarketingProspectActivity): string =>
        personalized(activity.localizedDescription(this.getLang() || 'de', this.getFormality() || 'formal'), this.personalizations());

    #salutation(firstName: string, familyName: string, fullName: string, rawSalutation: string, gender: string): string {
        const lang = this.getLang() || 'de';
        const formality = this.getFormality() || 'formal';

        if (formality === 'informal') {
            const prefix = lang === 'de' ? 'Hallo' : 'Hello';
            const name = firstName || fullName || familyName;
            return name ? `${prefix} ${name},` : `${prefix},`;
        }
        if (lang === 'de') {
            if (familyName) return gender === 'F' ? `Sehr geehrte Frau ${familyName},` : `Sehr geehrter Herr ${familyName},`;
            if (fullName) return `Sehr geehrte/r ${fullName},`;
            if (rawSalutation) return `${rawSalutation},`;
            return 'Sehr geehrte Damen und Herren,';
        }
        const honorific = gender === 'F' ? 'Ms.' : 'Mr.';
        if (familyName) return `Dear ${honorific} ${familyName},`;
        if (fullName) return `Dear ${fullName},`;
        if (rawSalutation) return `Dear ${rawSalutation.replace(/,$/, '')},`;
        return 'Dear Sir or Madam,';
    }
    linkedInUrl = (): string | null => this.contactValues('URL').find((_) => _.includes('linkedin.com')) ?? this.contactValues('URL')[0] ?? (this.linkedin_url || null);

    override afterDeserialize(json: Dictionary, seen?: WeakSet<Serializable>): void {
        this.#ensureVcardNameFields();
        super.afterDeserialize(json, seen);
    }

    #ensureVcardNameFields() {
        const emailFallback = this.email || '';
        if (!this.card()) {
            this.card.set(new Vcard(`BEGIN:VCARD\nVERSION:3.0\nFN:${emailFallback}\nN:${emailFallback};;;;\nEND:VCARD`));
            return;
        }
        const card = this.card()!;
        const fnRow = card.rows.find(r => r.key === 'FN');
        const nRow = card.rows.find(r => r.key === 'N');
        if (fnRow && nRow) return;
        const missing: string[] = [];
        if (!fnRow) {
            const fn = nRow ? [nRow.vals[1], nRow.vals[0]].filter(Boolean).join(' ') || emailFallback : emailFallback;
            missing.push(`FN:${fn}`);
        }
        if (!nRow) {
            const n = fnRow?.vals[0] || emailFallback;
            missing.push(`N:${n};;;;`);
        }
        let vcardStr = card.toString();
        const endIdx = vcardStr.lastIndexOf('\nEND:VCARD');
        vcardStr = endIdx !== -1
            ? vcardStr.slice(0, endIdx) + '\n' + missing.join('\n') + vcardStr.slice(endIdx)
            : vcardStr + '\n' + missing.join('\n');
        this.card.set(new Vcard(vcardStr));
    }

}
