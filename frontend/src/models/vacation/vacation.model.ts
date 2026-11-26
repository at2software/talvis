import type { NxAction } from '@models/_core/nx.actions';
import { VacationState } from '@enums/vacation.state';
import { Serializable } from '@models/_core/serializable';
import { VacationGrant } from './vacation-grant.model';
import { getVacatisingleActionResolveds } from './vacation.actions';
import { dayjs, Dayjs } from '@constants/date/dates';
import { nx } from '@models/_core/nx-bridge';
import { User } from '../user/user.model';
import { Type } from '@models/_core/hydrate';
import { Model } from '@constants/model/type-discriminators';

@Model('Vacation')
export class Vacation extends Serializable {
    static STATE_REQUESTED = 0;
    static STATE_APPROVED = 1;
    static STATE_DENIED = 2;
    static STATE_SICK = 3;
    static STATE_CANCELLED = 4;

    static SICK_ICON = 'health_and_safety';
    static VACATION_ICON = 'beach_access';
    static SICK_CLASS = 'text-teal';
    static VACATION_CLASS = 'text-cyan';

    static override API_PATH = (): string => 'vacations';

    comment: string = '';
    log: string = '';
    amount: number = 0;
    state: VacationState = 0 as VacationState;
    vacation_grant_id: string = '';
    started_at?: string;
    ended_at?: string;
    approved_at?: string;
    approved_by_id?: string;
    protected override buildActions(): NxAction[] { return getVacatisingleActionResolveds(this) }

    @Type(() => VacationGrant) grant!: VacationGrant;
    @Type(() => User) user!: User;
    @Type(() => User) approved_by!: User;

    frontendUrl = (): string | undefined => (this.state < Vacation.STATE_SICK ? `/vacation/${this.id}` : undefined);
    hasVacationPermissions = () => nx().global.user!.hasRole('hr');
    approve = () => nx().service.put(`vacations/${this.id}/approve`, { state: Vacation.STATE_APPROVED });
    acknowledge = () => nx().service.put(`vacations/${this.id}/acknowledge`, {});
    deny = (reason?: string) => nx().service.put(`vacations/${this.id}/approve`, { state: Vacation.STATE_DENIED, reason: reason });
    cancel = () => nx().service.put(`vacations/${this.id}/approve`, { state: Vacation.STATE_CANCELLED });
    revoke = () => nx().service.put(`vacations/${this.id}/revoke`);
    isOwnedByCurrentUser = () => this.grant?.user_id === nx().global.user?.id;

    time_started = (): Dayjs => dayjs(this.started_at);
    time_ended = (): Dayjs => dayjs(this.ended_at);
    time_approved = (): Dayjs => dayjs(this.approved_at);

    delta = () => (this.state === Vacation.STATE_APPROVED ? this.amount : 0);
    getStateIcon = (): string => {
        switch (this.state) {
            case Vacation.STATE_REQUESTED:
                return 'schedule';
            case Vacation.STATE_APPROVED:
                return 'check_circle';
            case Vacation.STATE_DENIED:
                return 'cancel';
            case Vacation.STATE_SICK:
                return 'healing';
            case Vacation.STATE_CANCELLED:
                return 'block';
            default:
                return 'help';
        }
    };

    getStateClass = (): string => {
        switch (this.state) {
            case Vacation.STATE_REQUESTED:
                return 'text-warning';
            case Vacation.STATE_APPROVED:
                return 'text-success';
            case Vacation.STATE_DENIED:
                return 'text-danger';
            case Vacation.STATE_SICK:
                return 'text-info';
            case Vacation.STATE_CANCELLED:
                return 'text-muted';
            default:
                return 'text-muted';
        }
    };

    getStateTooltip = (): string => {
        switch (this.state) {
            case Vacation.STATE_REQUESTED:
                return $localize`:@@i18n.vacation.state.pending:pending`;
            case Vacation.STATE_APPROVED:
                return $localize`:@@i18n.common.approved:approved`;
            case Vacation.STATE_DENIED:
                return $localize`:@@i18n.common.denied:denied`;
            case Vacation.STATE_SICK:
                return $localize`:@@i18n.vacation.state.sick:sick leave`;
            case Vacation.STATE_CANCELLED:
                return $localize`:@@i18n.vacation.state.cancelled:cancelled`;
            default:
                return $localize`:@@i18n.common.unknown:unknown`;
        }
    };

    isRequested = (): boolean => this.state === Vacation.STATE_REQUESTED;
    isDenied = (): boolean => this.state === Vacation.STATE_DENIED;
    isDeniedOrCancelled = (): boolean => this.state === Vacation.STATE_DENIED || this.state === Vacation.STATE_CANCELLED;
    isSick = () => this.state === Vacation.STATE_SICK;
    isVacation = () => this.state !== Vacation.STATE_SICK;

    getTypeIcon = (): string => (this.isSick() ? Vacation.SICK_ICON : Vacation.VACATION_ICON);
    getTypeClass = (): string => (this.isSick() ? Vacation.SICK_CLASS : Vacation.VACATION_CLASS);
    getTypeTooltip = (): string => (this.isSick() ? $localize`:@@i18n.vacation.state.sick:sick leave` : $localize`:@@i18n.vacation.type.vacation:vacation`);
}
