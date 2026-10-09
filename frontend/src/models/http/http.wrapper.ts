import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { NotificationCenter } from '../notification.service';
import { Dictionary } from '@constants/constants';
import { notifyHttpError, saveBlobResponse } from './file-download';

export type T_METHOD = 'get' | 'delete' | 'put' | 'post' | 'patch';

export type Deserializer<T = unknown> = (json: unknown) => T;

export interface RequestSpec {
    method: T_METHOD;
    url: string;
    query?: unknown;
    body?: unknown;
    deserialize?: Deserializer;
    collection?: boolean;
}

const MUTATING: ReadonlySet<T_METHOD> = new Set<T_METHOD>(['put', 'post', 'patch', 'delete']);
const LAST_MODIFIED_LIMIT = 200;

class LruMap<K, V> extends Map<K, V> {
    constructor(private readonly limit: number) {
        super();
    }
    override get(key: K): V | undefined {
        const v = super.get(key);
        if (v !== undefined) {
            super.delete(key);
            super.set(key, v);
        }
        return v;
    }
    override set(key: K, value: V): this {
        if (super.has(key)) super.delete(key);
        super.set(key, value);
        if (this.size > this.limit) {
            const oldest = this.keys().next().value as K | undefined;
            if (oldest !== undefined) super.delete(oldest);
        }
        return this;
    }
}

export abstract class HttpWrapper {
    _baseUrl: string = '';
    _http!: HttpClient;

    static readonly #lastModified = new LruMap<string, string>(LAST_MODIFIED_LIMIT);

    baseUrl = (): string => this._baseUrl;
    http = (): HttpClient => this._http;

    get<T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T> { return this.request({ method: 'get', url, query: params, deserialize: mapperOf(args) }); }
    aget<T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T[]> { return this.request({ method: 'get', url, query: params, deserialize: mapperOf(args), collection: true }); }
    delete<T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T> { return this.request({ method: 'delete', url, query: params, deserialize: mapperOf(args) }); }
    put<T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T> { return this.request({ method: 'put', url, body: params, deserialize: mapperOf(args) }); }
    post<T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T> { return this.request({ method: 'post', url, body: params, deserialize: mapperOf(args) }); }
    patch<T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T> { return this.request({ method: 'patch', url, body: params, deserialize: mapperOf(args) }); }
    upload<T=unknown>(url: string, data: FormData): Observable<T> { return this.request({ method: 'post', url, body: data }); }

    next = <T>(url: string): Observable<T> => this.request<T>({ method: 'get', url });

    protected request = <T = unknown>(spec: RequestSpec): Observable<T> => {
        const finalUrl = this.#getApiUrl(spec.url, spec.query);

        const lastModified = HttpWrapper.#lastModified.get(finalUrl);
        const headers = lastModified ? new HttpHeaders({ 'If-Modified-Since': lastModified }) : new HttpHeaders();

        const options: { observe: 'response'; headers: HttpHeaders; body?: unknown } = { observe: 'response', headers };
        if (spec.body !== undefined) options.body = spec.body;

        return this.http()
            .request(spec.method, finalUrl, options)
            .pipe(
                tap((response) => this.#rememberLastModified(response, finalUrl)),
                tap(() => this.#notifyMutation(spec.method, spec.url)),
                map((response) => {
                    const body = deserializeBody(response.body, spec.deserialize);
                    return (spec.collection ? unwrapCollection(body) : body) as T;
                }),
                catchError((err) => {
                    notifyHttpError(err);
                    return throwError(() => err);
                }),
            );
    };

    #getApiUrl = (url: string, params?: unknown): string => {
        let myUrl: string = /^https?:/i.test(url) ? url : this.baseUrl() + url;
        const processed = this.#toQueryParams(params);
        if (Object.keys(processed).length) {
            myUrl += '?' + new URLSearchParams(processed).toString();
        }
        return myUrl;
    };

    #toQueryParams = (params: unknown): Dictionary<string> => {
        if (!params || typeof params !== 'object' || params instanceof FormData) return {};
        const processed: Dictionary<string> = {};
        for (const [key, value] of Object.entries(params as Dictionary)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                console.warn('[HTTP] query param', key, 'is an object and serializes as "[object Object]"', value);
            }
            processed[key] = Array.isArray(value) ? value.join(',') : String(value);
        }
        return processed;
    };

    #rememberLastModified(response: HttpResponse<unknown>, url: string): void {
        const lastModified = response?.headers?.get('Last-Modified');
        if (lastModified) HttpWrapper.#lastModified.set(url, lastModified);
    }

    #notifyMutation(method: T_METHOD, url: string): void {
        if (MUTATING.has(method)) NotificationCenter.subj.next({ key: method, value: url });
    }

    getBlob = (url: string, params?: Dictionary) => this.http().get(this.#getApiUrl(url, params), { responseType: 'blob' });
    postBlobResponse = (url: string, data?: unknown) => this.http().post(this.#getApiUrl(url), data, { responseType: 'blob', observe: 'response' });
    postBlob(url: string, data?: unknown, success?: () => void) {
        return this.postBlobResponse(url, data).subscribe((r) => saveBlobResponse(r, success));
    }
    getFile(url: string, params?: Dictionary, success?: () => unknown, done?: () => unknown): void {
        this.http()
            .get(this.#getApiUrl(url, params), { responseType: 'blob', observe: 'response' })
            .pipe(finalize(() => done?.()))
            .subscribe({
            next: (r) => saveBlobResponse(r, success),
            error: notifyHttpError,
        });
    }
    postFile(url: string, params?: Dictionary, success?: () => unknown): void {
        this.postBlobResponse(url, params).subscribe({
            next: (r) => saveBlobResponse(r, success),
            error: notifyHttpError,
        });
    }
}

const mapperOf = (args: Deserializer[]): Deserializer | undefined =>
    args.length && typeof args[0] === 'function' && !args[0].prototype ? (item: unknown) => args[0](item) : undefined;

const unwrapCollection = (body: unknown): unknown => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
    const data = (body as Dictionary<unknown>)['data'];
    return Array.isArray(data) ? data : body;
};

const deserializeBody = (result: unknown, deserialize?: Deserializer): unknown => {
    if (!result || !deserialize) return result;
    if (Array.isArray(result)) return result.map(deserialize);
    if (typeof result === 'object') {
        const record = result as Dictionary<unknown>;
        if (Array.isArray(record['data'])) {
            record['data'] = record['data'].map(deserialize);
            return record;
        }
        return deserialize(result);
    }
    return result;
};

export abstract class HttpInjectWrapper extends HttpWrapper {
    #http = inject(HttpClient);
    override http = (): HttpClient => this.#http;
}
