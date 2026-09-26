import { Service } from '@angular/core';
import { User } from '@models/user/user.model';
import { TalvisHttpService } from '../http/http.talvis';
import { CalendarEntry } from './calendar-entry.model';

@Service()
export class VCalendarService extends TalvisHttpService<User> {
    apiPath = 'calendar_entries';

    getCalendar = () => this.aget('calendar_entries', null, CalendarEntry);
    createCalendarEvent = (calendarEntry: CalendarEntry) => this.post<CalendarEntry>('calendar_entries', calendarEntry);
    updateCalendarEvent = (calendarEntry: CalendarEntry) => this.put<CalendarEntry>(`calendar_entries/${calendarEntry.id}`, calendarEntry);
    deleteEvent = (calendarEntry: CalendarEntry) => this.delete<CalendarEntry>(`calendar_entries/${calendarEntry.id}`);
}
