import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { Vacation } from './vacation.model';
import { TalvisHttpService } from '../http/http.talvis';
import { VacationGrant } from './vacation-grant.model';
import { User } from '../user/user.model';
import { nx } from '@models/_core/nx-bridge';
import { map } from 'rxjs';
import { HolidayDto } from '@models/_core/api-response';
import { dayjs } from '@constants/date/dates';

@Service()
export class VacationService extends TalvisHttpService<Vacation> {
    apiPath = 'vacations';
    override readonly model = Vacation;

    // Narrow by instance: a JSON `"id": 12` stays a number, and a numeric id fails a
    // `typeof === 'string'` check, so it would be treated as a model.
    #userPath = (user: User | string | number) => (user instanceof User ? user.apiPathWithId() : `users/${user}`);

    indexGrants = (user: User | string) =>
        this.aget(this.#userPath(user) + '/vacation_grants', {}, VacationGrant).pipe(
            map((grants: VacationGrant[]) => {
                grants.forEach((grant) => {
                    grant.vacations.forEach((vacation) => (vacation.grant = grant));
                    grant.vacations.sort((a, b) => b.started_at!.localeCompare(a.started_at!));
                });
                return grants;
            }),
        );
    indexHolidays = () => this.aget<HolidayDto>('vacations/holidays').pipe(map((holidays) => holidays.map((_) => Object.assign(_, { date: dayjs(_.datum) }))));
    indexRequests = (user: User | string) => this.aget(this.#userPath(user) + '/vacation_requests', {}, Vacation);
    indexAbsences = (user: User | string) => this.aget(this.#userPath(user) + '/vacation_absences', {}, Vacation);
    indexPendingRequests = () => this.aget('vacations/requests', {}, Vacation);
    indexSickNotes = () => this.aget('vacations/sick-notes', {}, Vacation);
    storeManual = (v: Vacation) => this.post('vacations/manual', nx().payloadFor(v, v.constructor as typeof Vacation));
    storeSickNote = (v: Vacation) => this.post('vacations/sick-notes', nx().payloadFor(v, v.constructor as typeof Vacation));
    storeSickNoteForOther = (payload: Dictionary) => this.post('vacations/sick-notes', payload);
}
