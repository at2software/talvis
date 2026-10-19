import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HrTeamService } from './hr-team/hr-team.service';
import { HeaderComponent } from '@app/app/header/header.component';
import { HeaderLinkItemComponent } from '@app/app/header/header-link-item/header-link-item.component';
import { PermissionsDirective } from '@directives/permissions.directive';

@Component({
    selector: 'hr-nav',
    templateUrl: './hr-nav.component.html',
    imports: [HeaderComponent, HeaderLinkItemComponent, RouterModule, PermissionsDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrNavComponent {
    srv = inject(HrTeamService);
}
