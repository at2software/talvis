import { map, Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { Dictionary } from '@constants/constants';
import { escapeHtml } from '@constants/html/escape-html';
import { Deserializer, T_METHOD } from '../http.wrapper';
import { PluginInstance } from './plugin.instance';

const PROXY_TIMEOUT_SECONDS = 30;

export type ActivityUserResolver = (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown;

interface ResolvedActivityUser extends Dictionary<unknown> {
    id?: string;
    getAvatar?: () => string;
}

export interface ActivityIssue {
    author?: { email?: string; username?: string; name?: string };
    href: string;
    label: string;
    closed: boolean;
    created_at?: string;
}

export abstract class ProxiedPluginInstance extends PluginInstance {
    override needsHttpInterceptor: boolean = false;
    override baseUrl = () => environment.envApi + 'cors';
    override get = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call<T>('get', url, params, args[0]);
    override aget = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]): Observable<T[]> =>
        this.#call<unknown>('get', url, params).pipe(map((body) => (Array.isArray(body) ? (args[0] ? body.map(args[0]) : body) : []) as T[]));
    override delete = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call<T>('delete', url, params, args[0]);
    override put = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call<T>('put', url, params, args[0]);
    override post = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call<T>('post', url, params, args[0]);
    override patch = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call<T>('patch', url, params, args[0]);

    protected abstract apiUrl(path: string): string;
    protected abstract proxyHeaders(): string[];
    protected abstract errorOf(body: unknown): string | undefined;

    protected activityEntry(issue: ActivityIssue, resolveUser?: ActivityUserResolver): Dictionary {
        const glyph = this.icon();
        const authorName = issue.author?.name || issue.author?.username || 'Unknown';
        const resolvedUser = resolveUser?.(issue.author?.email, issue.author?.username, authorName, this.getVcardAttributeName()) as ResolvedActivityUser | undefined;
        const prefix = resolvedUser ? '' : `${escapeHtml(authorName)} `;
        return {
            text: `${prefix}<n>${glyph}</n> <a href="${escapeHtml(issue.href)}" target="_blank" class="text-primary">${escapeHtml(issue.label)}</a> [${issue.closed ? 'closed' : 'open'}]`,
            created_at: issue.created_at,
            user: resolvedUser || { name: authorName },
            user_id: resolvedUser?.id,
            is_mini: true,
            icon: resolvedUser?.getAvatar?.(),
            var: { source: this.getPluginTypeName(), ...(resolvedUser ? {} : { nicon: glyph }) },
        };
    }

    #call = <T>(method: T_METHOD, path: string, params?: Dictionary, deserialize?: Deserializer<T>): Observable<T> => {
        const inQuery = method === 'get' || method === 'delete';
        return super
            .post<unknown>('', {
                url: this.apiUrl(path) + (inQuery ? this.#queryString(path, params) : ''),
                method,
                headers: this.proxyHeaders(),
                timeout: PROXY_TIMEOUT_SECONDS,
                data: inQuery ? undefined : params,
            })
            .pipe(
                map((body) => {
                    const error = this.errorOf(body);
                    if (error) throw new Error(error);
                    return (deserialize ? deserialize(body) : body) as T;
                }),
            );
    };

    #queryString = (path: string, params?: Dictionary): string => {
        const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null);
        if (!entries.length) return '';
        return (path.includes('?') ? '&' : '?') + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
    };
}

export const rawProxyError = (body: unknown): string | undefined => {
    const raw = (body as { raw_response?: string } | null)?.raw_response;
    return raw ? raw.slice(0, 200) : undefined;
};
