import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, computed, effect, ElementRef, inject, input, signal, untracked, viewChildren } from '@angular/core';
import { VcardRow } from '@models/vcard/vcard-row';
import { Company } from '@models/company/company.model';
import { CompanyContact } from '@models/company/company-contact.model';
import { Contact } from '@models/company/contact.model';
import { ActionEmitterType } from '@app/nx/nx.directive';
import { VcardClass } from '@models/vcard/vcard-class.model';
import { User } from '@models/user/user.model';
import { MarketingProspect } from '@models/marketing/marketing-prospect.model';
import { NominatimHttpWrapper } from '@models/http/http.nominatim';
import { SOCIAL_MEDIA_TYPES } from '@constants/socialmediatypes';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Nx } from '@app/nx/nx.directive';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import * as Leaflet from 'leaflet';
import { addDarkTileLayer } from '@constants/map-tiles';
import { DB_COUNTRIES } from '../db.countries';
import { CountryEntryDto } from '@models/_core/api-response';
import { PlzDbService } from '../plz-db.service';
import { NComponent } from '@shards/n/n.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-vcard',
    templateUrl: './vcard.component.html',
    styleUrls: ['./vcard.component.scss'],
    imports: [NgTemplateOutlet, FormsModule, NComponent, Nx, NgbDropdownModule, NgbTooltipModule, SpinnerComponent],
})
export class VcardComponent {
    object = input.required<VcardClass>();
    type = input<string>('work');

    isCompany        = computed(() => this.object() instanceof Company);
    isCompanyContact = computed(() => this.object() instanceof CompanyContact);
    isContact        = computed(() => this.object() instanceof Contact);
    isUser           = computed(() => this.object() instanceof User);
    isProspect       = computed(() => this.object() instanceof MarketingProspect);

    private readonly mapContainers = viewChildren<ElementRef<HTMLElement>>('mapContainer');

    liClass: string = 'list-group-item pe-9 px-3 py-1';

    db_countries: CountryEntryDto[] = DB_COUNTRIES;
    showNameDetails = signal(false);
    smtypes = SOCIAL_MEDIA_TYPES;
    smtypekeys: string[] = Object.keys(this.smtypes);
    singleGeoLoad: boolean = false;
    isImportingImprint = signal(false);

    #nominatim = inject(NominatimHttpWrapper);
    #plzDb = inject(PlzDbService);
    #mapInstances = new Map<HTMLElement, Leaflet.Map>();
    #destroyRef = inject(DestroyRef);
    #cdr = inject(ChangeDetectorRef);
    #card = computed(() => this.object().card());
    src_string: string = '';

    constructor() {
        delete (Leaflet.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
        Leaflet.Icon.Default.mergeOptions({
            iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
            iconUrl: 'assets/leaflet/marker-icon.png',
            shadowUrl: 'assets/leaflet/marker-shadow.png',
        });
        effect(() => {
            this.#card();
            untracked(() => {
                this.resetDirty();
                this.ensureI18nFields();
            });
        });
        effect(() => {
            this.mapContainers();
            untracked(() => this.initializeMaps());
        });

        this.#destroyRef.onDestroy(() => {
            this.#mapInstances.forEach((map) => map.remove());
            this.#mapInstances.clear();
        });
    }

    smSrcForKey = (key?: string) => (key && this.smtypekeys.includes(key) ? this.smtypes[key] : undefined);

    resetDirty = (): void => {
        const card = this.object().card();
        if (!card) return;
        this.src_string = card.toString();
        this.#lookupGeo();
    };
    #hasLocation = (adr: VcardRow): boolean => [2, 3, 5].some((i) => !!adr.vals[i]?.trim());
    #lookupGeo = (): void => {
        const obj = this.object();
        const adr = obj.card()?.first('ADR');
        if (this.singleGeoLoad || !adr || obj.card()?.first('GEO') || !this.#hasLocation(adr)) return;
        this.singleGeoLoad = true;
        this.#nominatim.init().then(() =>
            this.#nominatim.lookup(adr).subscribe((info) => {
                const card = obj.card();
                if (obj !== this.object() || !card || card.first('GEO') || !Array.isArray(info) || !info.length) return;
                card.rows.push(new VcardRow('GEO', [], [info[0].lat, info[0].lon]));
                this.#cdr.markForCheck();
                this.updateVcard(true);
            }),
        );
    };
    useName = (event: Event & { ctrlKey?: boolean }) => {
        if (event.ctrlKey) {
            this.onOrgChange(event);
        }
    };

    isDirty = (): boolean => this.src_string != (this.object().card()?.toString() ?? '');

    delete = (r: number) => {
        this.object().card()?.rows.splice(r, 1);
    };
    removeRow = (_: VcardRow) => {
        const card = this.object().card();
        const index = card?.rows.indexOf(_) ?? -1;
        if (index !== -1) card!.rows.splice(index, 1);
    };
    addRow = (s: string) => {
        const row = VcardRow.fromString(s);
        const card = this.object().card();
        if (row && card) card.rows.push(row);
    };
    addEmergencyContact = () => {
        const card = this.object().card();
        if (card) {
            card.rows.push(VcardRow.fromString('RELATED;TYPE=emergency:')!);
            card.rows.push(VcardRow.fromString('TEL;TYPE=cell,emergency:')!);
        }
    };
    updateVcard = (silent = false, then?: () => void) => {
        const obj = this.object();
        const card = obj.card();
        if (!card || !this.isDirty()) return;
        this.src_string = card.toString();
        obj.saveCard(silent).subscribe(() => then?.());
    };
    onAdrFocusOut = (event: FocusEvent, row: VcardRow) => {
        if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return;
        const card = this.object().card();
        if (!card || this.src_string.split('\n').includes(row.toString())) return;
        card.rows = card.rows.filter((_) => _.key !== 'GEO');
        this.singleGeoLoad = false;
        this.updateVcard(false, () => this.#lookupGeo());
    };
    importImprint = () => {
        const obj = this.object();
        if (!(obj instanceof Company) || this.isImportingImprint()) return;

        this.isImportingImprint.set(true);
        (obj as Company).importImprint().subscribe({
            next: (_) => {
                Object.assign(obj, _);
                this.isImportingImprint.set(false);
            },
            error: () => {
                this.isImportingImprint.set(false);
            },
        });
    };
    getTelType = (row: VcardRow) => {
        if (row.mods.filter((_) => _.toLowerCase().match('voice')).length) return 'VOICE';
        if (row.mods.filter((_) => _.toLowerCase().match('cell')).length) return 'MOBILE';
        if (row.mods.filter((_) => _.toLowerCase().match('fax')).length) return 'FAX';
        if (row.mods.filter((_) => _.toLowerCase().match('work')).length) return 'WORK';
        if (row.mods.filter((_) => _.toLowerCase().match('home')).length) return 'HOME';
        return 'VOICE';
    };
    setTelType = (row: VcardRow, type: string) => {
        const isEmergency = this.isEmergencyContact(row);
        row.mods = row.mods.filter((_) => !_.toLowerCase().match(/^type=/i));

        if (isEmergency) {
            row.mods.push(`TYPE=${type},emergency`);
        } else {
            row.mods.push(`TYPE=${type}`);
        }
    };
    isEmergencyContact = (row: VcardRow) => {
        return row.mods.some((_) => _.toLowerCase().includes('emergency'));
    };
    getEmergencyTelForRelated = (relatedIndex: number): VcardRow | null => {
        const rows = this.object().card()?.rows;
        if (!rows) return null;
        for (let i = relatedIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.key === 'TEL' && this.isEmergencyContact(row)) return row;
            if (row.key === 'RELATED') break;
        }
        return null;
    };
    isEmergencyTelForRelated = (telRow: VcardRow): boolean => {
        const rows = this.object().card()?.rows;
        if (!rows || telRow.key !== 'TEL') return false;
        if (!this.isEmergencyContact(telRow)) return false;
        const telIndex = rows.indexOf(telRow);
        for (let i = telIndex - 1; i >= 0; i--) {
            const row = rows[i];
            if (row.key === 'RELATED' && row.mods.includes('TYPE=emergency')) return true;
            if (row.key === 'TEL') break;
        }
        return false;
    };

    org = () => this.object().card()?.first('ORG')?.vals[0] ?? '';
    onOrgChange = ($event: Event) => {
        const card = this.object().card();
        if (card) {
            const value = ($event.target as HTMLInputElement).value;
            card.get('FN')[0].vals[0] = value;
            card.get('ORG')[0].vals[0] = value;
        }
    };
    fn = () => this.object().card()?.get('FN')[0].vals[0] ?? '';
    onFnChange($event: Event) {
        const card = this.object().card();
        if (card) {
            const value = ($event.target as HTMLInputElement).value;
            card.get('FN')[0].vals[0] = value;
            const n = card.get('N');
            if (n?.length) {
                const parts = value.split(' ');
                const ref = n[0].vals;
                if (parts.length > 0) ref[1] = parts.shift()!;
                else ref[1] = '';
                if (parts.length > 0) ref[0] = parts.pop()!;
                else ref[0] = '';
                if (parts.length > 0) ref[2] = parts.join(' ');
                else ref[2] = '';
            }
        }
    }
    onNChange(row: VcardRow) {
        let fn = row.vals[1] + ' ' + row.vals[2] + ' ' + row.vals[0];
        fn = fn.replace(/\s+/, ' ');
        const card = this.object()?.card();
        if (card) card.get('FN')[0].vals[0] = fn;
    }
    async onPlzUpdate(o: VcardRow): Promise<void> {
        if (o.vals[6] != 'DE') return;
        if (o.vals[5].length != 5) return;
        const res = await this.#plzDb.lookup(o.vals[5]);
        if (res.length > 0) {
            o.vals[3] = res[0].ort;
            this.#cdr.markForCheck();
        }
    }
    needsWarning(o: VcardRow): string | undefined {
        if (['CLASS'].includes(o.key)) return o.key + ' is not needed here';
        if (this.isCompany()) {
            if (['N', 'TITLE'].includes(o.key)) return o.key + ' is not needed here (should be part of a contact)';
        }
        if (this.isCompanyContact()) {
            if (['ORG'].includes(o.key)) return o.key + ' is not needed here (should be part of company information)';
            if (['ADR'].includes(o.key)) return o.key + ' is not needed here (should be part of company information)';
            if (['URL'].includes(o.key)) return o.key + ' is not needed here (should be part of company information)';
        }
        if (this.isContact()) {
            if (['ORG'].includes(o.key)) return o.key + ' is not needed here (personal contact could  work in many companies)';
        }
        return undefined;
    }
    singleActionResolved(a: ActionEmitterType) {
        if (a.action.title === 'Remove') {
            this.removeRow(a.object.nx() as VcardRow);
            this.updateVcard();
        }
    }

    initializeMaps() {
        const containers = this.mapContainers();
        if (!containers.length || !this.object()?.card) return;

        containers.forEach((container) => {
            const mapEl = container.nativeElement;
            const mapId = mapEl.getAttribute('data-map-id');
            const lat = mapEl.getAttribute('data-lat');
            const lon = mapEl.getAttribute('data-lon');

            if (mapId && lat && lon) {
                const geoRow = new VcardRow('GEO', [], [lat, lon]);
                this.initMap(geoRow, mapEl);
            }
        });
    }

    initMap(geoRow: VcardRow, container: HTMLElement) {
        const lat = parseFloat(geoRow.vals[0]);
        const lon = parseFloat(geoRow.vals[1]);

        if (isNaN(lat) || isNaN(lon)) {
            container.innerHTML = '<div class="p-3 text-muted text-center">Invalid coordinates</div>';
            return;
        }

        if (this.#mapInstances.has(container)) {
            return;
        }

        container.innerHTML = '';

        const map = Leaflet.map(container, {
            zoomControl: false,
            attributionControl: false,
            dragging: true,
            scrollWheelZoom: true,
        }).setView([lat, lon], 15);

        addDarkTileLayer(map);

        const pinIcon = Leaflet.divIcon({
            className: 'map-pin',
            html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
            iconSize: [30, 30],
            iconAnchor: [15, 30],
        });
        Leaflet.marker([lat, lon], { icon: pinIcon }).addTo(map);

        this.#mapInstances.set(container, map);

        setTimeout(() => {
            if (this.#mapInstances.get(container) !== map) return;
            map.invalidateSize();
            map.setView([lat, lon], 15);
        }, 200);
    }

    hasGeoForAddress(adrIndex: number): VcardRow | null {
        return this.getGeoForAddress(adrIndex);
    }

    getGeoForAddress(_adrIndex: number): VcardRow | null {
        const rows = this.object()?.card()?.rows;
        if (!rows) return null;
        const geoRows = rows.filter((row) => row.key === 'GEO');
        return geoRows.length > 0 ? geoRows[0] : null;
    }

    ensureI18nFields() {
        const card = this.object()?.card();
        if (!card) return;

        if (!card.rows.some((r) => r.key === 'FN')) this.addRow('FN:');
        if (!card.rows.some((r) => r.key === 'N')) this.addRow('N:;;;;');

        if (this.isContact() || this.isUser() || this.isProspect()) {
            if (!card.rows.some((r) => r.key === 'X-LANG')) this.addRow('X-LANG:de');
            if (!card.rows.some((r) => r.key === 'X-FORMALITY')) this.addRow('X-FORMALITY:formal');
        }
    }

    addLanguageFormality = () => {
        const card = this.object()?.card();
        if (!card) return;
        if (!card.rows.some((r) => r.key === 'X-LANG')) this.addRow('X-LANG:de');
        if (!card.rows.some((r) => r.key === 'X-FORMALITY')) this.addRow('X-FORMALITY:formal');
    };

    hasLanguageFormality = (): boolean => {
        return this.object()?.card()?.rows.some((r) => r.key === 'X-LANG') ?? false;
    };
}
