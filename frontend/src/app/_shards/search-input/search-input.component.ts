import { ChangeDetectionStrategy, afterNextRender, Component, computed, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { SearchService } from '@models/search.service';
import { Serializable } from '@models/_core/serializable';
import { Dictionary, REFLECTION } from '@constants/constants';
import { FormsModule } from '@angular/forms';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SafePipe } from '@pipes/safe.pipe';
import { Project } from '@models/project/project.model';
import { CompanyContact } from '@models/company/company-contact.model';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'search-input',
    templateUrl: './search-input.component.html',
    styleUrls: ['./search-input.component.scss'],
    host: { class: 'd-flex border-0' },
    imports: [FormsModule, ScrollbarComponent, NgbTooltipModule, SafePipe],
})
export class SearchInputComponent {
    readonly itemSelected = output<Serializable>();

    protected readonly Project = Project; 
    protected readonly CompanyContact = CompanyContact; 

    query = model<string>('');
    only = input<string>('');
    has_icon = input<boolean>(false);
    minSearch = input<number>(3);
    openableOnly = input<boolean>(false);
    selected = model<Serializable | undefined>(undefined);

    protected readonly searchbox = viewChild.required<ElementRef<HTMLInputElement>>('searchbox');
    protected readonly dropdown = viewChild<ScrollbarComponent>('dropdown');
    private readonly footer = viewChild.required<ElementRef<HTMLElement>>('footer');

    readonly currentIndex = signal(0);
    readonly #allResults = signal<Serializable[]>([]);
    readonly results = computed<Serializable[]>(() => (this.openableOnly() ? this.#allResults().filter((_) => _.frontendUrl()) : this.#allResults()));
    readonly isLoading = signal(false);
    readonly hasSearched = signal(false);

    readonly #hasFooter = signal(false);

    readonly hasResults = computed(() => this.results().length > 0);
    readonly shouldShowDropdown = computed(() => this.hasSearched() && (this.results().length > 0 || this.isLoading() || this.#hasFooter()));

    #delay: ReturnType<typeof setTimeout> | null = null;
    #currentSearchTerm = '';

    readonly #searchService = inject(SearchService);
    readonly #el = inject(ElementRef);

    constructor() {
        afterNextRender(() => {
            this.focus();
            this.#hasFooter.set(this.footer().nativeElement.childElementCount > 0);
        });
    }

    focus = () => setTimeout(() => this.searchbox()?.nativeElement.focus(), 0);
    empty = () => this.query.set('');
    blur = () => this.searchbox()?.nativeElement?.blur();

    clear() {
        this.#allResults.set([]);
        this.isLoading.set(false);
        this.hasSearched.set(false);
        this.#currentSearchTerm = '';
        if (this.#delay) {
            clearTimeout(this.#delay);
            this.#delay = null;
        }
    }

    scrollToCurrentItem(): void {
        const dropdown = this.dropdown();
        if (this.currentIndex() < 0 || !dropdown) return;

        const dropdownElement = dropdown.el.nativeElement;
        const items = dropdownElement.querySelectorAll('.dropdown-item');
        const currentItem = items[this.currentIndex()] as HTMLElement;

        if (currentItem) {
            const containerRect = dropdownElement.getBoundingClientRect();
            const itemRect = currentItem.getBoundingClientRect();
            const bottomOffset = itemRect.bottom - containerRect.bottom;
            const topOffset = itemRect.top - containerRect.top;

            if (bottomOffset > 0) {
                dropdownElement.scrollTop += bottomOffset + 10;
            } else if (topOffset < 0) {
                dropdownElement.scrollTop += topOffset - 10;
            }
        }
    }

    onKeydown(event: KeyboardEvent) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.currentIndex.set((this.currentIndex() + 1) % this.results().length);
                this.scrollToCurrentItem();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.currentIndex.set((this.results().length + this.currentIndex() - 1) % this.results().length);
                this.scrollToCurrentItem();
                break;
            case 'Enter': {
                event.preventDefault();
                const item = this.results()[this.currentIndex()];
                if (item) {
                    this.searchbox().nativeElement.blur();
                    this.open(item);
                }
                break;
            }
            case 'Escape':
                event.preventDefault();
                this.clear();
                this.blur();
                break;
        }
    }

    onInput(event: Event) {
        const value = (event.target as HTMLInputElement).value;
        this.query.set(value);
        this.#triggerSearch(value);
    }

    onFocus() {
        const q = this.query();
        if (q.length >= this.minSearch() && !this.results().length) {
            this.#triggerSearch(q);
        }
    }

    onBlur() {
        setTimeout(() => {
            if (!this.#el.nativeElement.contains(document.activeElement)) {
                this.clear();
            }
        }, 150);
    }

    #triggerSearch(value: string) {
        if (this.#delay) clearTimeout(this.#delay);

        if (value.length >= this.minSearch()) {
            this.#delay = setTimeout(() => this.#searchDelayed(value), 300);
        } else if (value.length === 0) {
            this.clear();
        }
    }

    #searchDelayed(search: string) {
        this.#currentSearchTerm = search;
        this.isLoading.set(true);
        this.hasSearched.set(true);

        const filters: Dictionary = {};
        if (this.only()) filters.only = this.only();
        this.selected.set(undefined);

        this.#searchService.search(search, filters).subscribe({
            next: (x) => {
                if (this.#currentSearchTerm === search) {
                    this.currentIndex.set(0);
                    this.#allResults.set(Object.values(x).map((item) => REFLECTION<Serializable>(item)));
                    this.isLoading.set(false);
                }
            },
            error: () => {
                this.isLoading.set(false);
                this.#allResults.set([]);
            },
        });
    }

    selectItem(item: Serializable, event?: Event) {
        event?.preventDefault();
        event?.stopPropagation();
        this.open(item);
    }

    preventBlur(event: Event) {
        event.preventDefault();
    }

    setCurrentIndex(index: number) {
        this.currentIndex.set(index);
    }

    open(o: Serializable) {
        this.#allResults.set([]);
        this.query.set(o.getName());
        this.selected.set(o);
        this.itemSelected.emit(o);
    }
}
