import { Serializable } from '@models/_core/serializable';
import { Type } from '@models/_core/hydrate';
import { User } from '../user/user.model';
import { Project } from '../project/project.model';
import { UptimeCheck } from './uptime-check.model';
import { NxAction } from '@models/_core/nx.actions';
import { getUptimeMonitorActions } from './uptime-monitor.actions';
import { Observable, tap } from 'rxjs';
import { nx } from '@models/_core/nx-bridge';
import { Model } from '@constants/model/type-discriminators';
import { Dictionary } from '@constants/constants';

@Model('UptimeMonitor')
export class UptimeMonitor extends Serializable {
    static API_PATH = (): string => 'uptime_monitors';

    protected override buildActions(): NxAction[] { return getUptimeMonitorActions(this) }

    name!: string;
    url!: string;
    method: string = 'GET';
    expected_status_code: number = 200;
    timeout: number = 30;
    response_time_threshold: number = 5000;
    check_interval: number = 300;
    is_active: boolean = true;
    request_headers?: Dictionary<string>;
    request_body?: string;
    last_check_at?: string;
    last_status: 'up' | 'down' | 'degraded' | 'pending' = 'pending';
    last_notified_at?: string;
    created_by_user_id!: string;

    @Type(()=>User) createdBy?: User;
    @Type(()=>Project) projects: Project[] = [];
    @Type(()=>User) recipients: User[] = [];
    @Type(()=>UptimeCheck) latestCheck?: UptimeCheck;

    get statusIcon(): string {
        switch (this.last_status) {
            case 'up':
                return 'check_circle';
            case 'down':
                return 'cancel';
            case 'degraded':
                return 'warning';
            default:
                return 'radio_button_unchecked';
        }
    }

    get statusColor(): string {
        switch (this.last_status) {
            case 'up':
                return 'success';
            case 'down':
                return 'danger';
            case 'degraded':
                return 'warning';
            default:
                return 'secondary';
        }
    }

    runTest() {
        this.var.onTestRequested?.(this);
    }

    openEdit() {
        this.var.onEditRequested?.(this);
    }

    isSubscribed(): boolean {
        const currentUserId = nx().global.user?.id;
        return this.recipients?.some((u) => u.id === currentUserId) ?? false;
    }

    subscribe() {
        const currentUserId = nx().global.user?.id;
        if (!currentUserId) return undefined;
        const recipientIds = [...(this.recipients?.map((u) => u.id) || []), currentUserId];
        return this.httpService.put(this.apiPathWithId(), { recipient_ids: recipientIds }).pipe(tap(() => this.var.onSubscribeSuccess?.(this)));
    }

    unsubscribe() {
        const currentUserId = nx().global.user?.id;
        if (!currentUserId) return undefined;
        const recipientIds = (this.recipients?.map((u) => u.id) || []).filter((id) => id !== currentUserId);
        return this.httpService.put(this.apiPathWithId(), { recipient_ids: recipientIds }).pipe(tap(() => this.var.onUnsubscribeSuccess?.(this)));
    }

    unlinkFromProject() {
        this.var.onUnlinkFromProject?.(this);
    }

    override delete(): Observable<any> {
        return this.httpService.delete(this.apiPathWithId()).pipe(tap(() => this.var.onDeleteSuccess?.(this)));
    }
}
