import { computed, ResourceRef, ResourceStatus } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

const LOADED_STATUSES: ResourceStatus[] = ['resolved', 'reloading', 'local'];

export function modelResource<T>(stream: () => Observable<T>): ResourceRef<T | undefined>;
export function modelResource<T, P>(params: () => P, stream: (params: NoInfer<Exclude<P, undefined>>) => Observable<T>): ResourceRef<T | undefined>;
export function modelResource<T, P>(first: () => P | Observable<T>, second?: (params: Exclude<P, undefined>) => Observable<T>): ResourceRef<T | undefined> {
    if (!second) return rxResource<T, void>({ stream: () => (first as () => Observable<T>)() });
    return rxResource<T, P>({ params: first as () => P, stream: ({ params }) => second(params) });
}

export function modelListResource<T>(stream: () => Observable<T[]>): ResourceRef<T[]>;
export function modelListResource<T, P>(params: () => P, stream: (params: NoInfer<Exclude<P, undefined>>) => Observable<T[]>): ResourceRef<T[]>;
export function modelListResource<T, P>(first: () => P | Observable<T[]>, second?: (params: Exclude<P, undefined>) => Observable<T[]>): ResourceRef<T[]> {
    const ref = second
        ? rxResource<T[], P>({ params: first as () => P, stream: ({ params }) => second(params), defaultValue: [] })
        : rxResource<T[], void>({ stream: () => (first as () => Observable<T[]>)(), defaultValue: [] });
    return withLoadedHasValue(ref);
}

function withLoadedHasValue<T>(ref: ResourceRef<T[]>): ResourceRef<T[]> {
    const loaded = computed(() => LOADED_STATUSES.includes(ref.status()));
    ref.hasValue = (() => loaded()) as ResourceRef<T[]>['hasValue'];
    return ref;
}
