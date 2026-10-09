import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SlackPlugin } from '@models/http/plugins/plugin.slack';
import { User } from '@models/user/user.model';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'slack-user-selection',
    templateUrl: './slack-user-selection.component.html',
    styleUrls: ['./slack-user-selection.component.scss'],
    imports: [FormsModule],
})
export class SlackUserSelectionComponent extends ModalBaseComponent<string> {
    slackPlugin!: SlackPlugin;
    selectedUserId = signal('');
    searchTerm = signal('');

    init(_: SlackPlugin): void {
        this.slackPlugin = _;
    }

    onSuccess = () => this.selectedUserId();

    isRootInstance = (): boolean => this.slackPlugin?.isRootInstance() ?? false;

    getSlackUsers = (): User[] => {
        const users = this.slackPlugin?.getUsers() || [];
        let filteredUsers = users;
        const term = this.searchTerm().trim().toLowerCase();
        if (term) {
            filteredUsers = users.filter((u: User) => u.getName().toLowerCase().includes(term) || u.var?.data?.username?.toLowerCase().includes(term) || u.var?.data?.email?.toLowerCase().includes(term));
        }
        return filteredUsers.sort((a, b) => a.getName().localeCompare(b.getName()));
    };

    selectUser = (userId: string) => {
        this.selectedUserId.set(userId || '');
    };

    isSelected = (userId: string) => this.selectedUserId() === (userId || '');
}
