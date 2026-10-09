import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Company } from '@models/company/company.model';
import { VcardRow } from '@models/vcard/vcard-row';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'company-locale-selector',
    imports: [FormsModule, NgbDropdownModule, NgbTooltipModule],
    template: `
        @if (company().card()) {
            @if (mode() === 'dropdown') {
                <div ngbDropdown class="d-inline-block">
                    <button type="button" class="btn btn-sm btn-plain text-primary dropdown-toggle-simple" ngbDropdownToggle ngbTooltip="language & formality" i18n-ngbTooltip="@@i18n.common.languageFormality">
                        <i class="me-1">translate</i>
                        <span class="small">{{ currentLocaleLabel() }}</span>
                    </button>
                    <div ngbDropdownMenu>
                        @for (option of localeOptions; track option.key) {
                            <button type="button" ngbDropdownItem [class.active]="option.key === currentLocale()" (click)="onLocaleChange(option.key)">
                                {{ option.label }}
                            </button>
                        }
                    </div>
                </div>
            } @else {
                <div ngbDropdown class="d-inline-block">
                    <div class="text-primary pointer" ngbDropdownToggle>{{ currentLocaleLabel() }}</div>
                    <div ngbDropdownMenu>
                        @for (option of localeOptions; track option.key) {
                            <button type="button" ngbDropdownItem [class.active]="option.key === currentLocale()" (click)="onLocaleChange(option.key)">
                                {{ option.label }}
                            </button>
                        }
                    </div>
                </div>
            }
        }
    `,
})
export class CompanyLocaleSelectorComponent {
    company = input.required<Company>();
    mode = input<'dropdown' | 'inline'>('dropdown');
    localeChanged = output<string>();

    localeOptions = [
        { key: 'de-formal', label: 'DE - formal' },
        { key: 'de-informal', label: 'DE - informal' },
        { key: 'en-formal', label: 'EN - formal' },
        { key: 'en-informal', label: 'EN - informal' },
    ];

    currentLocale = computed(() => this.company()?.getLocale() || 'de-formal');
    currentLocaleLabel = computed(() => this.localeOptions.find((o) => o.key === this.currentLocale())?.label || 'DE - formal');

    onLocaleChange(localeKey: string) {
        if (!this.company()?.card()) return;
        const [lang, formality] = localeKey.split('-');

        this.#setVcardValue('X-LANG', lang);
        this.#setVcardValue('X-FORMALITY', formality);

        this.company()
            .update({ vcard: this.company().card()?.toString() })
            .subscribe(() => {
                this.localeChanged.emit(localeKey);
            });
    }

    #setVcardValue(key: string, value: string) {
        const row = this.company()!.card()?.rows.find((r) => r.key === key);
        if (row) row.vals[0] = value;
        else this.company()!.card()?.rows.push(new VcardRow(key, [], [value]));
    }
}
