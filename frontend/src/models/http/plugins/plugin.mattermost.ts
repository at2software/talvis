import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { Dictionary } from '@constants/constants';
import { User } from '@models/user/user.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { ChatPluginInstance } from './chat.plugin.instance';
import { nx } from '@models/_core/nx-bridge';
import { Project } from '@models/project/project.model';
import { Assignee } from '@models/assignee/assignee.model';
import { markdown2html, shortcodeToEmoji } from '@constants/mattermost.constants';

interface MattermostPost extends Dictionary { id?: string; user_id?: string; username?: string; create_at?: number; message?: string; type?: string; props?: Dictionary; metadata?: { reactions?: { emoji_name: string }[]; files?: { id: string; name: string; mime_type?: string; size?: number }[] }; }
interface MattermostMember extends Dictionary { user_id: string; username?: string; nickname?: string; first_name?: string; last_name?: string; email?: string; }

export class MattermostPlugin extends ChatPluginInstance {
    posts: MattermostPost[] = [];
    channelName: string = 'mattermost';
    teamId: string = '';

    icon = () => 'mattermost';
    link = () => {
        if (!this.enc) return '';
        return this._baseUrl.substring(0, this.enc.value.url.length) + this.enc.value.team + '/' + this._baseUrl.substring(this.enc.value.url.length + this.enc.value.team.length + 1);
    };
    getRootInstance = (): MattermostPlugin => (this.baseInstance as MattermostPlugin) ?? this;

    getVcardAttributeName = () => 'X-NEXUS-MATTERMOST';
    isUserInInstance = (userId: string): boolean => userId in this.getRootInstance().users;
    getProfileUrl = (): string => {
        const mattermostUrl = this.enc.value.url.replace(/\/$/, '');
        const teamName = this.enc.value.team;
        return `${mattermostUrl}/${teamName}`;
    };
    getUserSelectionModalPath = () => '../../app/_modals/mattermost-user-selection/mattermost-user-selection.component';
    getInterfacePropertyName = () => 'IChatPluginProperty';
    getPluginTypeName = () => 'mattermost';

    baseUrl = (): string => this._baseUrl.substring(0, this.enc.value.url.length) + 'api/v4/' + this._baseUrl.substring(this.enc.value.url.length + this.enc.value.team.length + 1);

    toPluginLink = (id: string) => PluginLink.fromJson({ type: 'mattermost', url: this.enc.value.url + this.enc.value.team + '/channels/' + id });

    addAssigneesToChannel = (assignees: Assignee[], channelId: string) => {
        this.addUsersToChannel(
            assignees.filter((assignee) => assignee.assignee.isClass('User')).map((_) => _.assignee as User),
            channelId,
        );
    };
    addUsersToChannel = (users: User[], channelId: string) => users.forEach((user) => this.addUserToChannel(user, channelId));
    addUserToChannel(user: User, channelId: string) {
        const globUser = nx().global.userFor(user.id);
        globUser?.encryptions.filter((_) => _.key === 'mattermost' && _.my_id?.length).forEach((_) => this.addUserIdToChannel(_.my_id!, channelId).subscribe());
    }
    addUserIdToChannel = (userId: string, channelId: string) => this.post(`channels/${channelId}/members`, { user_id: userId });
    getChannelId = (name: string) => this.get(`teams/${this.teamId}/channels/name/${name}`);
    getTeamId = () => this.get('teams/name/' + this.enc.value.team);
    index = () => this.get(`/posts?per_page=60`, {}, this.#toPost);
    indexMembers = () => this.get(`/members?per_page=999`, {}, (_: unknown) => this.getRootInstance().addMember(_ as MattermostMember));
    indexTeamUsers = () => {
        if (this.baseInstance) {
            console.warn('indexTeamUsers should only be called on root instance');
            return of([]);
        }
        return this.get(`teams/${this.teamId}/members?per_page=200`).pipe(
            switchMap((members) => {
                const list = members as MattermostMember[];
                if (!list || list.length === 0) return of([]);

                const userIds = list.map((m) => m.user_id);
                return this.post(`users/ids`, userIds as unknown as Dictionary).pipe(catchError(() => of([])));
            }),
            map((users) => {
                const list = users as (MattermostMember & { id?: string })[];
                list.filter((u) => u).forEach((u) => this.addMember({ ...u, user_id: u.id ?? u.user_id ?? '' }));
                return list.filter((u) => u);
            }),
        );
    };
    showImage = (userId: string) => this.getRootInstance().getBlob(`users/${userId}/image`);
    setChannelName = (data: unknown) => (this.channelName = (data as { display_name?: string })?.display_name ?? '');
    showChannel = () => this.get('');
    send = (message: string) => this.getRootInstance().post(`posts`, { channel_id: this.channelId, message: message });

    createBlankFor = (project: Project) =>
        new Promise<string>((resolve) => {
            const channelName = 'nexus_project_' + project.id;
            this.getChannelId(channelName)
                .pipe(
                    catchError(() => {
                        this.post('channels', {
                            team_id: this.teamId,
                            name: channelName,
                            display_name: project.name,
                            type: 'O',
                        }).subscribe((response) => {
                            const channelId = (response as { id: string }).id;
                            this.addAssigneesToChannel(project.assignedUsers(), channelId);
                            resolve(channelId);
                        });
                        return of();
                    }),
                )
                .subscribe((existingResponse) => {
                    const channelId = (existingResponse as { id: string }).id;
                    this.addAssigneesToChannel(project.assignees, channelId);
                    resolve(channelId);
                });
        });

    getActivityComments(_projectId: string = '', _maxInitialItems: number = 150, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]> {
        return (this.index() as Observable<MattermostPost[]>).pipe(
            switchMap((posts: MattermostPost[]) => {
                if (!posts) return of([]);
                const commentDataList = posts
                    .filter((post) => {
                        const isBot = post.props?.from_bot === 'true' || post.props?.from_webhook === 'true';
                        const isGitEvent = post.message?.includes('pushed') || post.message?.includes('opened an issue') || post.message?.includes('closed an issue');
                        return !isBot && !isGitEvent;
                    })
                    .map((post) => {
                        const authorName = post.username || 'Unknown';
                        const userId = post.user_id;

                        const isSystemMessage = post.type === 'system_ephemeral' || post.type === 'system_add_to_channel' || post.type === 'system_remove_from_channel' || post.type?.startsWith('system_');

                        const reactionsRaw = post.metadata?.reactions || [];
                        const reactionMap = new Map<string, number>();
                        reactionsRaw.forEach((r) => reactionMap.set(r.emoji_name, (reactionMap.get(r.emoji_name) ?? 0) + 1));
                        const reactions = Array.from(reactionMap.entries()).map(([name, count]) => ({ emoji: shortcodeToEmoji(name) || `:${name}:`, count }));

                        const attachments = (post.metadata?.files || []).map((f) => ({
                            id: f.id,
                            name: f.name,
                            mimeType: f.mime_type || '',
                            isImage: (f.mime_type || '').startsWith('image/'),
                            size: f.size || 0,
                        }));

                        const messageHtml = markdown2html(post.message || '');

                        const resolvedUser = resolveUser?.(undefined, userId, authorName, 'X-NEXUS-MATTERMOST') as (Dictionary<unknown> & { id?: string; getAvatar?: () => string; iconBaseUrl?: string }) | undefined;

                        let displayName = authorName;
                        if (!resolvedUser) {
                            const member = this.getUser(userId ?? '');
                            const memberName = member?.getName();
                            if (memberName && memberName !== 'Unknown') {
                                displayName = memberName;
                            }
                        }

                        const commentData: Dictionary = {
                            text: messageHtml,
                            created_at: new Date(post.create_at ?? 0),
                            user: resolvedUser || { name: displayName },
                            user_id: resolvedUser?.id,
                            is_mini: isSystemMessage,
                            reactions: reactions.length ? reactions : undefined,
                            attachments: attachments.length ? attachments : undefined,
                            var: { source: 'mattermost', ...(resolvedUser ? {} : { nicon: 'mattermost' }) },
                        };

                        if (resolvedUser) {
                            if (resolvedUser.getAvatar) commentData['icon'] = resolvedUser.getAvatar();
                            if (resolvedUser.iconBaseUrl !== undefined) commentData['iconBaseUrl'] = resolvedUser.iconBaseUrl;
                        }
                        return commentData;
                    });

                if (!commentDataList.length) return of([]);

                return forkJoin(
                    commentDataList.map((commentData) => {
                        const allAttachments = (commentData['attachments'] as { isImage: boolean; id: string; [k: string]: unknown }[] | undefined) ?? [];
                        if (!allAttachments.length) return of(commentData);
                        return forkJoin(
                            allAttachments.map((a) => {
                                const path = (a as { isImage: boolean; id: string }).isImage ? `files/${(a as { id: string }).id}/preview` : `files/${(a as { id: string }).id}`;
                                return this.getRootInstance()
                                    .getBlob(path)
                                    .pipe(
                                        map((blob) => (blob instanceof Blob ? URL.createObjectURL(blob) : blob)),
                                        catchError(() => of(null)),
                                    );
                            }),
                        ).pipe(
                            map((urls: (string | null | unknown)[]) => {
                                urls.forEach((url, i) => {
                                    if (url) (allAttachments[i] as Dictionary<unknown>)['blobUrl'] = url;
                                });
                                return commentData;
                            }),
                        );
                    }),
                );
            }),
        );
    }

    protected connect = () =>
        new Promise<void>((resolve, reject) => {
            this.getTeamId()
                .pipe(catchError(() => this.handleError(reject)))
                .subscribe((response) => {
                    const r = response as Dictionary<unknown> | null;
                    if (r && 'id' in r) {
                        this.teamId = r['id'] as string;
                        this.indexTeamUsers().subscribe(() => resolve(), (e) => reject(e));
                    } else {
                        resolve();
                    }
                });
        });

    #toPost = (data: unknown): MattermostPost[] => {
        const d = data as { posts: Dictionary<MattermostPost> };
        let m: MattermostPost[] = Object.values(d.posts);
        m = m.sort((a, b) => (b.create_at ?? 0) - (a.create_at ?? 0)); // Newest first
        return m;
    };
}
