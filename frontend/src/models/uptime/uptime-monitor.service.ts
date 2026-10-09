import { Service } from '@angular/core';
import { EMPTY, Observable, catchError, tap } from 'rxjs';
import { Toast } from '@shards/toast/toast';
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

    testCheckAndReport = (monitor: UptimeMonitor): Observable<UptimeTestCheckDto> =>
        this.testCheck(monitor).pipe(
            tap(({ check }) => {
                const lines = [$localize`:@@i18n.uptime.testComplete:Test complete`, $localize`:@@i18n.common.status:status` + `: ${check.status.toUpperCase()}`];
                if (check.status_code) lines.push($localize`:@@i18n.uptime.statusCode:status code` + `: ${check.status_code}`);
                if (check.response_time) lines.push($localize`:@@i18n.uptime.responseTime:response time` + `: ${check.response_time}ms`);
                if (check.error_message) lines.push($localize`:@@i18n.common.error:error` + `: ${check.error_message}`);
                const message = lines.join('<br>');
                if (check.status === 'up') Toast.success(message);
                else Toast.warn(message);
            }),
            catchError((err) => {
                Toast.error($localize`:@@i18n.uptime.testFailed:test failed` + `: ${err?.error?.message || err?.message || 'Unknown error'}`);
                return EMPTY;
            }),
        );

    updateRecipient = (monitor: UptimeMonitor, userId: string, preferences: Dictionary): Observable<unknown> => {
        return this.put(`${this.apiPath}/${monitor.id}/recipients/${userId}`, preferences);
    };
}
