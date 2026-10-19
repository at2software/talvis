import { catchError, Observable, of, shareReplay, throwError } from 'rxjs';
import { PluginInstance } from './plugin.instance';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { Dictionary } from '@constants/constants';
import { environment } from '@environments/environment';
import { ExternalCalendarDto } from '@models/_core/api-response';

const CACHE_MINUTES = 15;

export class CalendarPlugin extends PluginInstance {
    ICalendarPluginProperty: boolean = true;
    needsHttpInterceptor: boolean = false;

    #cache = new Map<string, { loadedAt: number; data: Observable<ExternalCalendarDto> }>();

    getVcardAttributeName = () => 'X-NEXUS-CALENDAR';
    isUserInInstance = (): boolean => false;
    getProfileUrl = (): string => '';
    getUserSelectionModalPath = () => '';
    getInterfacePropertyName = () => 'ICalendarPluginProperty';
    getPluginTypeName = () => 'calendar';

    override baseUrl = (): string => environment.envApi;

    icon = () => 'calendar';
    getHref = () => '';
    getName = () => this.enc.value.name || new URL(this.enc.value.url).hostname;
    toPluginLink = () => PluginLink.fromJson({ type: 'calendar' });
    getActivityComments = (): Observable<Dictionary[]> => of([]);

    occurrences(start: string, end: string, refresh = false): Observable<ExternalCalendarDto> {
        const key = `${start}|${end}`;
        const cached = this.#cache.get(key);
        if (cached && !refresh && Date.now() - cached.loadedAt < CACHE_MINUTES * 60_000) return cached.data;

        const data = this.post<ExternalCalendarDto>('calendars/occurrences', {
            url: this.enc.value.url,
            login: this.enc.value.login || null,
            password: this.enc.value.password || null,
            source: this.getName(),
            start,
            end,
        }).pipe(
            catchError((error) => {
                this.#cache.delete(key);
                return throwError(() => error);
            }),
            shareReplay(1),
        );
        this.#cache.set(key, { loadedAt: Date.now(), data });
        return data;
    }

    protected connect = (): Promise<void> => Promise.resolve();
}
