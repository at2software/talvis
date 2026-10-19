import { type Observable, tap } from 'rxjs';
import type { Dictionary } from '@constants/constants';
import type { Serializable } from '@models/_core/serializable';

export const paramPath = (self: Serializable, key: string): string => `${self.apiPathWithId()}/params/${key}`;

const remember = (self: Serializable, key: string, value: unknown): void => {
    const { [key]: _, ...rest } = self.params ?? {};
    self.params = value === null || value === undefined ? rest : { ...rest, [key]: value };
};

export const show = (self: Serializable, key: string, data: Dictionary = {}): Observable<unknown> => self.httpService.get(paramPath(self, key), data);

export const write = (self: Serializable, key: string, changes: Dictionary): Observable<unknown> =>
    self.httpService.put(paramPath(self, key), changes).pipe(tap(() => 'value' in changes && remember(self, key, changes['value'])));

export const remove = (self: Serializable, key: string): Observable<unknown> => self.httpService.delete(paramPath(self, key)).pipe(tap(() => remember(self, key, null)));

export const read = <T = string | number>(self: Serializable, key: string, def: T | undefined = undefined): T | undefined =>
    self.params && key in self.params ? (self.params[key] as T) : def;
