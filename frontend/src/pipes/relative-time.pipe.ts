import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
];

@Pipe({
    name: 'relativeTime',
})
export class RelativeTimePipe implements PipeTransform {
    transform(value: string | Date | null | undefined): string {
        return value ? RelativeTimePipe.format(value, ($localize.locale ?? 'en').startsWith('de') ? 'de' : 'en') : '';
    }

    static format = (value: string | Date, locale: string): string => {
        const seconds = (new Date(value).getTime() - Date.now()) / 1000;
        const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? UNITS[UNITS.length - 1];
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(seconds / size), unit);
    };
}
