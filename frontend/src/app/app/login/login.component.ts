import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '@models/user/user.service';
import { AuthenticationService } from '@models/auth.service';
import { deleteCookie, setCookie } from '@constants/cookies';
import { GlobalService } from '@models/global.service';
import { TalvisHttpInterceptor } from '@app/http.interceptor';
import { environment } from '@environments/environment';
import { FormsModule } from '@angular/forms';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [FormsModule],
})
export class LoginComponent {
    email: string = '';
    password: string = '';

    #userService = inject(UserService);
    #router = inject(Router);
    #authService = inject(AuthenticationService);
    #global = inject(GlobalService);

    isLoading = signal(false);
    failed = signal(false);

    constructor() {
        deleteCookie('api_token');
        delete TalvisHttpInterceptor.headers[environment.envApi];
        this.#global.invalidateInit();
    }

    canLogin = () => !this.isLoading() && this.email.length > 0 && this.password.length > 0;

    removeCircularReferences() {
        const seen = new WeakSet();
        return (_key: string, value: object | null) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return;
                }
                seen.add(value);
            }
            return value;
        };
    }

    login() {
        if (this.canLogin()) {
            deleteCookie('api_token');
            delete TalvisHttpInterceptor.headers[environment.envApi];
            this.#authService._isLoggedIn = false;
            this.#authService.apiToken = undefined;
            if (AuthenticationService.sysinfo!.method === 'token') {
                this.isLoading.set(true);
                this.failed.set(false);
                this.#userService.login(this.email, this.password).subscribe({
                    next: (response) => {
                        this.isLoading.set(false);
                        const data = 'user' in response ? response.user : undefined;
                        if (!data?.id) {
                            this.failed.set(true);
                            return;
                        }
                        this.#authService._isLoggedIn = true;
                        if (data.api_token && data.api_token.length) {
                            this.#authService.apiToken = data.api_token;
                            setCookie('api_token', data.api_token, 7);
                            this.#global.setTokenInterceptor(data.api_token);
                            this.#global.reload();
                        }
                        this.#router.navigate(['/dashboard']);
                    },
                    error: () => {
                        this.isLoading.set(false);
                        this.failed.set(true);
                    },
                });
            } else if (AuthenticationService.sysinfo!.method === 'keycloak') {
                AuthenticationService.keycloak?.login();
            }
        }
    }
}
