import { GlobalService } from '@models/global.service';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { from, map, of, switchMap } from 'rxjs';
import { Serializable } from '@models/_core/serializable';
import { Param } from '@models/param/param.model';
import { TalvisHttp } from '@models/http/http.talvis';
import { modelResource } from '@models/http/model-resource';
import { NgbTypeaheadModule } from '@ng-bootstrap/ng-bootstrap';
import { InputGroupComponent } from './input-group.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'input-settings-group',
    templateUrl: './input-settings-group.component.html',
    imports: [NgbTypeaheadModule],
})
export class InputSettingsGroupComponent extends InputGroupComponent {
    id = input.required<string>();
    parent = input<Serializable | undefined>();

    #global = inject(GlobalService);
    #http = inject(TalvisHttp);

    readonly #globalParam = modelResource(
        () => (this.parent() ? undefined : this.id()),
        (id) =>
            from(this.#global.settingParam(id)).pipe(switchMap((cached) => (cached ? of(cached) : this.#http.get('params/' + id).pipe(map((_) => Param.fromJson(_)))))),
    );
    effectiveObject = computed<Serializable | undefined>(() => {
        const own = this.object();
        if (own) return own;
        const parent = this.parent();
        if (!parent) return this.#globalParam.value();
        const value = parent.getParam(this.id());
        return Param.fromJson({ key: this.id(), value: value !== undefined ? value : '' });
    });

    override get model(): string | undefined {
        return (this.effectiveObject() as unknown as Record<string, string> | undefined)?.['value'];
    }
    override set model(value: string | undefined) {
        const obj = this.effectiveObject();
        if (obj) (obj as unknown as Record<string, string | undefined>)['value'] = value;
    }
    taKey = (x: { name: string }) => x.name;

    constructor() {
        super();
        this.onUpdate.pipe(takeUntilDestroyed()).subscribe(this.#global.reload);
    }

    onKey = (event: Event) => (this.model = (event.target as HTMLInputElement).value);

    override updateModel(s: string) {
        const parent = this.parent();
        if (!parent) {
            this.model = s;
            this.effectiveObject()?.update(this.effectiveObject()?.toPayload()).subscribe();
            this.onUpdate.emit(s);
        } else {
            parent.params![this.id()] = s;
            parent.updateParam(this.id(), { value: s }).subscribe();
        }
    }
}
