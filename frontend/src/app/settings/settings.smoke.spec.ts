import type { Type } from '@angular/core';
import { renderComponent } from '@testing/component-test';
import { User } from '@models/user/user.model';
import { SettingsCommandsComponent } from '@app/settings/commands/settings-commands.component';
import { SettingsGeneralComponent } from '@app/settings/general/settings-general.component';
import { SettingsPdfComponent } from '@app/settings/pdf/settings-pdf.component';
import { UsersComponent } from '@app/settings/roles/roles.component';
import { SettingsConnectorsComponent } from '@app/settings/settings-connectors/settings-connectors.component';
import { SettingsProjectsNotificationsComponent } from '@app/settings/settings-projects/settings-projects-notifications/settings-projects-notifications.component';
import { SettingsProjectsFlowComponent } from '@app/settings/settings-projects/settings-projects-flow/settings-projects-flow.component';

const components: [string, Type<unknown>][] = [
    ['SettingsCommandsComponent', SettingsCommandsComponent],
    ['SettingsGeneralComponent', SettingsGeneralComponent],
    ['SettingsPdfComponent', SettingsPdfComponent],
    ['UsersComponent', UsersComponent],
    ['SettingsConnectorsComponent', SettingsConnectorsComponent],
    ['SettingsProjectsNotificationsComponent', SettingsProjectsNotificationsComponent],
    ['SettingsProjectsFlowComponent', SettingsProjectsFlowComponent],
];

// Every component here loads through the Resource API. Nothing resolves under the testing
// HTTP backend, so this asserts only that the loading state renders without throwing.
describe('settings renders', () => {
    it.each(components)('%s', (_name, component) => {
        expect(renderComponent(component, { global: { user: User.fromJson({ id: '1', name: 'Thomas' }) } }).nativeElement).toBeTruthy();
    });
});
