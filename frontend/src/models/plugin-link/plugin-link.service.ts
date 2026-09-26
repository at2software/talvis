import { Service } from '@angular/core';
import { PluginLink } from './plugin-link.model';
import { TalvisHttpService } from './../http/http.talvis';
import { Serializable } from '@models/_core/serializable';

export type PluginLinkType = 'mattermost' | 'git';

@Service()
export class PluginLinkService extends TalvisHttpService<PluginLink> {
    apiPath = 'plugin_links';
    override readonly model = PluginLink;
    createChannel = (_: PluginLink, parent?: Serializable) => this.post(parent?.apiPathWithId() + '/plugin_link_channel', { type: _.type, url: _.url });
}
