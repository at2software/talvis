import { inject, Service } from '@angular/core';
import { User } from '@models/user/user.model';
import { GlobalService } from '../global.service';
import { TalvisHttpService } from '../http/http.talvis';
import { VacationGrant } from '../vacation/vacation-grant.model';
import { Focus } from '../focus/focus.model';
import { Dictionary } from '@constants/constants';
import { LoginDto, TimeBasedEmploymentInfoDto, WorkloadDataDto } from '@models/_core/api-response';

@Service()
export class UserService extends TalvisHttpService<User> {
    override apiPath = 'users';
    override readonly model = User;

    #global = inject(GlobalService);

    login = (email: string, password: string) => this.post<LoginDto>('login', { email: email, password: password }, Object);
    create = (data: { name?: string; first_name?: string; family_name?: string; email: string; password: string; employment?: { type: string; hpw: number; started_at: string } }) => this.post('users', data, Object);
    resetPassword = (userId: string, password: string) => this.post(`users/${userId}/reset-password`, { password }, Object);

    encrypt = (key: string, object: any, id: string | null = null) => this.post(`users/${this.#global.user?.id}/encrypt`, { key: key, data: this.#global.user?.keyPair?.publicKey.encrypt(JSON.stringify(object)), id: id });

    #path = (user: User | string | number) => (user instanceof User ? user.apiPathWithId() : `${this.apiPath}/${user}`);

    showVacationStats = (user: User | string) => this.aget(this.#path(user) + '/vacation_stats', {}, VacationGrant);
    showProjectLoad = (user: User | string) => this.get(this.#path(user) + '/project_load', {}, Object);
    showFoci30DStats = (user: User | string) => this.aget(this.#path(user) + '/show-foci-30d', {}, Focus);
    showTimeBasedEmploymentInfo = (user: User | string) => this.get<TimeBasedEmploymentInfoDto>(this.#path(user) + '/time-based-employment');
    addTbe = (user: User | string, data: { paid_at: string; raw: number; vacation: number }) => this.post(this.#path(user) + '/time-based-employment', data, Object);
    showDailyWorkload = (user: User | string, start?: string, end?: string) => {
        const params: Dictionary<string> = {};
        if (start) params['start'] = start;
        if (end) params['end'] = end;
        return this.get<WorkloadDataDto>(this.#path(user) + '/daily-workload', params);
    };
}
