import { of } from 'rxjs';
import type { Dictionary } from '@constants/constants';
import type { HttpWrapper } from '@models/http/http.wrapper';
import { setNxBridge, TBroadcast, type BroadcastPayload, type NxBridge, nx } from '@models/_core/nx-bridge';
import * as Persistence from '@models/_core/persistence';
import { Serializable } from '@models/_core/serializable';

class Note extends Serializable {
    static override API_PATH(): string { return 'notes' }
    override class = 'Note';
    text: string = '';
}

interface Call { method: string; url: string; body?: Dictionary }

const broadcasts: BroadcastPayload[] = [];
const calls: Call[] = [];

const http = (response: unknown = { id: '1', text: 'from server' }): HttpWrapper => {
    const record = (method: string) => (url: string, body?: Dictionary) => {
        calls.push({ method, url, body });
        return of(response);
    };
    return { get: record('get'), post: record('post'), put: record('put'), delete: record('delete') } as unknown as HttpWrapper;
};

const note = (json: Dictionary = {}, response?: unknown): Note => {
    const model = Note.fromJson(json);
    model.httpService = response === undefined ? http() : http(response);
    return model;
};

const originalBridge = nx();

afterAll(() => setNxBridge(originalBridge));

beforeAll(() => {
    setNxBridge({
        broadcast: (payload: BroadcastPayload) => void broadcasts.push(payload),
        payloadFor: (obj: Serializable) => ({ text: (obj as Note).text }),
    } as unknown as NxBridge);
});

beforeEach(() => {
    calls.length = 0;
    broadcasts.length = 0;
});

describe('persistence', () => {
    it('posts to the collection path and hydrates the response', () => {
        const model = note({ text: 'draft' });

        Persistence.store(model).subscribe();

        expect(calls[0]).toEqual({ method: 'post', url: 'notes', body: { text: 'draft' } });
        expect(model.text).toBe('from server');
    });

    it('posts explicit changes over the model payload', () => {
        Persistence.store(note({ text: 'draft' }), { text: 'explicit' }).subscribe();
        expect(calls[0].body).toEqual({ text: 'explicit' });
    });

    it('puts only the changed fields to the member path', () => {
        const model = note({ id: '7', text: 'before' });
        model.text = 'after';

        Persistence.update(model).subscribe();

        expect(calls[0]).toEqual({ method: 'put', url: 'notes/7', body: { text: 'after' } });
    });

    it('gets the member path on refresh', () => {
        Persistence.refresh(note({ id: '7' })).subscribe();
        expect(calls[0]).toMatchObject({ method: 'get', url: 'notes/7' });
    });

    it('broadcasts a delete so open views can drop the row', () => {
        const model = note({ id: '7' });

        Persistence.remove(model).subscribe();

        expect(calls[0]).toMatchObject({ method: 'delete', url: 'notes/7' });
        expect(broadcasts).toEqual([{ type: TBroadcast.Delete, data: model }]);
    });

    it('does not broadcast when the server returns nothing', () => {
        Persistence.remove(note({ id: '7' }, null)).subscribe();
        expect(broadcasts).toEqual([]);
    });

    it('returns the same instance, not a new one', () => {
        const model = note({ id: '7' });
        let emitted: Note | undefined;

        Persistence.update(model).subscribe((_) => (emitted = _));

        expect(emitted).toBe(model);
    });
});
