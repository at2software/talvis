import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutosaveDirective } from '@directives/autosave.directive';
import { ColorPickerDirective } from 'ngx-color-picker';
import { GlobalService } from '@models/global.service';
import { ProjectComponent } from '@shards/project/project.component';
import { Project } from '@models/project/project.model';
import { ProjectState } from '@models/project/project-state.model';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    selector: 'settings-projects-states',
    templateUrl: './settings-projects-states.component.html',
    styleUrls: ['./settings-projects-states.component.scss'],
    imports: [StackedTableDirective, FormsModule, AutosaveDirective, ColorPickerDirective, ProjectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProjectsStatesComponent {
    global = inject(GlobalService);

    #dummies = new Map(this.global.project_states.map((s) => [s.id, Project.fromJson({ state: s, progress: 0.5 })]));
    dummyFor = (state: ProjectState) => this.#dummies.get(state.id)!;
}
