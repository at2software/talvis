import { Environment } from './environment.interface';

export const environment: Environment = {
    production: true,
    envApi: 'https://talvisapi.at2dev.de/api/',
    authenticationUrl: 'https://auth.at2.me/',
    keycloakRealm: 'at2',
    keycloakClientId: 'talvis',
    reverbKey: '',
};
