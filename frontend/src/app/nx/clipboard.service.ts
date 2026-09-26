import { inject, Service } from '@angular/core';
import { Subject } from 'rxjs';
import { Dictionary } from '@constants/constants';
import type { Serializable } from '@models/_core/serializable';
import { TalvisHttp } from '@models/http/http.talvis';
import { objectMap, objectRemoveEmpty } from '@constants/object/objectMap';
import { getCookie } from '@constants/cookies';

type TClipDict<T> = Dictionary<T[]>;

@Service()
export class ClipboardService {
    readonly #http = inject(TalvisHttp);

    #clips: TClipDict<Serializable> = {};
    readonly #changed = new Subject<boolean>();
    readonly onChanged = this.#changed.asObservable();

    clip(object: Serializable): void {
        if (!(object.class in this.#clips)) this.#clips[object.class] = [];
        if (!this.#clips[object.class].find((_) => _.id == object.id)) {
            this.#clips[object.class].push(object);
            this.#persist();
        }
        this.#emit();
    }

    unclip(object: Serializable): void {
        if (!(object.class in this.#clips)) this.#clips[object.class] = [];
        const existing = this.#clips[object.class].find((_) => _.id == object.id);
        if (existing) {
            this.#clips[object.class].remove(existing);
            this.#persist();
        }
        this.#emit();
    }

    unclipAll = (className: string): void => {
        this.#clips[className] = [];
        this.#clips = objectRemoveEmpty(this.#clips);
        this.#persist();
        this.#emit();
    };

    hasClip = (_: Serializable): boolean =>
        (this.#clips[_.class] ?? []).findIndex((x) => x.apiPathWithId() === _.apiPathWithId()) !== -1;

    getClips = (): TClipDict<Serializable> => this.#clips;
    getClipKeys = (): string[] => Object.keys(this.#clips);

    loadFromStorage = async (): Promise<void> => {
        const raw = localStorage.getItem('CLIPBOARD') || getCookie('CLIPBOARD');
        if (!raw) return;

        const cookie = JSON.parse(raw) as TClipDict<number>;
        if (!Object.values(cookie).flattened().length) return;

        const { REFLECTION } = await import('@constants/constants');
        this.#http.post('populate-clipboard', cookie).subscribe((response) => {
            const data = response as TClipDict<{ class?: string }>;
            const d: TClipDict<Serializable> = {};
            for (const c of Object.keys(data)) {
                d[c] = data[c].map((_) => REFLECTION(_));
            }
            this.#clips = d;
            this.#emit();
        });
    };

    #emit(): void {
        this.#clips = objectRemoveEmpty(this.#clips);
        this.#changed.next(Object.values(this.#clips).flattened().length > 0);
    }

    #persist(): void {
        localStorage.setItem('CLIPBOARD', JSON.stringify(objectMap(this.#clips, (val) => val.map((_) => _.id))));
    }
}
