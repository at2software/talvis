import { Service } from '@angular/core';
import { TalvisHttpService } from './http/http.talvis';
import { Dictionary } from '@constants/constants';

@Service()
export class SearchService extends TalvisHttpService<any> {
    apiPath = 'search';

    search = (query: string, filters: object = {}) => this.post<Dictionary>('search', Object.assign(filters, { query: query }));

    getCommands = () => this.get('commands');
    executeCommand = (command: string, args: object = {}) => this.post('commands/execute', { command, arguments: args });
}
