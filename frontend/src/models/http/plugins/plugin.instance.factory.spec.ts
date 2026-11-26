import { firstValueFrom, Observable, of } from 'rxjs';
import type { ProviderToken } from '@angular/core';
import type { Encryption } from '@models/encryption/encryption.model';
import { nx, setNxBridge, type NxBridge } from '@models/_core/nx-bridge';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import type { Serializable } from '@models/_core/serializable';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { Toast } from '@shards/toast/toast';
import { PluginInstanceFactory } from './plugin.instance.factory';
import { GitLabPlugin } from './plugin.gitlab';
import { GitHubPlugin } from './plugin.github';
import { MattermostPlugin } from './plugin.mattermost';

const GITLAB = 'https://git.at2.me/';

const gitlab = () => {
    const p = new GitLabPlugin();
    p.enc = { key: 'git', value: { url: GITLAB, token: 'secret' } } as unknown as Encryption;
    p._baseUrl = GITLAB;
    return p;
};

const parentWith = (...urls: string[]) => ({ plugin_links: urls.map((url) => PluginLink.fromJson({ type: 'git', url })) }) as unknown as Serializable & { plugin_links: PluginLink[] };

// Specs share one module graph (no isolation), so the real bridge must be back for the next spec file.
const originalBridge = nx();
afterEach(() => setNxBridge(originalBridge));

/** Routes `nx().getService()` to the given fakes. */
const bridgeServices = (services: Map<unknown, unknown>) =>
    setNxBridge({ getService: <T>(token: ProviderToken<T>) => services.get(token) as T } as unknown as NxBridge);

describe('PluginInstanceFactory link helpers', () => {
    let stored: string[];

    beforeEach(() => {
        stored = [];
        vi.spyOn(PluginLink.prototype, 'storeUnder').mockImplementation(function (this: PluginLink): Observable<PluginLink> {
            stored.push(this.url);
            return of(this);
        } as unknown as PluginLink['storeUnder']);
    });

    afterEach(() => vi.restoreAllMocks());

    it('stores one link per id', async () => {
        const result = await firstValueFrom(PluginInstanceFactory.storeLinks(gitlab(), parentWith(), ['1', '2', '3', '4']));
        expect(result.created.length).toBe(4);
        expect(result.skipped).toBe(0);
        expect(stored).toEqual(['1', '2', '3', '4'].map((_) => `${GITLAB}projects/${_}`));
    });

    it('skips links the parent already has and reports the counts', async () => {
        const success = vi.spyOn(Toast, 'success').mockImplementation(() => undefined);
        const parent = parentWith(`${GITLAB}projects/2`);
        const created = await PluginInstanceFactory.addLinks(gitlab(), parent, ['1', '2', '3', '4']);
        expect(created.map((_) => _.url)).toEqual(['1', '3', '4'].map((_) => `${GITLAB}projects/${_}`));
        expect(stored.length).toBe(3);
        expect(success).toHaveBeenCalledTimes(1);
        expect(success.mock.calls[0][0]).toContain('3');
        expect(success.mock.calls[0][0]).toContain('1');
    });

    it('stores nothing when every link exists already', async () => {
        const info = vi.spyOn(Toast, 'info').mockImplementation(() => undefined);
        const result = await firstValueFrom(PluginInstanceFactory.storeLinks(gitlab(), parentWith(`${GITLAB}projects/5`), ['5']));
        expect(result).toEqual({ created: [], skipped: 1, failed: 0 });
        PluginInstanceFactory.notifyStored(result);
        expect(info).toHaveBeenCalledTimes(1);
        expect(stored).toEqual([]);
    });
});

describe('PluginInstanceFactory.promptLinkId', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns the input of a non-GitLab plugin as a one-element list', async () => {
        bridgeServices(new Map<unknown, unknown>([[InputModalService, { open: () => Promise.resolve({ text: 'town-square' }) }]]));
        expect(await PluginInstanceFactory.promptLinkId(new MattermostPlugin())).toEqual(['town-square']);
    });

    it('returns the selection of a project modal as a one-element list', async () => {
        bridgeServices(new Map<unknown, unknown>([[ModalBaseService, { open: () => Promise.resolve('at2/talvis') }]]));
        expect(await PluginInstanceFactory.promptLinkId(new GitHubPlugin())).toEqual(['at2/talvis']);
    });

    it('yields nothing when the dialog is cancelled', async () => {
        bridgeServices(new Map<unknown, unknown>([[InputModalService, { open: () => Promise.resolve(undefined) }]]));
        expect(await PluginInstanceFactory.promptLinkId(new MattermostPlugin())).toBeUndefined();
        expect(await PluginInstanceFactory.promptLinkId(gitlab())).toBeUndefined();
    });

    it('resolves GitLab input into ids', async () => {
        bridgeServices(new Map<unknown, unknown>([[InputModalService, { open: () => Promise.resolve({ text: 'https://git.at2.me/groups/at2' }) }]]));
        const p = gitlab();
        vi.spyOn(p, 'resolveLinkInput').mockReturnValue(of(['1', '2']));
        expect(await PluginInstanceFactory.promptLinkId(p)).toEqual(['1', '2']);
    });

    it('shows an error and yields nothing when GitLab input cannot be resolved', async () => {
        bridgeServices(new Map<unknown, unknown>([[InputModalService, { open: () => Promise.resolve({ text: 'https://github.com/x/y' }) }]]));
        const error = vi.spyOn(Toast, 'error').mockImplementation(() => undefined);
        expect(await PluginInstanceFactory.promptLinkId(gitlab())).toBeUndefined();
        expect(error).toHaveBeenCalledTimes(1);
    });
});
