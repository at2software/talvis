import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, firstValueFrom, from, mergeMap, toArray } from 'rxjs';
import { dayjs } from '@constants/date/dates';
import { Toast } from '@shards/toast/toast';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { NgbDropdownModule, NgbModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingProspect } from '@models/marketing/marketing-prospect.model';
import { MarketingInitiative } from '@models/marketing/marketing-initiative.model';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { GlobalService } from '@models/global.service';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { MarketingCsvImportModalComponent, parseCsv } from './marketing-csv-import-modal/marketing-csv-import-modal.component';
import type { CsvColumnMappingDto, CsvImportResultDto } from '@models/_core/api-response';
import { storageGet, storageSet } from '@constants/storage';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-prospects',
    templateUrl: './marketing-prospects.component.html',
    styleUrls: ['./marketing-prospects.component.scss'],
    imports: [FormsModule, RouterModule, NgbDropdownModule, NgbTooltipModule, Nx, AvatarComponent, EmptyStateComponent, ToolbarComponent, SpinnerComponent],
})
export class MarketingProspectsComponent {
    #marketingService = inject(MarketingService);
    #global = inject(GlobalService);
    #route = inject(ActivatedRoute);
    #router = inject(Router);
    #inputModalService = inject(InputModalService);
    #ngbModal = inject(NgbModal);
    readonly #STORAGE_KEY = 'marketing-prospects-filters';

    protected readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

    initiativeFilter = signal('');
    userFilter = signal('');
    selectedProspectId = signal('');

    statusFilters = signal([
        { key: 'new',          label: $localize`:@@i18n.common.new:new`,                     badgeClass: 'bg-cyan rounded-pill',      icon: MarketingProspect.STATUS_ICONS['new'],          selected: true },
        { key: 'engaged',      label: $localize`:@@i18n.marketing.engaged:engaged`,           badgeClass: 'bg-primary rounded-pill',   icon: MarketingProspect.STATUS_ICONS['engaged'],      selected: true },
        { key: 'converted',    label: $localize`:@@i18n.marketing.converted:converted`,       badgeClass: 'bg-success rounded-pill',   icon: MarketingProspect.STATUS_ICONS['converted'],    selected: true },
        { key: 'unresponsive', label: $localize`:@@i18n.marketing.unresponsive:unresponsive`, badgeClass: 'bg-warning rounded-pill',   icon: MarketingProspect.STATUS_ICONS['unresponsive'], selected: true },
        { key: 'disqualified', label: $localize`:@@i18n.marketing.disqualified:disqualified`, badgeClass: 'bg-danger rounded-pill',    icon: MarketingProspect.STATUS_ICONS['disqualified'], selected: true },
        { key: 'on_hold',      label: $localize`:@@i18n.marketing.on_hold:on hold`,           badgeClass: 'bg-secondary rounded-pill', icon: MarketingProspect.STATUS_ICONS['on_hold'],      selected: true },
    ]);

    #filtersSettled = signal(!this.#route.snapshot.firstChild?.params['id']);
    #prospectParams = computed<Dictionary | undefined>(() => this.#filtersSettled()
        ? {
            ...(this.initiativeFilter() && { marketing_initiative_id: parseInt(this.initiativeFilter()) }),
            ...(this.userFilter() && { user_id: parseInt(this.userFilter()) }),
        }
        : undefined);
    #prospects = modelListResource(this.#prospectParams, (params) => this.#marketingService.indexProspects(params));
    isLoading = computed(() => this.#prospects.isLoading() || this.#prospects.status() === 'idle');
    prospects = linkedSignal(() => this.#prospects.value());

    #initiatives = modelResource(() => this.#marketingService.indexInitiatives({ status: 'active' }));
    #overdueScan = modelListResource(
        () => (this.userFilter() ? { user_id: parseInt(this.userFilter()) } : {}),
        (params: Dictionary) => this.#marketingService.indexProspects(params),
    );
    initiatives = computed(() => {
        const initiatives = this.#initiatives.value()?.data ?? [];
        const counts = new Map<string, number>();
        for (const p of this.#overdueScan.value()) {
            if (!p.has_overdue_activities || !p.marketing_initiative?.id) continue;
            if (['unresponsive', 'disqualified', 'on_hold'].includes(p.status)) continue;
            const key = String(p.marketing_initiative.id);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        initiatives.forEach((i) => (i.overdue_prospects_count = counts.get(String(i.id)) ?? 0));
        return initiatives;
    });

    availableUsers    = computed(() => this.#global.team ?? []);
    selectedUser      = computed(() => this.availableUsers().find(u => String(u.id) === this.userFilter()));
    selectedUserName  = computed(() => this.selectedUser()?.fullName() ?? this.userFilter());
    totalOverdueCount = computed(() => this.initiatives().reduce((sum, i) => sum + (i.overdue_prospects_count ?? 0), 0));

    selectedInitiative             = computed(() => this.initiatives().find(i => String(i.id) === this.initiativeFilter()));
    selectedInitiativeName         = computed(() => this.selectedInitiative()?.name ?? '');
    selectedInitiativeOverdueCount = computed(() => this.selectedInitiative()?.overdue_prospects_count ?? 0);
    createProspectBlocker          = computed(() => {
        const initiative = this.selectedInitiative();
        if (!initiative) return $localize`:@@i18n.marketing.selectInitiativeFirst:select an initiative in the panel title first`;
        if (!initiative.leadSourceId()) return $localize`:@@i18n.marketing.noLeadSourceConfigured:no lead source configured for this initiative – add a channel to the initiative first`;
        return undefined;
    });

    statusCounts = computed(() => {
        const counts: Dictionary<number> = {};
        this.prospects().forEach(p => counts[p.status] = (counts[p.status] ?? 0) + 1);
        return counts;
    });

    filteredProspects = computed(() => {
        const filters = this.statusFilters();
        const selected = filters.filter(f => f.selected).map(f => f.key);
        if (selected.length === filters.length) return this.prospects();
        return this.prospects().filter(p => selected.includes(p.status));
    });

    constructor() {
        this.#restoreFiltersFromLocalStorage();

        if (!this.userFilter() && this.#global.user) {
            this.userFilter.set(this.#global.user.id.toString());
        }

        const directId = this.#route.snapshot.firstChild?.params['id'];
        if (directId) {
            this.#marketingService.showProspect(directId).subscribe({
                next: (prospect: MarketingProspect) => {
                    const initiativeId = prospect.marketing_initiative?.id;
                    if (initiativeId) {
                        this.initiativeFilter.set(String(initiativeId));
                        this.#saveFiltersToLocalStorage();
                    }
                    this.#filtersSettled.set(true);
                },
                error: () => this.#filtersSettled.set(true),
            });
        }

        this.#route.firstChild?.params.pipe(takeUntilDestroyed()).subscribe(params => {
            this.selectedProspectId.set(params['id'] ?? '');
        });

        effect(() => {
            const first = this.filteredProspects()[0];
            if (first && !this.#route.firstChild) this.#router.navigate(['/marketing/prospects', first.id]);
        });
    }

    toggleStatusFilter(key: string) {
        this.statusFilters.update(filters => filters.map(f => f.key === key ? { ...f, selected: !f.selected } : f));
        this.#saveFiltersToLocalStorage();
    }

    setUserFilter(id: string | number | null) {
        this.userFilter.set(id ? String(id) : '');
        this.#saveFiltersToLocalStorage();
    }

    setInitiativeFilter(id: string | number | null) {
        this.initiativeFilter.set(id ? String(id) : '');
        this.#saveFiltersToLocalStorage();
    }

    isSubscribedToInitiative(initiative: MarketingInitiative): boolean {
        const checkId = this.userFilter() ? parseInt(this.userFilter()) : this.#global.user?.id;
        return initiative.users?.some(u => u.id === checkId) ?? false;
    }

    actionsResolved = () => this.prospects.update(p => [...p]);

    navigateToProspect(event: Event, prospect: MarketingProspect) {
        const e = event as MouseEvent | KeyboardEvent;
        if (!e.ctrlKey && !e.shiftKey) this.#router.navigate(['/marketing/prospects', prospect.id]);
    }

    createNewProspect() {
        const blocker = this.createProspectBlocker();
        if (blocker) return Toast.warn(blocker);
        const leadSourceId = this.selectedInitiative()?.leadSourceId();

        this.#inputModalService.open('Prospect Name').then(result => {
            const prospectName = result?.text?.trim();
            if (!prospectName) return;

            const nameParts = prospectName.split(' ');
            const familyName = nameParts.length > 1 ? nameParts.at(-1)! : prospectName;
            const givenName  = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${prospectName}\nN:${familyName};${givenName};;;\nX-LANG:de\nX-FORMALITY:formal\nORG:\nROLE:\nEMAIL:\nTEL:\nEND:VCARD`;

            this.#marketingService.storeProspect({
                name: prospectName, vcard, email: '', status: 'new', added_via: 'manual',
                marketing_initiative_id: this.initiativeFilter(), lead_source_id: leadSourceId,
            }).subscribe({
                next: (created: MarketingProspect) => {
                    this.prospects.update(p => [created, ...p]);
                    this.#router.navigate(['/marketing/prospects', created.id]);
                },
                error: () => this.#prospects.reload(),
            });
        }).catch(() => {
            // no action
        });
    }

    readonly rescheduleTargets = [
        { label: $localize`:@@i18n.common.tomorrow:tomorrow`, date: () => dayjs().add(1, 'day') },
        { label: $localize`:@@i18n.marketing.next_monday:next monday`, date: () => dayjs().day(8) },
        { label: $localize`:@@i18n.marketing.postpone_1w:1 week`, date: () => dayjs().add(1, 'week') },
    ];

    async rescheduleOverdue(date: ReturnType<typeof dayjs>) {
        const { moved } = await firstValueFrom(this.#marketingService.rescheduleOverdueActivities({
            date: date.format('YYYY-MM-DD'),
            user_id: this.userFilter() || null,
            marketing_initiative_id: this.initiativeFilter() || null,
        }));
        Toast.success($localize`:@@i18n.marketing.overdue_moved:${moved}:count: prospects moved`);
        this.#prospects.reload();
    }

    exportCsv() {
        const prospects = this.filteredProspects();
        const headers = ['Name', 'Company', 'Email', 'Phone', 'Website', 'City', 'Role', 'Status'];
        const rows = prospects.map(p => {
            const card = p.card();
            return [
                p.getName(),
                card?.org ?? '',
                p.email ?? '',
                card?.first('TEL')?.vals[0] ?? '',
                card?.url ?? '',
                card?.first('ADR')?.vals[3] ?? '',
                card?.first('ROLE')?.vals[0] ?? '',
                p.status,
            ];
        });
        const csv = [headers, ...rows]
            .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
            download: 'prospects.csv',
        });
        a.click();
        URL.revokeObjectURL(a.href);
    }

    openImportFile() { this.fileInput().nativeElement.click(); }

    handleFileSelect(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const { headers, rows } = parseCsv(e.target!.result as string);
            if (!headers.length) return;
            const existingNames = this.prospects().flatMap(p => [
                p.getName()?.toLowerCase(),
                p.company()?.toLowerCase(),
            ]).filter((n): n is string => !!n);
            const modalRef = this.#ngbModal.open(MarketingCsvImportModalComponent, { size: 'xl' });
            modalRef.componentInstance.init({
                headers, rows,
                initiatives:         this.initiatives(),
                currentInitiativeId: this.initiativeFilter(),
                existingNames,
            });
            modalRef.result.then((result: CsvImportResultDto) => this.#doImport(result)).catch(() => {
                // no action
            });
        };
        reader.readAsText(file);
        (event.target as HTMLInputElement).value = '';
    }

    #doImport(result: CsvImportResultDto) {
        const { mappings, rows, initiativeId, leadSourceId } = result;
        const existing = new Set(
            this.prospects().flatMap(p => [p.getName()?.toLowerCase(), p.company()?.toLowerCase()]).filter(Boolean)
        );
        const getField = (row: string[], field: string) => {
            const idx = mappings.findIndex((m: CsvColumnMappingDto) => m.field === field);
            return idx >= 0 ? (row[idx] ?? '').trim() : '';
        };
        const toImport = rows.filter(row => {
            const org = getField(row, 'org').toLowerCase();
            const fn  = getField(row, 'fn').toLowerCase();
            if (!org && !fn && !getField(row, 'family_name') && !getField(row, 'given_name') && !getField(row, 'email')) return false;
            return (!org || !existing.has(org)) && (!fn || !existing.has(fn));
        });
        const requests = toImport.map(row => {
            const fn         = getField(row, 'fn');
            const familyName = getField(row, 'family_name');
            const givenName  = getField(row, 'given_name');
            const org        = getField(row, 'org');
            const email      = getField(row, 'email');
            const tel        = getField(row, 'tel');
            const url        = getField(row, 'url');
            const location   = getField(row, 'location');
            const role       = getField(row, 'role');
            const notes      = getField(row, 'notes');
            const displayName = fn || (givenName && familyName ? `${givenName} ${familyName}` : familyName || givenName || org || email) || '';
            const vcardLines = [
                'BEGIN:VCARD', 'VERSION:3.0',
                `FN:${displayName}`,
                `N:${familyName || ''};${givenName || ''};;;`,
                `ORG:${org}`, `EMAIL:${email}`, `TEL:${tel}`, `URL:${url}`, `ROLE:${role}`,
                'X-LANG:de', 'X-FORMALITY:formal',
            ];
            if (location) vcardLines.push(`ADR:;;;${location};;;`);
            vcardLines.push('END:VCARD');
            return this.#marketingService.storeProspect({
                name: displayName, vcard: vcardLines.join('\n'), email,
                ...(notes && { notes }),
                status: 'new', added_via: 'import',
                marketing_initiative_id: initiativeId,
                lead_source_id: leadSourceId,
            });
        });
        let skipped = 0;
        const skipDuplicate = (error: { status?: number }) => {
            if (error?.status !== 409) throw error;
            skipped++;
            return EMPTY;
        };
        from(requests).pipe(mergeMap(req => req.pipe(catchError(skipDuplicate)), 3), toArray()).subscribe(created => {
            this.prospects.update(p => [...created, ...p]);
            if (skipped) Toast.info($localize`:@@i18n.marketing.import_skipped_duplicates:${skipped}:count: rows skipped as duplicates`);
        });
    }

    #saveFiltersToLocalStorage() {
        storageSet(this.#STORAGE_KEY, {
            initiativeFilter: this.initiativeFilter(),
            userFilter: this.userFilter(),
            statusFilters: this.statusFilters().map(f => ({ key: f.key, selected: f.selected })),
        });
    }

    #restoreFiltersFromLocalStorage() {
        const filters = storageGet<{ initiativeFilter?: string; userFilter?: string; statusFilters?: { key: string; selected: boolean }[] }>(this.#STORAGE_KEY, {});
        if (filters.initiativeFilter !== undefined) this.initiativeFilter.set(filters.initiativeFilter);
        if (filters.userFilter !== undefined) this.userFilter.set(filters.userFilter);
        if (Array.isArray(filters.statusFilters)) {
            this.statusFilters.update(current => current.map(f => {
                const s = filters.statusFilters!.find((x) => x.key === f.key);
                return s ? { ...f, selected: s.selected } : f;
            }));
        }
    }
}
