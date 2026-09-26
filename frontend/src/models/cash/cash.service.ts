import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { TalvisHttpService } from '../http/http.talvis';
import { Cash } from './cash.model';
import { CashRegister } from './cash.register.model';

@Service()
export class CashService extends TalvisHttpService<CashRegister> {
    public apiPath = 'cash';
    indexRegisters = () => this.aget('cash', {}, CashRegister);
    indexEntries = (_: string) => this.aget(`cash/${_}`, {}, Cash);
    storeEntry = (id: string, data: Dictionary) => this.post(`cash/${id}`, data);
}
