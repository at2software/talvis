import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import type { Encryption } from '@models/encryption/encryption.model';
import { GitLabLinkError, GitLabPlugin } from './plugin.gitlab';

const GITLAB = 'https://git.at2.me/';

type Route = (url: string, page?: number) => unknown;

/** A HttpClient stand-in: `get` answers from `route`; an `HttpErrorResponse` result is thrown. */
const mockHttp = (route: Route) => {
    const calls: { url: string; params?: Record<string, unknown> }[] = [];
    const get = vi.fn((url: string, options?: { params?: Record<string, unknown> }): Observable<unknown> => {
        calls.push({ url, params: options?.params });
        const result = route(url, options?.params?.['page'] as number | undefined);
        return result instanceof HttpErrorResponse ? throwError(() => result) : of(result);
    });
    return { http: { get } as unknown as HttpClient, calls, get };
};

const notFound = (url: string) => new HttpErrorResponse({ status: 404, statusText: 'Not Found', url });

const plugin = (route: Route) => {
    const mock = mockHttp(route);
    const p = new GitLabPlugin();
    p._http = mock.http;
    p.enc = { key: 'git', value: { url: GITLAB, token: 'secret' } } as unknown as Encryption;
    p._baseUrl = GITLAB;
    return { p, ...mock };
};

const projects = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: from + i }));

const reasonOf = async (p: Observable<string[]>) => {
    try {
        await firstValueFrom(p);
    } catch (err) {
        return err instanceof GitLabLinkError ? err.reason : err;
    }
    return 'resolved';
};

describe('GitLabPlugin.resolveLinkInput', () => {
    it('passes a plain id through without asking GitLab', async () => {
        const { p, get } = plugin(() => ({}));
        expect(await firstValueFrom(p.resolveLinkInput(' 4711 '))).toEqual(['4711']);
        expect(get).not.toHaveBeenCalled();
    });

    it.each([
        'https://git.at2.me/at2/talvis/frontend',
        'https://git.at2.me/at2/talvis/frontend.git',
        'https://git.at2.me/at2/talvis/frontend/',
        'https://git.at2.me/at2/talvis/frontend/-/issues',
        'https://git.at2.me/at2/talvis/frontend/-/merge_requests/12?tab=diffs',
    ])('resolves the project URL %s into its id', async (input) => {
        const { p, calls } = plugin((url) => (url === `${GITLAB}api/v4/projects/at2%2Ftalvis%2Ffrontend` ? { id: 17 } : notFound(url)));
        expect(await firstValueFrom(p.resolveLinkInput(input))).toEqual(['17']);
        expect(calls.map((_) => _.url)).toEqual([`${GITLAB}api/v4/projects/at2%2Ftalvis%2Ffrontend`]);
    });

    it('resolves a /groups/ URL into all its projects across pages', async () => {
        const groupUrl = `${GITLAB}api/v4/groups/at2%2Fportal%2Fat2%2Fportal/projects`;
        const { p, calls } = plugin((url, page) => (url === groupUrl ? (page === 1 ? projects(1, 100) : projects(101, 3)) : notFound(url)));
        const ids = await firstValueFrom(p.resolveLinkInput('https://git.at2.me/groups/at2/portal/at2/portal'));
        expect(ids.length).toBe(103);
        expect(ids[0]).toBe('1');
        expect(ids[102]).toBe('103');
        expect(calls.map((_) => _.params?.['page'])).toEqual([1, 2]);
        expect(calls[0].params).toMatchObject({ include_subgroups: 'true', archived: 'false', per_page: 100 });
        expect(calls.every((_) => _.url === groupUrl)).toBe(true);
    });

    it('falls back to the group when the path is no project', async () => {
        const groupUrl = `${GITLAB}api/v4/groups/at2%2Fportal/projects`;
        const { p, calls } = plugin((url) => (url === groupUrl ? projects(1, 4) : notFound(url)));
        expect(await firstValueFrom(p.resolveLinkInput('https://git.at2.me/at2/portal/'))).toEqual(['1', '2', '3', '4']);
        expect(calls.map((_) => _.url)).toEqual([`${GITLAB}api/v4/projects/at2%2Fportal`, groupUrl]);
    });

    it('fails for an empty group', async () => {
        const { p } = plugin((url) => (url.includes('/groups/') ? [] : notFound(url)));
        expect(await reasonOf(p.resolveLinkInput('https://git.at2.me/groups/at2/empty'))).toBe('empty-group');
    });

    it('fails for a URL of another host without asking GitLab', async () => {
        const { p, get } = plugin(() => ({ id: 1 }));
        expect(await reasonOf(p.resolveLinkInput('https://github.com/at2/talvis'))).toBe('foreign-host');
        expect(await reasonOf(p.resolveLinkInput('https://git.at2.me.evil.com/at2/talvis'))).toBe('foreign-host');
        expect(get).not.toHaveBeenCalled();
    });

    it('fails for a path that is neither project nor group', async () => {
        const { p, calls } = plugin((url) => notFound(url));
        expect(await reasonOf(p.resolveLinkInput('https://git.at2.me/nobody/nothing'))).toBe('not-found');
        expect(calls.length).toBe(2);
    });
});
