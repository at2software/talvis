import { Service } from '@angular/core';
import { TalvisHttpService } from './http/http.talvis';
import { Dictionary } from '@constants/constants';
import { BankLookupDto } from '@models/_core/api-response';
import { Vault } from './vault.model';

@Service()
export class VaultService extends TalvisHttpService<Vault> {
    apiPath = 'vault';

    index = (filters?: Dictionary) => this.aget('vaults', filters, Vault);
    checkCredentials = (credentials: Dictionary) => this.post('vaults', credentials, Object);
    submitTan = (data: { prefix: string; challenge_id: string; tan?: string }) => this.post('vaults/tan', data, Object);
    bankLookup = (blz: string) => this.get<BankLookupDto>('vaults/bank-lookup', { blz });
}
