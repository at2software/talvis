import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { Serializable } from '@models/_core/serializable';
import { TalvisHttp, Page } from '@models/http/http.talvis';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'continuous-marker',
    templateUrl: './continuous.marker.component.html',
    styleUrls: ['./continuous.marker.component.scss'],
    imports: [ToolbarComponent, SpinnerComponent],
})
export class ContinuousMarkerComponent<T extends Serializable> {
    active = signal(false);
    loaded = signal(false);
    remainingPages = signal(-1);
    autoloadRemaining = signal(false);

    #base: T | undefined = undefined;
    #isDestroyed = false;
    #next_page_url: string | null = '';
    #scrollHandler = () => this.#checkPosition();
    #observerSub?: Subscription;

    #ref = inject(ElementRef);
    #service = inject(TalvisHttp);
    #destroyRef = inject(DestroyRef);

    observer = input<Observable<Page<T>> | undefined>(undefined);
    dataReceived = output<T[]>();

    constructor() {
        window.addEventListener('scroll', this.#scrollHandler);
        document.addEventListener('scroll', this.#scrollHandler, true);
        this.#destroyRef.onDestroy(() => {
            this.#isDestroyed = true;
            this.#observerSub?.unsubscribe();
            window.removeEventListener('scroll', this.#scrollHandler);
            document.removeEventListener('scroll', this.#scrollHandler, true);
        });

        effect(() => {
            const obs = this.observer();
            if (!obs) {
                this.active.set(false);
                return;
            }
            this.loaded.set(false);
            this.active.set(true);
            this.autoloadRemaining.set(false);
            this.#base = undefined;
            this.#observerSub?.unsubscribe();
            this.#observerSub = obs.subscribe((x) => this.#onResult(x));
        });
    }

    loadRemaining() {
        if (!this.autoloadRemaining()) this.#next();
        this.autoloadRemaining.set(true);
    }

    #onResult(x: Page<T>) {
        if (this.#base === undefined) {
            if (x.data.length) this.#base = x.data[0];
        } else {
            if (this.#base instanceof Serializable) {
                const ctor = this.#base.constructor as unknown as { fromJson(json: unknown): T };
                x.data = x.data.map((o) => ctor.fromJson(o));
            }
        }
        this.dataReceived.emit(x.data);
        this.active.set(false);
        this.#next_page_url = x.next_page_url;
        this.remainingPages.set(x.last_page - x.current_page);
        if (x.next_page_url == null) {
            this.loaded.set(true);
            this.autoloadRemaining.set(false);
        } else {
            if (this.autoloadRemaining()) {
                setTimeout(() => this.#next(), 100);
            } else {
                setTimeout(() => this.#checkPosition(), 100);
            }
        }
    }

    #next() {
        if (!this.active() && !this.loaded() && !this.#isDestroyed && this.#next_page_url) {
            this.active.set(true);
            this.#service.next<Page<T>>(this.#next_page_url).subscribe((x) => this.#onResult(x));
        }
    }

    #checkPosition() {
        if (this.loaded() || this.autoloadRemaining() || this.active()) return;
        const rect = this.#ref.nativeElement.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom >= 0) this.#next();
    }
}
