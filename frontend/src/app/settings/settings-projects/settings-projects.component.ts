import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { TabPlaceholderInfoComponent } from '@app/settings/_shards/tab-placeholder-info/tab-placeholder-info.component';
import { PermissionsDirective } from '@directives/permissions.directive';

@Component({
    selector: 'app-settings-projects',
    templateUrl: './settings-projects.component.html',
    imports: [ScrollbarComponent, RouterModule, TabPlaceholderInfoComponent, PermissionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProjectsComponent {}
