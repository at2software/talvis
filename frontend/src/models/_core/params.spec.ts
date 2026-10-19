import { of } from 'rxjs';
import type { Dictionary } from '@constants/constants';
import type { HttpWrapper } from '@models/http/http.wrapper';
import * as Params from '@models/_core/params';
import { Serializable } from '@models/_core/serializable';

class Note extends Serializable {
    static override API_PATH(): string { return 'notes' }
    override class = 'Note';
}

interface Call { method: string; url: string; body?: Dictionary }

const calls: Call[] = [];

const note = (json: Dictionary = {}): Note => {
    const model = Note.fromJson(json);
    const record = (method: string) => (url: string, body?: Dictionary) => {
        calls.push({ method, url, body });
        return of(undefined);
    };
    model.httpService = { get: record('get'), put: record('put'), delete: record('delete') } as unknown as HttpWrapper;
    return model;
};

beforeEach(() => void (calls.length = 0));

describe('model params', () => {
    it('builds the sub-resource path under the member path', () => {
        expect(Params.paramPath(note({ id: '7' }), 'COLOR')).toBe('notes/7/params/COLOR');
    });

    it('reads a loaded param', () => {
        expect(Params.read(note({ id: '7', params: { COLOR: 'red' } }), 'COLOR')).toBe('red');
    });

    it('falls back to the default when the key is absent', () => {
        expect(Params.read(note({ id: '7', params: {} }), 'COLOR', 'blue')).toBe('blue');
    });

    it('falls back to the default when no params were loaded at all', () => {
        expect(Params.read(note({ id: '7' }), 'COLOR', 'blue')).toBe('blue');
    });

    it('returns a stored empty value rather than the default', () => {
        expect(Params.read(note({ id: '7', params: { COLOR: '' } }), 'COLOR', 'blue')).toBe('');
    });

    it('reads, writes and removes against the param path', () => {
        const model = note({ id: '7' });

        Params.show(model, 'COLOR').subscribe();
        Params.write(model, 'COLOR', { value: 'red' }).subscribe();
        Params.remove(model, 'COLOR').subscribe();

        expect(calls).toEqual([
            { method: 'get', url: 'notes/7/params/COLOR', body: {} },
            { method: 'put', url: 'notes/7/params/COLOR', body: { value: 'red' } },
            { method: 'delete', url: 'notes/7/params/COLOR', body: undefined },
        ]);
    });

    it('remembers a written value so later reads see it without a reload', () => {
        const model = note({ id: '7', params: { COLOR: 'red', SIZE: 'l' } });

        Params.write(model, 'COLOR', { value: 'blue' }).subscribe();

        expect(Params.read(model, 'COLOR')).toBe('blue');
        expect(Params.read(model, 'SIZE')).toBe('l');
    });

    it('forgets a param that was nulled or removed', () => {
        const model = note({ id: '7', params: { COLOR: 'red', SIZE: 'l' } });

        Params.write(model, 'COLOR', { value: null }).subscribe();
        Params.remove(model, 'SIZE').subscribe();

        expect(Params.read(model, 'COLOR', 'none')).toBe('none');
        expect(Params.read(model, 'SIZE', 'none')).toBe('none');
    });
});
