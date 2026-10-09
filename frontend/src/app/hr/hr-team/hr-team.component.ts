import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { GlobalService } from '@models/global.service';
import { User } from '@models/user/user.model';
import { HrTeamService } from './hr-team.service';
import { Nx } from '@app/nx/nx.directive';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { HrSickNoteModalComponent } from './hr-sick-note-modal.component';
import { HrAddEmployeeModalComponent } from './hr-add-employee-modal.component';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { AuthenticationService } from '@models/auth.service';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { ListGroupItemContactComponent } from '@app/customers/_shards/list-group-item-contact/list-group-item-contact.component';

@Component({
    selector: 'hr-team',
    imports: [RouterModule, Nx, ScrollbarComponent, ListGroupItemContactComponent, ToolbarComponent, NgbDropdownModule],
    templateUrl: './hr-team.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrTeamComponent {
    hr = inject(HrTeamService);
    #router = inject(Router);
    #global = inject(GlobalService);
    #route = inject(ActivatedRoute);
    #modal = inject(ModalBaseService);

    enabledOnly = signal(true);
    team = signal<User[]>([]);
    id = signal('');

    readonly isTokenAuth = AuthenticationService.sysinfo?.method === 'token';

    constructor() {
        this.#global.init.pipe(takeUntilDestroyed()).subscribe(() => {
            this.team.set(this.#global.teamAll);
        });
        this.#route.params.pipe(takeUntilDestroyed()).subscribe((params) => {
            if ('id' in params) this.id.set(params.id);
        });
    }

    enabledIcon = () => (this.enabledOnly() ? 'visibility_off' : 'visibility');
    toggleEnabled = () => this.enabledOnly.set(!this.enabledOnly());
    currentRouteFor = (_: User) => this.#router.url.replace(/\/hr\/[0-9]+/i, '/hr/' + _.id);
    getUser = (id: string): User | undefined => this.#global.teamAll.find((user: User) => user.id == id);

    onAddSickNote() {
        const user = this.getUser(this.id());
        if (user) this.#modal.open(HrSickNoteModalComponent, { user });
    }

    onAddEmployee() {
        this.#modal.open(HrAddEmployeeModalComponent);
    }
}
