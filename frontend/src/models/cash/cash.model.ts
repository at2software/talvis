import { Serializable } from '@models/_core/serializable';
import { NxAction } from '@models/_core/nx.actions';
import { getCashActions } from './cash.actions';
import { Model } from '@constants/model/type-discriminators';

@Model('Cash')
export class Cash extends Serializable {
    static API_PATH = (): string => 'cashes';

    override apiPathWithId(): string { return `cash/entries/${this.id}` }
    protected override buildActions(): NxAction[] { return getCashActions(this) }

    description: string = '';
    approver: string = '';
    occured_at: string = '';
    value: number = 0;
}
