import { afterNextRender, ChangeDetectionStrategy, Component, inject, Injector, input, signal, TemplateRef } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Serializable } from '@models/_core/serializable';
import { DEFAULT_RTE_CONFIG } from '../text-param-editor/default-rte-config';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { QuillEditorComponent, QuillModules } from 'ngx-quill';
import type Quill from 'quill';
import { FormsModule } from '@angular/forms';
import { SafePipe } from '@pipes/safe.pipe';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { insertCurrentDate } from '@constants/quill';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'rte',
    templateUrl: './rte.component.html',
    styleUrls: ['./rte.component.scss'],
    imports: [EmptyStateComponent, QuillEditorComponent, FormsModule, SafePipe, HotkeyDirective],
})
export class RteComponent {
    object = input.required<Serializable>();
    key = input.required<string>();
    config = input(DEFAULT_RTE_CONFIG);
    compact = input(false);

    readonly toolbarId = `rte-toolbar-${Math.random().toString(36).slice(2)}`;
    readonly modules: QuillModules = { toolbar: { container: `#${this.toolbarId}` } };

    get binding(): string {
        return Reflect.get(this.object(), this.key()) ?? '';
    }
    set binding(v: string) {
        Reflect.set(this.object(), this.key(), v);
    }

    modalService = inject(NgbModal);
    #injector = inject(Injector);
    #quill?: Quill;

    readonly editorReady = signal(false);

    open(content: TemplateRef<unknown>) {
        this.editorReady.set(false);
        const ref = this.modalService.open(content, { size: 'lg' });
        afterNextRender(() => this.editorReady.set(true), { injector: this.#injector });
        ref.result.then(() => this.object().update().subscribe());
    }

    onEditorCreated(quill: Quill) {
        this.#quill = quill;
        quill.setSelection(quill.getLength(), 0);
        quill.focus();
    }

    onKeyDown(event: KeyboardEvent) {
        if (event.ctrlKey && event.key === 'd') {
            event.preventDefault();
            this.insertCurrentDate();
        }
    }

    insertCurrentDate() {
        if (this.#quill) insertCurrentDate(this.#quill);
    }
}
