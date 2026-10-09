import { CdkTable } from '@angular/cdk/table';
import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';
import { TableExportService } from '@models/table-export.service';

@Directive({
    selector: '[enableTableExport]',
})
export class EnableTableExportDirective {
    filenamePrefix = input.required<string>();

    #el: ElementRef = inject(ElementRef);
    #tableExportService: TableExportService = inject(TableExportService);
    #initialized = false;
    #button?: HTMLButtonElement;

    constructor() {
        effect(() => {
            this.filenamePrefix();
            if (this.#initialized) return;

            const host = this.#el.nativeElement as HTMLElement;
            const table = host as HTMLTableElement | CdkTable<unknown>;

            const button = (this.#button = document.createElement('button'));
            button.type = 'button';
            button.innerText = 'excel';
            button.style.fontFamily = 'NxIcons';
            button.classList.add('btn', 'btn-table-export', 'pointer');
            button.title = 'Export to Excel';
            button.onclick = () => this.#tableExportService.exportAnyTableToCSV(table, this.filenamePrefix());

            const card = host.closest('.card');
            let header = card?.querySelector(':scope > .card-header') as HTMLElement | null;
            if (card && !header) {
                header = document.createElement('div');
                header.classList.add('card-header');
                card.insertBefore(header, card.firstChild);
            }

            if (header) {
                header.classList.add('d-flex', 'align-items-center');
                const label = header.querySelector(':scope > .table-export-label');
                if (!label && header.childNodes.length) {
                    const wrapper = document.createElement('span');
                    wrapper.classList.add('table-export-label', 'flex-fill', 'text-truncate');
                    while (header.firstChild) wrapper.appendChild(header.firstChild);
                    header.appendChild(wrapper);
                }
                button.classList.add('ms-auto');
                header.appendChild(button);
            } else {
                host.appendChild(button);
            }

            this.#initialized = true;
        });
        inject(DestroyRef).onDestroy(() => this.#button?.remove());
    }
}
