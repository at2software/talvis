import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GlobalService } from '@models/global.service';
import { TabPlaceholderInfoComponent } from '@app/settings/_shards/tab-placeholder-info/tab-placeholder-info.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { InputSettingsGroupComponent } from '@shards/input-group/input-settings-group.component';
import { TextParamEditorComponent } from '@shards/text-param-editor/text-param-editor.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ToolbarLocaleSelectorComponent, LocaleKey } from '@shards/toolbar-locale-selector/toolbar-locale-selector.component';

@Component({
    selector: 'app-settings-invoices',
    templateUrl: './settings-invoices.component.html',
    imports: [TabPlaceholderInfoComponent, ScrollbarComponent, InputSettingsGroupComponent, TextParamEditorComponent, ToolbarComponent, ToolbarLocaleSelectorComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsInvoicesComponent {
    tab = signal(0);
    previewLocale = signal<LocaleKey>('de-formal');

    #global = inject(GlobalService);

    readonly currency = computed(() => this.#global.currencySymbol());
    readonly hours = computed(() => this.#global.setting('INVOICE_HOUR_UNIT'));
    readonly days = computed(() => this.#global.setting('INVOICE_DAY_UNIT'));
    readonly percent = computed(() => this.#global.setting('INVOICE_PERC_UNIT'));
}
