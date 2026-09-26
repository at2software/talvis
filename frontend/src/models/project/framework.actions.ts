import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Framework } from './framework.model';

export function getFrameworkActions(self: Framework): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.common.setDeprecated:set deprecated`,
            group: true,
            action: () => self.httpService.put('projects/frameworks', { url: self.url, is_deprecated: true }),
            type: NxActionType.Destructive,
            roles: 'admin',
        },
    ];
}
