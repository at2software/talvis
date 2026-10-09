import { HttpInterceptorFn, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { deleteCookie, getCookie } from '@constants/cookies';
import { TalvisHttpInterceptor } from '@models/http/http-headers';
import { AuthenticationService } from '@models/auth.service';
import { Toast } from '@shards/toast/toast';

export { TalvisHttpInterceptor };

const SESSION_NOTICE_INTERVAL_MS = 5000;
let lastSessionNotice = 0;

const sentCurrentToken = (req: HttpRequest<unknown>): boolean => {
    if (AuthenticationService.sysinfo?.method === 'keycloak') return true;
    const token = getCookie('api_token');
    return !!token && req.headers.get('Authorization') === `Bearer ${token}`;
};

export const talvisHttpInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    let request = req;
    for (const url of Object.keys(TalvisHttpInterceptor.headers)) {
        if (req.url.startsWith(url)) {
            const headers = TalvisHttpInterceptor.headers[url];
            request = req.clone({ headers: req.body instanceof FormData ? headers.delete('Content-Type') : headers });
            break;
        }
    }
    return next(request).pipe(
        catchError((err) => {
            if (err instanceof HttpErrorResponse && err.status === 401 && sentCurrentToken(request)) {
                if (!router.url.startsWith('/login') && Date.now() - lastSessionNotice > SESSION_NOTICE_INTERVAL_MS) {
                    lastSessionNotice = Date.now();
                    Toast.warn($localize`:@@i18n.common.sessionExpired:your session has expired or was ended on another device – please sign in again`);
                }
                localStorage.removeItem('currentUser');
                localStorage.removeItem('token');
                if (AuthenticationService.sysinfo?.method === 'keycloak' && AuthenticationService.keycloak) {
                    AuthenticationService.keycloak.login();
                } else {
                    deleteCookie('api_token');
                    router.navigate(['/login']);
                }
            }
            return throwError(() => err);
        }),
    );
};
