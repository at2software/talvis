import { Service } from '@angular/core';
import { TalvisHttpService } from '../http/http.talvis';
import { Encryption } from '@models/encryption/encryption.model';

@Service()
export class EncryptionService extends TalvisHttpService<Encryption> {
    public apiPath = 'encryptions';
    override readonly model = Encryption;
}
