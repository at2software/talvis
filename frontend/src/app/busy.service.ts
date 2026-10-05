import { computed, Service, signal } from '@angular/core';

@Service()
export class BusyService {
    readonly #pending = signal(0);
    readonly active = computed(() => this.#pending() > 0);

    begin() {
        this.#pending.update((n) => n + 1);
    }
    end() {
        this.#pending.update((n) => Math.max(0, n - 1));
    }
}
