import { Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { Serializable } from '@models/_core/serializable';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-search',
    templateUrl: './search.component.html',
    imports: [SearchInputComponent],
    host: {
        class: 'd-flex align-items-center',
        '(document:click)': 'onDocumentClick($event)',
    },
})
export class SearchComponent {
    
    #router = inject(Router);
    #eRef = inject(ElementRef);

    searchbox = viewChild.required(SearchInputComponent);
    expanded = signal(false);

    onDocumentClick(event: MouseEvent) {
        if (!this.#eRef.nativeElement.contains(event.target)) {
            this.expanded.set(false);
        }
    }

    toggleSearchBox() {
        this.expanded.update((v) => !v);
        if (this.expanded()) {
            this.searchbox().query.set('');
            setTimeout(() => this.searchbox().focus(), 50);
        }
    }

    onSelect(e: Serializable) {
        this.searchbox().blur();
        this.searchbox().empty();
        this.expanded.set(false);
        const url = e.frontendUrl();
        if (url) this.#router.navigate([url]);
    }
}
