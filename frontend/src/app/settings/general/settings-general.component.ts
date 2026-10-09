import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { tracked } from '@constants/tracked';
import { of, switchMap } from 'rxjs';
import { modelResource } from '@models/http/model-resource';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { InputSettingsGroupComponent } from '@shards/input-group/input-settings-group.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { TextParamEditorComponent } from '@shards/text-param-editor/text-param-editor.component';
import { Toast } from '@shards/toast/toast';
import { typeahead } from '@constants/constants';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { CompanyService } from '@models/company/company.service';
import { ParamService } from '@models/param/param.service';
import { Param } from '@models/param/param.model';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { GlobalService } from '@models/global.service';
import * as Params from '@models/_core/params';
import { ONBOARDING_HIDDEN } from '@models/setup/setup.service';

@Component({
    selector: 'app-settings-general',
    templateUrl: './settings-general.component.html',
    styleUrl: './settings-general.component.scss',
    imports: [ScrollbarComponent, InputSettingsGroupComponent, TextParamEditorComponent, SearchInputComponent, AvatarComponent, RouterLink, NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsGeneralComponent {
    tab = signal(0);
    cLanguage = signal<{ key: string; name: string }[]>([]);
    cCountry = signal<{ key: string; name: string }[]>([]);
    cCurrency = signal<{ key: string; name: string }[]>([]);
    #paramService = inject(ParamService);
    #companyService = inject(CompanyService);
    #inputModalService = inject(InputModalService);
    #global = inject(GlobalService);

    readonly #company = modelResource(() => this.#paramService.show('params/ME_ID').pipe(switchMap((me) => (me.value ? this.#companyService.show(me.value as string) : of(null)))));
    readonly companyLoading = this.#company.isLoading;
    protected readonly _me = linkedSignal<Company | null>(() => this.#company.value() ?? null);
    readonly me = tracked(this._me);
    readonly addressLines = computed(() => (this._me()?.address ?? '').split('<br>').map((_) => _.trim()).filter(Boolean));
    readonly showGettingStarted = signal(!Params.read(this.#global.user!, ONBOARDING_HIDDEN, 0));

    constructor() {
        Promise.all([import('@constants/iso/iso0639-1'), import('@constants/iso/iso3166'), import('@constants/iso/iso4217')]).then(([lang, country, currency]) => {
            this.cLanguage.set(typeahead(lang.LANGUAGE_CODES, 'alpha2', 'English'));
            this.cCountry.set(typeahead(country.COUNTRY_CODES, 'alpha-2', 'name'));
            this.cCurrency.set(typeahead(currency.CURRENCY_CODES, 'AlphabeticCode', 'Currency'));
        });
    }

    onCompanyChanged(selected: Serializable) {
        const company = selected.assert(Company);
        if (!company) return;
        Param.write('params/ME_ID', company.id).subscribe(() => Toast.info('Company ID updated'));
        this._me.set(company);
    }

    toggleGettingStarted() {
        const user = this.#global.user!;
        const hidden = this.showGettingStarted() ? 1 : null;
        user.updateParam(ONBOARDING_HIDDEN, { value: hidden }).subscribe(() => (user.params = { ...user.params, [ONBOARDING_HIDDEN]: hidden }));
        this.showGettingStarted.set(!hidden);
    }

    onCreateOwnCompany() {
        this.#inputModalService.open($localize`:@@i18n.customers.company_name:company name`).confirmed(({ text }) => {
            this.#companyService.createOwnCompany(text).subscribe((company) => this._me.set(company));
        });
    }
}
