import dayjs from 'dayjs/esm';
import customParseFormat from 'dayjs/esm/plugin/customParseFormat';
import isoWeek from 'dayjs/esm/plugin/isoWeek';
import utc from 'dayjs/esm/plugin/utc';
import timezone from 'dayjs/esm/plugin/timezone';
import isSameOrAfter from 'dayjs/esm/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/esm/plugin/isSameOrBefore';
import objectSupport from 'dayjs/esm/plugin/objectSupport';
import weekday from 'dayjs/esm/plugin/weekday';
import 'dayjs/esm/locale/de';

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(objectSupport);
dayjs.extend(weekday);
dayjs.locale('de');

export { dayjs };
export type { Dayjs } from 'dayjs/esm';

export const shortMonth = (date: dayjs.Dayjs): string => date.locale(($localize.locale ?? 'en').startsWith('de') ? 'de' : 'en').format('MMM');
export const dayjsMin = (...dates: dayjs.Dayjs[]): dayjs.Dayjs => dates.reduce((a, b) => (b.isBefore(a) ? b : a));
export const dayjsMax = (...dates: dayjs.Dayjs[]): dayjs.Dayjs => dates.reduce((a, b) => (b.isAfter(a) ? b : a));
