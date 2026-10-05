import { AutoRefreshTokenService, createInterceptorCondition, INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG, IncludeBearerTokenCondition, KeycloakService, provideKeycloak, UserActivityService, withAutoRefreshToken } from 'keycloak-angular';
import { environment } from '@environments/environment';

function createSafeUrlPattern(url: string): RegExp {
    if (!url || typeof url !== 'string' || url.length > 500) {
        return /(?!)/; // negative lookahead — never matches any string
    }

    if (!url.startsWith('/') && !/^https?:\/\/.+/.test(url)) {
        return /(?!)/; // neither relative nor absolute URL - never match
    }

    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = `^${escapedUrl}.*`;

    // nosemgrep: eslint.detect-non-literal-regexp
    return new RegExp(pattern);
}

export class KeycloakHandler {
    static async loadKeycloakConfig() {
        if (!environment.authenticationUrl || !environment.keycloakRealm || !environment.keycloakClientId) {
            try {
                const response = await fetch('/assets/keycloak.json');
                const config = await response.json();
                return {
                    url: config['auth-server-url'] || environment.authenticationUrl,
                    realm: config.realm || environment.keycloakRealm || 'at2',
                    clientId: config.resource || environment.keycloakClientId || 'talvis',
                };
            } catch (error) {
                console.error('Failed to load keycloak.json, using environment defaults:', error);
                return {
                    url: environment.authenticationUrl,
                    realm: environment.keycloakRealm || 'at2',
                    clientId: environment.keycloakClientId || 'talvis',
                };
            }
        }
        return {
            url: environment.authenticationUrl,
            realm: environment.keycloakRealm || 'at2',
            clientId: environment.keycloakClientId || 'talvis',
        };
    }

    static provideKeycloak() {
        const apiUrl = environment.envApi.startsWith('/') ? window.location.origin + environment.envApi : environment.envApi;

        const apiUrlRelative = environment.envApi;

        const keycloakUrl = environment.authenticationUrl;

        const apiConditionAbsolute = createInterceptorCondition<IncludeBearerTokenCondition>({
            urlPattern: createSafeUrlPattern(apiUrl),
        });

        const apiConditionRelative = createInterceptorCondition<IncludeBearerTokenCondition>({
            urlPattern: createSafeUrlPattern(apiUrlRelative),
        });

        const keycloakCondition = createInterceptorCondition<IncludeBearerTokenCondition>({
            urlPattern: createSafeUrlPattern(keycloakUrl),
        });
        return [
            KeycloakService,
            provideKeycloak({
                config: {
                    url: keycloakUrl,
                    realm: environment.keycloakRealm || 'at2',
                    clientId: environment.keycloakClientId || 'talvis',
                },
                providers: [AutoRefreshTokenService, UserActivityService],
                initOptions: {
                    checkLoginIframe: false,
                    onLoad: 'check-sso',
                    silentCheckSsoRedirectUri: window.location.origin + '/assets/silent-check-sso.html',
                },
                features: [
                    withAutoRefreshToken({
                        sessionTimeout: 1800000,
                        onInactivityTimeout: 'login',
                    }),
                ],
            }),
            { provide: INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG, useValue: [apiConditionAbsolute, apiConditionRelative, keycloakCondition] as IncludeBearerTokenCondition[] },
        ];
    }
}
