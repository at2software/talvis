import { ChangeDetectionStrategy, Component, effect, input, model } from '@angular/core';
import { Serializable } from '@models/_core/serializable';
import { FormsModule } from '@angular/forms';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'input-switch-group',
    templateUrl: 'input-switch.component.html',
    imports: [FormsModule],
})
export class InputSwitchGroupComponent {
    object = input<Serializable | undefined>();
    key = input<string>('');
    default = model<number>(0);
    disabled = input(false);
    #initialized = false;

    constructor() {
        effect(() => {
            const object = this.object();
            const key = this.key();
            if (!object || this.#initialized) return;
            const p = object.getParam(key);
            if (p !== undefined) {
                this.default.set(parseInt(p));
            }
            this.#initialized = true;
        });
    }
    getPath = () => (this.object() ? this.object()?.getParamPath(this.key()) : this.key());
    onChange() {
        const object = this.object();
        const key = this.key();
        if (object) {
            object.params![key] = this.default();
            object.updateParam(key, { value: this.default() ? 1 : 0 }).subscribe();
        } else {
            console.warn('not implemented yet');
        }
    }
}
