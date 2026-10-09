import { Dictionary } from '@constants/constants';
import { SOCIAL_MEDIA_TYPES } from '@constants/socialmediatypes';
import { nextTrackId } from '@models/_core/nx.track-id';
import type { INxContextMenu } from '@models/_core/nx.contextmenu.interface';

export class VcardRow implements INxContextMenu {
    static fromString(s: string): VcardRow | undefined {
        const [header, ...rest] = s.split(':');
        if (!rest.length) return undefined;
        const [key, ...mods] = header.split(';');
        const vals = rest.join(':').split(';');
        return new VcardRow(key, mods, vals);
    }

    track_id: number = nextTrackId();
    info: Dictionary<any> = {};

    actions = [{ title: 'Remove', group: true }];

    constructor(
        public key: string,
        public mods: string[],
        public vals: string[],
    ) {}

    class: string = '';
    frontendUrl = () => '';
    apiPathWithId = () => '';
    getType = (): string | undefined => this.#getTypeMod()?.replace(/^type=/i, '');
    setType(type: string): void {
        this.mods = this.mods.filter((x) => !/^type=/i.test(x));
        this.mods.push(`type=${type}`);
    }
    contactIcon = (): string => {
        const k = this.key.toUpperCase();
        if (k === 'EMAIL') return 'email';
        if (k === 'TEL') {
            const type = this.getType()?.toLowerCase();
            if (type === 'cell') return 'smartphone';
            if (type === 'fax') return 'fax';
            return 'phone';
        }
        return '';
    };
    urlHref = (): string => (/^[a-z][a-z0-9+.-]*:/i.test(this.val()) ? this.val() : `https://${this.val()}`);
    socialMediaIcon = (): string | undefined => {
        const type = this.getType()?.toLowerCase() ?? '';
        return SOCIAL_MEDIA_TYPES[type] ?? SOCIAL_MEDIA_TYPES[this.#domainName()];
    };
    isSocialMedia = () =>!['work', 'home'].includes(this.getType()?.toLowerCase() ?? 'work');
    isMobile = (): boolean => this.key.toUpperCase() == 'TEL' && this.mods.filter((x) => x.match(/^type=.*cell/i)).length > 0;
    val = (): string => this.vals.join('');
    telHref = (): string => 'tel:' + this.val().replace(/[\s,\\/-]/g, '');
    type = (): string => this.getType()?.toUpperCase() ?? '';
    toString = (): string => `${this.key}${this.mods.length ? ';' + this.mods.join(';') : ''}:${this.vals.join(';')}`;
    normalized = (): string => `${[this.key, ...this.mods].join(';').toUpperCase()}:${this.vals.map((_) => _.trim()).join(';')}`;

    #getTypeMod = () => this.mods.find((x) => /^type=/i.test(x));
    #domainName = (): string => {
        try {
            return new URL(this.urlHref()).hostname.split('.').at(-2) ?? '';
        } catch {
            return '';
        }
    };
}
