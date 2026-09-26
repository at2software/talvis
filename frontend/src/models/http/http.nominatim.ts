import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { HttpInjectWrapper } from './http.wrapper';
import { TalvisHttpInterceptor } from '@models/http/http-headers';
import { HttpHeaders } from '@angular/common/http';
import { VcardRow } from '@models/vcard/vcard-row';

@Service()
export class NominatimHttpWrapper extends HttpInjectWrapper {
    override baseUrl = () => 'https://nominatim.openstreetmap.org/';

    init = () =>
        new Promise<boolean>((resolve) => {
            TalvisHttpInterceptor.add(this.baseUrl(), new HttpHeaders({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true' }));
            resolve(true);
        });
    search = (params: Dictionary) => this.get('search', params);
    lookup = (address: VcardRow) => this.search({ q: address.vals.join(','), format: 'json' });
}
