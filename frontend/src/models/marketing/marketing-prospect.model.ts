import type { NxAction } from '@models/_core/nx.actions';
import type { Serializable } from '@models/_core/serializable';
import { VcardClass } from '@models/vcard/vcard-class.model';
import { Vcard } from '@models/vcard/vcard';
import { Type } from '@models/_core/hydrate';
import { CompanyContact } from '@models/company/company-contact.model';
import { User } from '@models/user/user.model';
import { LeadSource } from '@models/project/lead-source.model';
import { MarketingProspectActivity } from './marketing-prospect-activity.model';
import { MarketingInitiative } from './marketing-initiative.model';
import { IHasMarker, Marker } from '@enums/marker';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { tap } from 'rxjs';
import { MarketingProspectActions } from './marketing-prospect.actions';
import { Dictionary } from '@constants/constants';
import { nx } from '@models/_core/nx-bridge';

@Model('MarketingProspect')
export class MarketingProspect extends VcardClass implements IHasMarker {
    static API_PATH = (): string => 'marketing/prospects';
    static DB_TABLE_NAME = (): string => 'marketing_prospects';

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

    email!: string;
    user_id!: number;
    linkedin_url?: string;
    position?: string;
    phone?: string;
    notes?: string;
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

    mark = (state: string) =>
        this.httpService.put(`marketing/prospects/${this.id}`, { status: state })
            .pipe(tap((response) => this.status = ((response as { status?: string }).status ?? state) as typeof this.status));

    name = computed(() => { this.snapshot(); return this.company_contact?.getName() || this.getName() || this.email; });

    getPersonal = (): VcardClass | undefined => this.company_contact?.contact ?? this;

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
