import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Renderer2, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, fromEvent, map } from 'rxjs';
import { ToolbarService } from '../toolbar/toolbar.service';
import { GlobalService } from '@models/global.service';
import { AuthenticationService } from '@models/auth.service';
import { ActivitySidebarStateService } from '@activity/activity-sidebar-state.service';
import { ToolbarComponent } from '../toolbar/toolbar.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    imports: [ToolbarComponent],
    host: { '[class.scrolled]': 'isScrolled()' },
})
export class HeaderComponent implements AfterViewInit {
    toolbar = viewChild<ElementRef>('toolbar');
    content = viewChild.required<ElementRef>('content');

    readonly globalService = inject(GlobalService);
    isScrolled = signal(false);

    #toolbarService = inject(ToolbarService);
    #re = inject(Renderer2);
    #authService = inject(AuthenticationService);
    #sidebarStateService = inject(ActivitySidebarStateService);
    #destroyRef = inject(DestroyRef);

    constructor() {
        this.#destroyRef.onDestroy(() => this.#toolbarService.unregister());

        const scrollContainer = document.querySelector('.app-scroll');
        if (scrollContainer) {
            fromEvent(scrollContainer, 'scroll')
                .pipe(
                    debounceTime(50),
                    map((e) => (e.target as Element).scrollTop > 0),
                    distinctUntilChanged(),
                    takeUntilDestroyed(),
                )
                .subscribe((scrolled) => this.isScrolled.set(scrolled));
        }
    }

    ngAfterViewInit(): void {
        this.#toolbarService.register(this);
    }

    remove = (x: ElementRef) => this.#re.removeChild(this.toolbar()!.nativeElement, x.nativeElement);
    add = (x: ElementRef) => this.#re.appendChild(this.toolbar()!.nativeElement, x.nativeElement);
    prepend = (x: ElementRef) => this.#re.insertBefore(this.toolbar()!.nativeElement, x.nativeElement, this.toolbar()!.nativeElement.firstChild);

    onActivityTabClicked = () => this.#sidebarStateService.toggleSidebar();
    logout = () => this.#authService.logout();
}
