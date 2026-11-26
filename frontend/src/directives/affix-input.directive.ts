import { afterNextRender, Directive, ElementRef, inject, input, Renderer2 } from '@angular/core';

@Directive({
    selector: 'input[suffix],input[prefix]',
})
export class AffixInputDirective {
    readonly prefix = input<string>();
    readonly suffix = input<string>();

    readonly #el = inject(ElementRef);
    readonly #re = inject(Renderer2);

    constructor() {
        afterNextRender(() => {
            const el: HTMLElement = this.#el.nativeElement;
            this.#re.addClass(el, 'form-control');
            const parent = el.parentNode as HTMLElement;
            const group = parent.classList.contains('input-group') ? parent : this.#wrap(el, parent);

            if (this.prefix()) this.#re.insertBefore(group, this.#addon(this.prefix()!), el);
            if (this.suffix()) this.#re.insertBefore(group, this.#addon(this.suffix()!), el.nextSibling);
        });
    }

    #wrap(el: HTMLElement, parent: HTMLElement): HTMLElement {
        const wrapper = this.#re.createElement('div');
        this.#re.addClass(wrapper, 'input-group');
        this.#re.insertBefore(parent, wrapper, el);
        this.#re.appendChild(wrapper, el);
        return wrapper;
    }

    #addon(text: string): HTMLElement {
        const span = this.#re.createElement('span');
        this.#re.addClass(span, 'input-group-text');
        this.#re.appendChild(span, this.#re.createText(text));
        return span;
    }
}
