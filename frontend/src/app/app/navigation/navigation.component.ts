import { GlobalService } from '@models/global.service';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { Router, RouterModule } from '@angular/router';
import { fromEvent } from 'rxjs';
import { NComponent } from '@shards/n/n.component';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { Serializable } from '@models/_core/serializable';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-navigation',
    templateUrl: './navigation.component.html',
    styleUrls: ['./navigation.component.scss'],
    imports: [NComponent, SearchInputComponent, RouterModule, HotkeyDirective, GuidedTourComponent],
    host: { '(document:click)': 'onDocumentClick($event)' },
})
export class NavigationComponent {
    search = viewChild.required('search', { read: SearchInputComponent });
    searchEl = viewChild.required('search', { read: ElementRef });

    searchExpanded = signal(false);
    isMobile = signal(false);
    isMenuOpen = signal(false);

    readonly global = inject(GlobalService);
    #router = inject(Router);
    #destroyRef = inject(DestroyRef);

    readonly navigationItems = computed(() => this.global.navigationItems());
    readonly bottomNavigationItems = computed(() => this.global.bottomNavigationItems());

    navVisible = (logo: string) => this.navigationItems().some((i) => i.logo === logo && i.visible);
    bottomNavVisible = (logo: string) => this.bottomNavigationItems().some((i) => i.logo === logo && i.visible);

    constructor() {
        this.global.init.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe(() => {
            this.#checkIfMobile();
            fromEvent(window, 'resize')
                .pipe(takeUntilDestroyed(this.#destroyRef))
                .subscribe(() => this.#checkIfMobile());
        });
    }

    #checkIfMobile() {
        this.isMobile.set(window.innerWidth <= 768);
        if (!this.isMobile()) this.isMenuOpen.set(false);
    }

    onSearchExpand() {
        this.searchExpanded.update((v) => !v);
        if (this.searchExpanded()) {
            this.search().focus();
        } else {
            this.clearSearch();
        }
    }

    clearSearch() {
        this.search().blur();
        this.search().clear();
        this.search().empty();
        this.searchExpanded.set(false);
    }

    onSelect(e: Serializable) {
        this.clearSearch();
        const url = e.frontendUrl();
        if (url) this.#router.navigate([url]);
    }

    toggleMobileMenu() { this.isMenuOpen.update((v) => !v); }
    closeMobileMenu() { this.isMenuOpen.set(false); }

    onDocumentClick(event: MouseEvent) {
        const searchboxElement = this.searchEl().nativeElement;
        const target = event.target as Node | null;

        if (searchboxElement && target && !searchboxElement.contains(target)) {
            if (event.layerX + event.layerY + event.clientX + event.clientY > 0) {
                this.clearSearch();
            }
        }

        if (this.isMobile() && this.isMenuOpen()) {
            const el = event.target as HTMLElement;
            if (!el.closest('app-navigation') && !el.closest('.mobile-burger-btn')) {
                this.closeMobileMenu();
            }
        }
    }
}
