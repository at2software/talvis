import { Type, Service } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable } from 'rxjs';
import { Serializable } from '@models/_core/serializable';
import { Deserializer, HttpInjectWrapper, T_METHOD } from './http.wrapper';
import { Dictionary } from '@constants/constants';

export type ApiType<U> = Type<U> & { fromJson?: (json: unknown) => unknown };

export interface Page<T> {
    data: T[];
    current_page: number;
    last_page: number;
    next_page_url: string | null;
    per_page?: number;
    total?: number;
}

type Body = object;

type VERB_ARGS = [url: string, $2?: Dictionary | Body | Type<unknown> | null, $3?: Type<unknown>];

/* eslint-disable @typescript-eslint/no-explicit-any -- an overload implementation signature has
   to be assignable to every overload it implements, and `unknown` is not. The `any`s below are
   confined to implementation signatures; every call site resolves to a typed overload above. */

/**
 * A JSON `"id": 2243` stays a number on the model despite the declared `string`, so narrow by
 * instance rather than by `typeof === 'string'` - the latter treats a numeric id as a model
 * and reads `.id` off it, producing a literal "undefined" in the URL.
 */
export const idOf = (target: string | number | Serializable): string | number => (target instanceof Serializable ? target.id : target);

@Service()
export class TalvisHttp extends HttpInjectWrapper {
    override baseUrl = () => environment.envApi;
}

export abstract class TalvisHttpService<T extends Serializable> extends HttpInjectWrapper {
    public abstract apiPath: string;

    readonly model?: Type<T>;

    override baseUrl = () => environment.envApi;

    index = (filters?: Dictionary): Observable<T[]> => this.aget(this.apiPath, filters);
    show(id: string | number, filters?: Dictionary): Observable<T> { return this.get(`${this.apiPath}/${id}`, filters); }

    override get(url: string, query: Dictionary | null | undefined, type: ObjectConstructor): Observable<any>;
    override get<U>(url: string, query: Dictionary | null | undefined, type: ApiType<U>): Observable<U>;
    override get<U = T>(url: string, query?: Dictionary): Observable<U>;
    override get(...args: any[]): Observable<any> { return this.#request('get', args as VERB_ARGS); }

    override aget(url: string, query: Dictionary | null | undefined, type: ObjectConstructor): Observable<any[]>;
    override aget<U>(url: string, query: Dictionary | null | undefined, type: ApiType<U>): Observable<U[]>;
    override aget<U = T>(url: string, query?: Dictionary): Observable<U[]>;
    override aget(...args: any[]): Observable<any[]> { return this.#request('get', args as VERB_ARGS, true); }

    override delete(url: string, query: Dictionary | null | undefined, type: ObjectConstructor): Observable<any>;
    override delete<U>(url: string, query: Dictionary | null | undefined, type: ApiType<U>): Observable<U>;
    override delete<U = T>(url: string, query?: Dictionary): Observable<U>;
    override delete(...args: any[]): Observable<any> { return this.#request('delete', args as VERB_ARGS); }

    override put(url: string, payload: Body | null | undefined, type: ObjectConstructor): Observable<any>;
    override put<U>(url: string, payload: Body | null | undefined, type: ApiType<U>): Observable<U>;
    override put<U = T>(url: string, payload?: Body): Observable<U>;
    override put(...args: any[]): Observable<any> { return this.#request('put', args as VERB_ARGS); }

    override post(url: string, payload: Body | null | undefined, type: ObjectConstructor): Observable<any>;
    override post<U>(url: string, payload: Body | null | undefined, type: ApiType<U>): Observable<U>;
    override post<U = T>(url: string, payload?: Body): Observable<U>;
    override post(...args: any[]): Observable<any> { return this.#request('post', args as VERB_ARGS); }

    paginate<U>(url: string, query: Dictionary | null | undefined, type: ApiType<U>): Observable<Page<U>>;
    paginate<U = T>(url: string, query?: Dictionary): Observable<Page<U>>;
    paginate(...args: any[]): Observable<Page<any>> { return this.#request('get', args as VERB_ARGS); }

    #request = (method: T_METHOD, [url, $2, $3]: VERB_ARGS, collection = false): Observable<any> => {
        const type = typeof $2 === 'function' ? ($2 as Type<unknown>) : $3;
        const params = typeof $2 === 'function' ? {} : $2 ?? {};
        const bodyless = method === 'get' || method === 'delete';
        return this.request({
            method,
            url,
            query: bodyless ? params : undefined,
            body: bodyless ? undefined : params,
            deserialize: this.#deserializerFor(type),
            collection,
        });
    };

    /* eslint-enable @typescript-eslint/no-explicit-any */

    #deserializerFor = (type?: Type<unknown>): Deserializer | undefined => {
        const ctor = (type ?? this.model) as ApiType<unknown> | undefined;
        if (!ctor || typeof ctor.fromJson !== 'function') return undefined;
        return (json) => ctor.fromJson!(json);
    };
}
