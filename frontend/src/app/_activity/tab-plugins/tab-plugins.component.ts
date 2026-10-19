import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GlobalService } from '@models/global.service';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { Project } from '@models/project/project.model';
import { PluginLinkService } from '@models/plugin-link/plugin-link.service';
import { ActivityTabComponent } from '@activity/activity-tab.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { RsaSettingsEmptyComponent } from '@shards/rsa-settings/rsa-settings-empty.component';
import { RsaSettingsComponent } from '@shards/rsa-settings/rsa-settings.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { Encryption } from '@models/encryption/encryption.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'activity-tab-plugins',
    templateUrl: './tab-plugins.component.html',
    imports: [ActivityTabComponent, ScrollbarComponent, RsaSettingsEmptyComponent, RsaSettingsComponent, NgbTooltipModule, Nx, NComponent],
})
export class TabPluginsComponent {
    readonly #global = inject(GlobalService);
    readonly #factory = inject(PluginInstanceFactory);
    readonly #pluginLinkService = inject(PluginLinkService);
    readonly #destroyRef = inject(DestroyRef);

    readonly project = signal<Project | undefined>(undefined);
    readonly user = computed(() => this.#global.user);
    readonly encryptionsValid = computed(() => this.#global.encryptionsValid());
    readonly pluginEncryptions = computed(() => this.#factory.getLinkablePluginEncryptions());

    readonly #connectBump = signal(0);
    readonly #subscribedInstances = new Set<PluginInstance>();

    constructor() {
        this.#global.onRootObjectSelected.pipe(takeUntilDestroyed()).subscribe((obj) => {
            this.project.set(obj instanceof Project ? obj : undefined);
        });

        effect(() => {
            const sources: (Encryption | PluginLink)[] = [...this.pluginEncryptions(), ...(this.project()?.plugin_links ?? [])];
            untracked(() => sources.forEach((p) => this.#watchInit(this.#factory.instanceFor(p))));
        });
    }

    #watchInit(instance: PluginInstance | undefined): void {
        if (!instance || this.#subscribedInstances.has(instance)) return;
        this.#subscribedInstances.add(instance);
        instance.init.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe(() => this.#connectBump.update((v) => v + 1));
    }

    instanceFor = (p: Encryption | PluginLink): PluginInstance | undefined => {
        this.#connectBump();
        return this.#factory.instanceFor(p);
    };

    onNewPluginLink(_: PluginInstance) {
        PluginInstanceFactory.promptLinkId(_)
            .then((id) => {
                if (!id) return;
                _.toPluginLink(id).storeUnder(this.project()!, true).subscribe((link) => {
                    this.project.update((p) => {
                        p?.plugin_links.push(link);
                        return p ? Object.assign(Object.create(Object.getPrototypeOf(p)), p) : p;
                    });
                });
            })
            .catch(() => void 0);
    }

    onNewPluginChannel(_: PluginInstance) {
        this.#pluginLinkService.createChannel(_.toPluginLink(''), this.project()).subscribe((link) => {
            this.project.update((p) => {
                p?.plugin_links.push(link);
                return p ? Object.assign(Object.create(Object.getPrototypeOf(p)), p) : p;
            });
        });
    }
}
