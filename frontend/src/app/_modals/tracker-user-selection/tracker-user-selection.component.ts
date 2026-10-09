import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { NComponent } from '@shards/n/n.component';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { User } from '@models/user/user.model';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'tracker-user-selection',
    templateUrl: './tracker-user-selection.component.html',
    styleUrls: ['./tracker-user-selection.component.scss'],
    imports: [FormsModule, NComponent],
})
export class TrackerUserSelectionComponent extends ModalBaseComponent<string> {
    plugin = signal<(PluginInstance & ITaskPlugin) | undefined>(undefined);
    selectedUserId = signal('');
    searchTerm = signal('');

    isRootInstance = computed(() => this.plugin()?.isRootInstance() ?? false);
    users = computed((): User[] => {
        const term = this.searchTerm().trim().toLowerCase();
        const users = this.plugin()?.getUsers() ?? [];
        return users
            .filter((u) => !term || u.getName().toLowerCase().includes(term) || String(u.id).toLowerCase().includes(term) || u.var?.data?.email?.toLowerCase().includes(term))
            .sort((a, b) => a.getName().localeCompare(b.getName()));
    });

    init(_: PluginInstance & ITaskPlugin): void {
        this.plugin.set(_);
    }

    onSuccess = () => this.selectedUserId();

    selectUser = (userId: string) => this.selectedUserId.set(String(userId ?? ''));
    isSelected = (userId: string) => this.selectedUserId() === String(userId ?? '');
}
