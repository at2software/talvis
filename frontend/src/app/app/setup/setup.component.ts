import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Dictionary } from '@constants/constants';
import { setCookie } from '@constants/cookies';
import { AuthenticationService } from '@models/auth.service';
import { GlobalService } from '@models/global.service';
import { SetupService, validationErrors } from '@models/setup/setup.service';
import { NewUserFormComponent } from '@shards/new-user-form/new-user-form.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-setup',
    templateUrl: './setup.component.html',
    styleUrls: ['./setup.component.scss'],
    imports: [NewUserFormComponent, SpinnerComponent],
})
export class SetupComponent {
    #setup = inject(SetupService);
    #global = inject(GlobalService);
    #auth = inject(AuthenticationService);
    #router = inject(Router);

    name = signal('');
    email = signal('');
    password = signal('');
    passwordRepeat = signal('');
    loading = signal(false);
    errors = signal<Dictionary<string>>({});

    readonly form = viewChild(NewUserFormComponent);
    readonly canSubmit = computed(() => !this.loading() && (this.form()?.valid() ?? false));

    submit() {
        if (!this.canSubmit()) return;
        this.loading.set(true);
        this.errors.set({});
        this.#setup.storeOwner({ name: this.name().trim(), email: this.email().trim(), password: this.password(), password_confirmation: this.passwordRepeat() }).subscribe({
            next: (owner) => this.#continueAs(owner.api_token),
            error: (err) => {
                this.loading.set(false);
                this.errors.set(validationErrors(err));
            },
        });
    }

    #continueAs(token: string) {
        if (AuthenticationService.sysinfo?.method === 'token') {
            this.#auth.apiToken = token;
            setCookie('api_token', token, 7);
            this.#global.setTokenInterceptor(token);
        }
        this.#global.invalidateInit();
        this.#global.reload();
        firstValueFrom(this.#global.init).then(() => this.#router.navigate(['/dashboard']));
    }
}
