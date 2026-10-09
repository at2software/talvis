import { VcardAddress } from './vcard-address';
import { VcardRow } from './vcard-row';

export class Vcard {
    rows: VcardRow[];
    get name(): string {
        return this.first('FN')?.vals[0] ?? '';
    }
    get url(): string | undefined {
        return this.first('URL')?.vals[0];
    }
    get org(): string | undefined {
        return this.first('ORG')?.vals[0];
    }
    title: string = '';

    constructor(vcard: string) {
        if (vcard == null) {
            console.trace('Null vCard provided');
        }
        if (!vcard) console.trace('Empty vCard string provided');
        const a: VcardRow[] = [];
        vcard.split('\n').forEach((x: string) => {
            const v = VcardRow.fromString(x);
            if (v) {
                a.push(v);
                if (v.key == 'TITLE') this.title = v.vals.join('');
            }
        });
        this.rows = a;
    }
    getAddress = (): VcardAddress[] => this.rows.filter((x) => x.key.toUpperCase() == 'ADR').map((x) => new VcardAddress(x.vals));
    get = (key: string, mods: string | undefined = undefined): VcardRow[] =>
        this.rows.filter((x) => {
            if (x.key != key) return false;
            if (mods !== undefined) {
                for (const mod of x.mods) {
                    if (mods.match(mod)) return true;
                    return false;
                }
            }
            return true;
        });
    first = (key: string, mods: string | undefined = undefined): VcardRow | undefined => {
        const _ = this.get(key, mods);
        return _.length > 0 ? _[0] : undefined;
    };

    toString = (): string => this.rows.map((_) => _.toString()).join('\n');
    normalized = (): string => this.rows.map((_) => _.normalized()).join('\n');
    equals = (vcard: string): boolean => new Vcard(vcard).normalized() === this.normalized();
}
