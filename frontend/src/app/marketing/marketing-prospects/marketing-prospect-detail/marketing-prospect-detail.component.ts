import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingProspect } from '@models/marketing/marketing-prospect.model';
import { MarketingProspectActivity } from '@models/marketing/marketing-prospect-activity.model';
import { modelResource } from '@models/http/model-resource';
import { Nx } from '@app/nx/nx.directive';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { MarketingConvertProspectModalComponent } from '../marketing-convert-prospect-modal/marketing-convert-prospect-modal.component';
import { MarketingLinkContactModalComponent } from '../marketing-link-contact-modal/marketing-link-contact-modal.component';
import { VcardComponent } from '@app/customers/_shards/vcard/vcard.component';
import { RteComponent } from '@app/_shards/rte/rte.component';
import { personalized } from '@constants/personalized';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { GlobalService } from '@models/global.service';
import { Dictionary } from '@constants/constants';
import { StackedTableDirective } from '@directives/stacked-table.directive';
import { MarketingTouchpoint } from '@models/marketing/marketing-touchpoint.model';
import { CompanyContact } from '@models/company/company-contact.model';
import { Toast } from '@shards/toast/toast';
import { TouchpointModalComponent } from '../../shared/touchpoint-modal/touchpoint-modal.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-prospect-detail',
    templateUrl: './marketing-prospect-detail.component.html',
    imports: [StackedTableDirective, DatePipe, FormsModule, NgbTooltipModule, Nx, VcardComponent, ToolbarComponent, RteComponent, RouterLink, SpinnerComponent],
})
export class MarketingProspectDetailComponent {
    #marketingService = inject(MarketingService);
    #route = inject(ActivatedRoute);
    #modal = inject(ModalBaseService);
    #globalService = inject(GlobalService);

    #prospectId = toSignal(this.#route.params.pipe(map(params => params['id'] as string | undefined)));
    #prospectRes = modelResource(this.#prospectId, id => this.#marketingService.showProspect(id));
    #duplicatesRes = modelResource(this.#prospectId, id => this.#marketingService.showProspectDuplicates(id));

    prospect        = linkedSignal(() => this.#prospectRes.value());
    isLoading       = this.#prospectRes.isLoading;
    vcardCollapsed  = signal(true);
    selectedActivity = signal<MarketingProspectActivity | undefined>(undefined);
    activities      = linkedSignal(() => this.prospect()?.activities ?? []);

    pendingActivities   = computed(() => this.activities().filter(a => a.status === 'pending'));
    completedActivities = computed(() => this.activities().filter(a => ['completed', 'skipped'].includes(a.status)));
    touchpoints = computed(() => this.prospect()?.touchpoints ?? []);
    duplicateProspects = computed(() => this.#duplicatesRes.value()?.prospects ?? []);
    duplicateContacts = computed(() => this.#duplicatesRes.value()?.company_contacts ?? []);
    hasDuplicates = computed(() => this.duplicateProspects().length + this.duplicateContacts().length > 0);

    constructor() {
        this.#globalService.onActionsResolved.pipe(takeUntilDestroyed()).subscribe(({ object }) => {
            if (object instanceof MarketingProspect && String(object.id) === String(this.#prospectId())) this.#prospectRes.reload();
        });
    }

    onActivityActionsResolved = () => this.activities.update(a => [...a]);

    isActivityOverdue = (activity: MarketingProspectActivity) =>
        new Date(activity.scheduled_at) < new Date() && activity.status === 'pending';

    canExecuteQuickAction(activity: MarketingProspectActivity): boolean {
        switch (activity.marketing_activity?.quick_action) {
            case 'EMAIL':         return !!this.#getEmail();
            case 'LINKEDIN':      return !!this.#getLinkedIn();
            case 'LINKEDIN_SEARCH': return true;
            case 'CALL':          return !!this.#getPhone();
            default:              return false;
        }
    }

    executeQuickAction(activity: MarketingProspectActivity): void {
        switch (activity.marketing_activity?.quick_action) {
            case 'EMAIL': {
                const email = this.#getEmail();
                if (!email) return;
                const body = personalized(this.#getEmailBody(activity), this.prospect()!.personalizations());
                window.location.href = `mailto:${email}?subject=${encodeURIComponent(activity.marketing_activity?.name || '')}&body=${encodeURIComponent(body)}`;
                break;
            }
            case 'LINKEDIN':
                window.open(this.#getLinkedIn()!, '_blank');
                break;
            case 'LINKEDIN_SEARCH': {
                const query = `${this.prospect()?.name() ?? ''} ${this.prospect()?.company() ?? ''}`.trim();
                window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`, '_blank');
                break;
            }
            case 'CALL':
                window.location.href = `tel:${this.#getPhone()!.replace(/[\s-]/g, '')}`;
                break;
        }
        this.logTouchpoint(activity);
    }

    logTouchpoint(activity?: MarketingProspectActivity) {
        const prospect = this.prospect();
        if (!prospect) return;
        const channel = MarketingTouchpoint.channelOf(activity?.marketing_activity?.quick_action);
        this.#modal.open(TouchpointModalComponent, {
            title: activity?.getName() ?? $localize`:@@i18n.marketing.log_contact:log contact`,
            channel,
            channelLocked: !!channel,
            withRetry: !!activity,
        }).then((payload) => {
            if (!payload) return;
            this.#marketingService.storeProspectTouchpoint(prospect.id, { ...payload, marketing_prospect_activity_id: activity?.id ?? null }).subscribe({
                next: () => this.#prospectRes.reload(),
                error: () => Toast.error($localize`:@@i18n.marketing.touchpoint_save_failed:saving the contact failed – please try again`),
            });
        });
    }

    matchedBy = (model: MarketingProspect | CompanyContact): string => ((model.var['matched_by'] ?? []) as string[]).join(', ');
    isSameInitiative = (other: MarketingProspect) => other.marketing_initiative_id == this.prospect()?.marketing_initiative_id;

    async mergeDuplicate(other: MarketingProspect) {
        const prospect = this.prospect();
        if (!prospect) return;
        try {
            await prospect.modalConfirm(
                $localize`:@@i18n.marketing.merge_prospect:merge prospect`,
                $localize`:@@i18n.marketing.merge_prospect_confirm:Merge ${other.name()}:name: into this prospect? Contact data, notes and contact history are taken over, the duplicate is deleted.`,
            );
        } catch {
            return;
        }
        const merged = await firstValueFrom(this.#marketingService.mergeProspect(prospect.id, other.id));
        this.prospect.set(merged);
        this.#duplicatesRes.reload();
        this.#prospectRes.reload();
    }

    linkDuplicateContact(contact: CompanyContact) {
        const prospect = this.prospect();
        if (!prospect) return;
        this.#marketingService.updateProspect(prospect.id, { company_contact_id: contact.id }).subscribe((updated: MarketingProspect) => {
            this.prospect.set(updated);
            this.#duplicatesRes.reload();
        });
    }

    getQuickActionIcon(qa: string): string {
        return ({ EMAIL: 'email', LINKEDIN: 'open_in_new', LINKEDIN_SEARCH: 'search', CALL: 'phone' } as Dictionary<string>)[qa] || '';
    }

    getLocalizedDescription = (activity: MarketingProspectActivity): string =>
        activity.localizedDescription(this.prospect()?.getLang() || 'de', this.prospect()?.getFormality() || 'formal');

    convertProspect() {
        if (!this.prospect()) return;
        this.#modal.open(MarketingConvertProspectModalComponent, { prospect: this.prospect()! })
            .then(result => {
                if (!result) return;
                this.#marketingService.convertProspect(this.prospect()!.id, result).subscribe({
                    next: () => this.#prospectRes.reload(),
                    error: () => alert('Failed to convert prospect. Please try again.'),
                });
            });
    }

    linkToContact() {
        if (!this.prospect()) return;
        this.#modal.open(MarketingLinkContactModalComponent, { prospect: this.prospect()! })
            .then(result => {
                if (!result) return;
                this.#marketingService.updateProspect(this.prospect()!.id, { company_contact_id: result.company_contact_id })
                    .subscribe({
                        next: (updated: MarketingProspect) => this.prospect.set(updated),
                        error: () => alert('Failed to link contact. Please try again.'),
                    });
            });
    }

    unlinkCompany() {
        if (!this.prospect() || !confirm('Unlink this company from the prospect?')) return;
        this.#marketingService.updateProspect(this.prospect()!.id, { company_id: null })
            .subscribe((updated: MarketingProspect) => this.prospect.set(updated));
    }

    #getEmail = () => this.prospect()?.emailAddress() ?? null;
    #getLinkedIn = () => this.prospect()?.linkedInUrl() ?? null;
    #getPhone = () => this.prospect()?.phoneNumber() ?? null;

    #getEmailBody(activity: MarketingProspectActivity): string {
        const targetId = String(activity.marketing_initiative_activity_id || activity.marketing_activity?.id || '');
        if (!targetId) return this.getLocalizedDescription(activity);
        const matched = this.activities().find((item) => {
            const id = String(item?.marketing_initiative_activity_id || item?.marketing_initiative_activity?.id || item?.marketing_activity?.id || '');
            return id === targetId;
        });
        return this.getLocalizedDescription(
            matched instanceof MarketingProspectActivity ? matched : (matched ? MarketingProspectActivity.fromJson(matched) : activity)
        );
    }
}
