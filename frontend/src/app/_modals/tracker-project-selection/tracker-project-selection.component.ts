import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { NComponent } from '@shards/n/n.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { modelListResource } from '@models/http/model-resource';
import { ILinkableProjects, LinkableProject, PluginInstance } from '@models/http/plugins/plugin.instance';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'tracker-project-selection',
    templateUrl: './tracker-project-selection.component.html',
    styleUrls: ['./tracker-project-selection.component.scss'],
    imports: [FormsModule, NComponent, SpinnerComponent],
})
export class TrackerProjectSelectionComponent extends ModalBaseComponent<string> {
    plugin = signal<(PluginInstance & ILinkableProjects) | undefined>(undefined);
    selectedId = signal('');
    searchTerm = signal('');

    #projects = modelListResource(this.plugin, (plugin) => plugin.indexLinkableProjects().pipe(catchError(() => of([] as LinkableProject[]))));
    isLoading = this.#projects.isLoading;
    projects = computed((): LinkableProject[] => {
        const term = this.searchTerm().trim().toLowerCase();
        return this.#projects.value().filter((p) => !term || p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term) || p.description?.toLowerCase().includes(term));
    });
    manualId = computed(() => {
        const term = this.searchTerm().trim();
        return term && !this.projects().some((p) => p.id.toLowerCase() === term.toLowerCase()) ? term : '';
    });

    init(_: PluginInstance & ILinkableProjects): void {
        this.plugin.set(_);
    }

    onSuccess = () => this.selectedId();

    selectProject = (id: string) => this.selectedId.set(id);
    isSelected = (id: string) => this.selectedId() === id;
}
