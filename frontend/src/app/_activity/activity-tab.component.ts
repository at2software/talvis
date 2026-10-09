import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Type, contentChild, inject, input, model } from '@angular/core';
import { ActivityService } from './activity.service';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'activity-tab',
    template: '<ng-content></ng-content>',
    host: { class: 'tab-pane fade' },
})
export class ActivityTabComponent {
    readonly el = inject(ElementRef);
    readonly #srv = inject(ActivityService);
    readonly scroll = contentChild(ScrollbarComponent);

    icon = input<string>();
    label = input<string>();
    nicon = input<string>();
    hidden = model(false);
    badge = model<string | undefined>(undefined);
    componentType = input<Type<unknown>>();
    onFocus: () => void = () => { /* no-op */ };
    onBlur: () => void = () => { /* no-op */ };

    constructor() {
        this.#srv.addTab(this);
        inject(DestroyRef).onDestroy(() => this.#srv.removeTab(this));
    }

    prepare(id: number) {
        const el = this.el.nativeElement;
        el.setAttribute('id', 'activity-' + id);
        el.setAttribute('name', 'activity-' + id);
        el.setAttribute('aria-labelledby', 'activity-tab-' + id);
        el.setAttribute('role', 'tabpanel');
    }

    readonly show = () => this.hidden.set(false);
    readonly hide = () => this.hidden.set(true);
    readonly focus = () => this.#srv.focus(this);
}
