import { ChangeDetectionStrategy, Component, HostBinding, input } from '@angular/core';
import { Color } from '@constants/Color';
import { tracked } from '@constants/tracked';
import { SmartLinkDirective } from '@directives/smart-link.directive';
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { Project } from '@models/project/project.model';
import { ProjectState } from '@models/project/project-state.model';

@Component({
    selector: 'project',
    templateUrl: './project.component.html',
    styleUrls: ['./project.component.scss'],
    imports: [NgbTooltip, SmartLinkDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectComponent {
    readonly projectIn = input.required<Project>({ alias: 'project' });
    readonly project = tracked(this.projectIn);
    title = input<string>();
    click = input<() => void>();
    noRouting = input<boolean>(false);
    @HostBinding('class.is-internal') get isInternal() {
        return this.project().is_internal;
    }
    tooltip = () => (this.title() ? this.title() : this.project().name + ' (' + Math.round(100 * this.project().progress()) + '%)');
    stateOf = (p: Project): ProjectState | undefined => p.state ?? undefined;
    darker = (color: string) => (new Color(color)).darken(15).toHexString();
}
