import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GlobalService } from '@models/global.service';
import { InputSwitchGroupComponent } from '@shards/input-group/input-switch.component';
import { InputSettingsGroupComponent } from '@shards/input-group/input-settings-group.component';
import { ThemeService, type ThemeMode } from '@services/theme.service';

@Component({
    selector: 'profile-settings',
    templateUrl: './profile-settings.component.html',
    imports: [InputSwitchGroupComponent, InputSettingsGroupComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent {
    global = inject(GlobalService);
    protected readonly theme = inject(ThemeService);
    protected readonly themeModes: { mode: ThemeMode; label: string }[] = [
        { mode: 'auto', label: $localize`:@@i18n.settings.themeAuto:automatic` },
        { mode: 'light', label: $localize`:@@i18n.settings.themeLight:light` },
        { mode: 'dark', label: $localize`:@@i18n.settings.themeDark:dark` },
    ];
    tab = signal(0);
    show = (n: number) => this.tab.set(n);
}
