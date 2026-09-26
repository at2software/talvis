import { Service } from '@angular/core';
import { Observable } from 'rxjs';
import { TalvisHttpService } from '../http/http.talvis';
import { UptimeMonitor } from './uptime-monitor.model';
import { Dictionary } from '@constants/constants';
import { UptimeCheckDayDto, UptimeTestCheckDto } from '@models/_core/api-response';
@Service()
export class UptimeMonitorService extends TalvisHttpService<UptimeMonitor> {
    public apiPath = 'uptime_monitors';
    override readonly model = UptimeMonitor;

    indexChecks = (monitor: UptimeMonitor, days: number = 30): Observable<UptimeCheckDayDto[]> => {
        return this.get(`${this.apiPath}/${monitor.id}/checks`, { days });
    };

    stats = (monitor: UptimeMonitor): Observable<unknown> => {
        return this.get(`${this.apiPath}/${monitor.id}/stats`);
    };

    testCheck = (monitor: UptimeMonitor, withNotification: boolean = false): Observable<UptimeTestCheckDto> => {
        return this.post(`${this.apiPath}/${monitor.id}/test`, { with_notification: withNotification });
    };

    updateRecipient = (monitor: UptimeMonitor, userId: string, preferences: Dictionary): Observable<unknown> => {
        return this.put(`${this.apiPath}/${monitor.id}/recipients/${userId}`, preferences);
    };
}
