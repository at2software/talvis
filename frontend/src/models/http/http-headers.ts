import { Dictionary } from '@constants/constants';
import { HttpHeaders } from '@angular/common/http';

export const TalvisHttpInterceptor = {
    headers: {} as Dictionary<HttpHeaders>,
    add(url: string, headers: HttpHeaders) {
        TalvisHttpInterceptor.headers[url] = headers;
    },
};
