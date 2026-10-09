import { catchError, EMPTY, expand, map, Observable, of, reduce, switchMap, throwError } from 'rxjs';
import { Dictionary } from '@constants/constants';
import { environment } from '@environments/environment';
import { markdown2html, shortcodeToEmoji } from '@constants/mattermost.constants';
import { slack2markdown } from '@constants/slack.constants';
import { nx } from '@models/_core/nx-bridge';
import { User } from '@models/user/user.model';
import { Project } from '@models/project/project.model';
import { Assignee } from '@models/assignee/assignee.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { Deserializer } from '../http.wrapper';
import { ChatPluginInstance } from './chat.plugin.instance';

interface SlackResponse extends Dictionary { ok?: boolean; error?: string; response_metadata?: { next_cursor?: string }; }
interface SlackChannel extends Dictionary { id: string; name?: string; }
interface SlackMember extends Dictionary { id: string; name?: string; real_name?: string; deleted?: boolean; is_bot?: boolean; profile?: { display_name?: string; real_name?: string; email?: string; image_72?: string }; }
interface SlackPost extends Dictionary { ts?: string; user?: string; text?: string; subtype?: string; bot_id?: string; reactions?: { name: string; count: number }[]; files?: { id: string; name?: string; title?: string; mimetype?: string; size?: number }[]; }

const SLACK_API = 'https://slack.com/api/';
const PAGE_SIZE = 200;

export class SlackPlugin extends ChatPluginInstance {
    needsHttpInterceptor: boolean = false;
    baseUrl = () => environment.envApi + 'cors';
    get = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call(url, 'get', params, args[0]);
    post = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => this.#call(url, 'post', params, args[0]);
    protected toUser = (_: Dictionary): User => {
        const member = _ as SlackMember;
        const user = User.fromJson({ id: member.id, name: member.profile?.real_name || member.real_name || member.profile?.display_name || member.name || 'Unknown' });
        user.var.data = { ...member, user_id: member.id, username: member.name, email: member.profile?.email };
        user.var.username = member.name;
        user.var.email = member.profile?.email;
        user.var.icon = member.profile?.image_72;
        return user;
    };

    posts: SlackPost[] = [];
    channelName: string = 'slack';
    channelMembers: string[] = [];
    teamId: string = '';
    myUserId: string = '';

    icon = () => 'slack';
    link = () => (this.enc ? this._baseUrl : '');
    getRootInstance = (): SlackPlugin => (this.baseInstance as SlackPlugin) ?? this;

    getVcardAttributeName = () => 'X-NEXUS-SLACK';
    isUserInInstance = (userId: string): boolean => (this.baseInstance ? this.channelMembers.includes(userId) : userId in this.users);
    getProfileUrl = (userId: string): string => this.#workspaceUrl() + 'team/' + userId;
    getUserSelectionModalPath = () => '../../app/_modals/slack-user-selection/slack-user-selection.component';
    getInterfacePropertyName = () => 'IChatPluginProperty';
    getPluginTypeName = () => 'slack';

    toPluginLink = (id: string) => PluginLink.fromJson({ type: 'slack', url: this.#workspaceUrl() + 'archives/' + id });

    index = () => this.get('conversations.history', { channel: this.channelId, limit: 100 }, this.#toPosts);
    indexMembers = () =>
        this.#paginate<string>('conversations.members', { channel: this.channelId }, (r) => (r['members'] as string[]) ?? []).pipe(
            map((ids) => (this.channelMembers = ids)),
            catchError(() => of([])),
        );
    showImage = (userId: string) => of(this.getUser(userId)?.var.icon as string | undefined);
    showChannel = () => this.get('conversations.info', { channel: this.channelId }, (r) => (r as SlackResponse)['channel']);
    setChannelName = (data: unknown) => (this.channelName = (data as SlackChannel | undefined)?.name ?? '');
    send = (message: string) => this.post('chat.postMessage', { channel: this.channelId, text: message });

    createBlankFor = (project: Project) =>
        new Promise<string>((resolve, reject) => {
            const channelName = 'nexus_project_' + project.id;
            this.post('conversations.create', { name: channelName }, (r) => (r as SlackResponse)['channel'] as SlackChannel)
                .pipe(
                    catchError((e: Error) => (e.message === 'name_taken' ? this.#findChannel(channelName) : throwError(() => e))),
                    switchMap((channel) => this.#inviteAssignees(project.assignees, channel.id).pipe(map(() => channel.id))),
                )
                .subscribe({ next: resolve, error: reject });
        });

    getActivityComments(_projectId: string = '', _maxInitialItems: number = 150, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]> {
        return (this.index() as Observable<SlackPost[]>).pipe(
            map((posts) =>
                (posts ?? [])
                    .filter((post) => !post.bot_id && post.subtype !== 'bot_message')
                    .map((post) => {
                        const member = this.getUser(post.user ?? '');
                        const authorName = member?.getName() || post.user || 'Unknown';
                        const isSystemMessage = !!post.subtype && /^(channel|group)_/.test(post.subtype);

                        const reactions = (post.reactions ?? []).map((r) => {
                            const name = r.name.split('::')[0];
                            return { emoji: shortcodeToEmoji(name) || `:${name}:`, count: r.count };
                        });

                        const attachments = (post.files ?? []).map((f) => ({
                            id: f.id,
                            name: f.name || f.title || f.id,
                            mimeType: f.mimetype || '',
                            isImage: false,
                            size: f.size || 0,
                        }));

                        const messageHtml = markdown2html(slack2markdown(post.text || '', (id) => this.getUser(id)?.getName()));

                        const resolvedUser = resolveUser?.(member?.var.email, post.user, authorName, 'X-NEXUS-SLACK') as (Dictionary<unknown> & { id?: string; getAvatar?: () => string; iconBaseUrl?: string }) | undefined;

                        const commentData: Dictionary = {
                            text: messageHtml,
                            created_at: new Date(parseFloat(post.ts ?? '0') * 1000),
                            user: resolvedUser || { name: authorName },
                            user_id: resolvedUser?.id,
                            is_mini: isSystemMessage,
                            reactions: reactions.length ? reactions : undefined,
                            attachments: attachments.length ? attachments : undefined,
                            var: { source: 'slack', ...(resolvedUser ? {} : { nicon: 'slack' }) },
                        };

                        if (resolvedUser) {
                            if (resolvedUser.getAvatar) commentData['icon'] = resolvedUser.getAvatar();
                            if (resolvedUser.iconBaseUrl !== undefined) commentData['iconBaseUrl'] = resolvedUser.iconBaseUrl;
                        }
                        return commentData;
                    }),
            ),
        );
    }

    protected connect = () =>
        new Promise<void>((resolve, reject) => {
            this.get('auth.test')
                .pipe(
                    switchMap((response) => {
                        const auth = response as SlackResponse;
                        this.teamId = (auth['team_id'] as string) ?? '';
                        this.myUserId = (auth['user_id'] as string) ?? '';
                        return this.#paginate<SlackMember>('users.list', {}, (r) => (r['members'] as SlackMember[]) ?? []);
                    }),
                )
                .subscribe({
                    next: (members) => {
                        members.filter((m) => !m.deleted && !m.is_bot && m.id !== 'USLACKBOT').forEach((m) => this.addMember({ ...m, user_id: m.id }));
                        resolve();
                    },
                    error: reject,
                });
        });

    #workspaceUrl = () => this.enc.value.url.replace(/\/?$/, '/');

    #call = <T>(method: string, httpMethod: 'get' | 'post', params: Dictionary = {}, deserialize?: Deserializer<T>): Observable<T> =>
        super
            .post<SlackResponse>('', {
                url: SLACK_API + method,
                method: httpMethod,
                headers: ['Authorization: Bearer ' + this.enc.value.token, 'Content-Type: application/json; charset=utf-8'],
                data: params,
            })
            .pipe(
                map((response) => {
                    if (response?.ok !== true) throw new Error(response?.error ?? 'unknown_error');
                    return (deserialize ? deserialize(response) : response) as T;
                }),
            );

    #paginate = <T>(method: string, params: Dictionary, pick: (response: SlackResponse) => T[]): Observable<T[]> => {
        const page = (cursor?: string) => this.#call<SlackResponse>(method, 'get', { ...params, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
        return page().pipe(
            expand((response) => (response.response_metadata?.next_cursor ? page(response.response_metadata.next_cursor) : EMPTY)),
            reduce((all, response) => all.concat(pick(response)), [] as T[]),
        );
    };

    #findChannel = (name: string): Observable<SlackChannel> =>
        this.#paginate<SlackChannel>('conversations.list', { types: 'public_channel,private_channel', exclude_archived: true }, (r) => (r['channels'] as SlackChannel[]) ?? []).pipe(
            map((channels) => {
                const channel = channels.find((c) => c.name === name);
                if (!channel) throw new Error('channel_not_found');
                return channel;
            }),
        );

    #inviteAssignees = (assignees: Assignee[], channelId: string): Observable<unknown> => {
        const slackIds = assignees
            .filter((assignee) => assignee.assignee.isClass('User'))
            .flatMap((assignee) => nx().global.userFor((assignee.assignee as User).id)?.encryptions ?? [])
            .filter((enc) => enc.key === 'slack' && enc.my_id?.length && enc.my_id !== this.getRootInstance().myUserId)
            .map((enc) => enc.my_id!);
        if (!slackIds.length) return of(null);
        return this.post('conversations.invite', { channel: channelId, users: [...new Set(slackIds)].join(','), force: true }).pipe(catchError(() => of(null)));
    };

    #toPosts = (data: unknown): SlackPost[] => (((data as SlackResponse)['messages'] as SlackPost[]) ?? []).sort((a, b) => parseFloat(b.ts ?? '0') - parseFloat(a.ts ?? '0'));
}
