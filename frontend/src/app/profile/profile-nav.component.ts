import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { HeaderComponent } from '@app/app/header/header.component';
import { HeaderLinkItemComponent } from '@app/app/header/header-link-item/header-link-item.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { DndDirective } from '@directives/dnd.directive';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { AuthenticationService } from '@models/auth.service';
import { GlobalService } from '@models/global.service';

@Component({
    selector: 'profile-nav',
    templateUrl: './profile-nav.component.html',
    imports: [RouterModule, ToolbarComponent, DndDirective, HeaderComponent, HeaderLinkItemComponent, NgbDropdownModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileNavComponent {
    #authService = inject(AuthenticationService);
    #confirmationService = inject(ConfirmationService);
    global = inject(GlobalService);

    confirmLogout = async () => {
        try {
            await this.#confirmationService.confirm({
                title: $localize`:@@i18n.common.attention:attention`,
                message: $localize`:@@i18n.profile.confirmLogout:Do you really want to log out?`,
                dialogSize: 'sm',
            });
            this.#authService.logout();
        } catch {
            // User cancelled
        }
    };

    onDndUploaded = (responses: unknown[]) => this.global.user?.applyAvatarUpload(responses);
}
