import { Directive, ElementRef, inject, input, output } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { Toast, ToastItem } from '@shards/toast/toast';
import { forkJoin, last, Observable, tap } from 'rxjs';
import { FileService } from '@models/file/file.service';

const isFileDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

@Directive({
    selector: '[dnd]',
    host: { '[class.dnd-item-quiet]': '!dndHoverHint()' },
})
export class DndDirective {
    readonly dnd = input.required<string>();
    readonly dndAllowed = input<string[]>([]);
    readonly dndCategory = input<string>('');
    readonly dndHoverHint = input<boolean>(true);
    readonly collect = input<boolean>(false);
    readonly dndUploaded = output();
    readonly dndDrop = output<File[]>();

    readonly #fileService = inject(FileService);
    readonly #el = inject(ElementRef<HTMLElement>);

    formData = new FormData();
    fileNames: string[] = [];
    files: File[] = [];

    constructor() {
        const el = this.#el.nativeElement;
        el.classList.add('dnd-item');

        el.addEventListener('dragenter', (e: DragEvent) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
        });
        el.addEventListener('dragover', (e: DragEvent) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            el.classList.add('dnd-item-drag');
        });
        el.addEventListener('dragleave', (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('dnd-item-drag');
        });
        el.addEventListener('drop', (e: DragEvent) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('dnd-item-drag');
            this.#handleDrop(e);
        });
    }

    clear() {
        this.formData = new FormData();
        this.fileNames = [];
        this.files = [];
    }

    #handleDrop(evt: DragEvent) {
        const files = evt.dataTransfer?.files;
        if (!files?.length) return;

        this.clear();

        const progresses: number[] = [];
        let progressToast: ToastItem | null = null;
        const uploads: Observable<unknown>[] = [];

        for (const file of Array.from(files)) {
            const allowed = !this.dndAllowed().length || this.dndAllowed().some((a) => file.type.match(a));
            if (!allowed) {
                Toast.error(`${file.name} could not be uploaded: wrong file type (allowed: \`${this.dndAllowed().join('`, `')}\`)`);
                continue;
            }
            this.fileNames.push(file.name);
            this.files.push(file);
            if (this.collect()) {
                this.formData.append('file[]', file);
                if (this.dndCategory()) this.formData.append('category', this.dndCategory());
            } else {
                const fd = new FormData();
                fd.append('file', file);
                if (this.dndCategory()) fd.append('category', this.dndCategory());
                const idx = uploads.length;
                progresses.push(0);
                uploads.push(
                    this.#fileService.uploadWithProgress(this.dnd(), fd).pipe(
                        tap((event) => {
                            if (event.type === HttpEventType.UploadProgress && event.total) {
                                progresses[idx] = Math.round(100 * event.loaded / event.total);
                                if (progressToast) progressToast.progress = Math.round(progresses.reduce((a, b) => a + b) / progresses.length);
                            }
                        }),
                        last(),
                    )
                );
            }
        }

        if (this.collect()) { if (this.files.length) this.dndDrop.emit(this.files); return; }
        if (!uploads.length) return;

        const label = this.fileNames.length === 1 ? this.fileNames[0] : `${this.fileNames.length} files`;
        progressToast = Toast.show(`Uploading ${label}…`, {
            classname: 'bg-info bg-gradient text-dark',
            icon: 'upload_file',
            progress: 0,
            autohide: false,
        });

        forkJoin(uploads).subscribe({
            next: () => {
                Toast.remove(progressToast);
                Toast.success(`${label} uploaded`);
                this.dndUploaded.emit();
            },
            error: (err: any) => {
                Toast.remove(progressToast);
                const msg = err?.error?.message ?? err?.statusText;
                if (msg) Toast.error(msg);
            },
        });
    }
}
