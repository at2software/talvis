import { Company } from '@models/company/company.model';
import { Connection } from '@models/company/connection.model';

const me = Company.fromJson({ id: 1 });
const other = Company.fromJson({ id: 2 });

describe('Connection roles', () => {
    it('makes the selected company the customer when it is picked as customer', () => {
        expect(Connection.payloadFor(me, other, 'customer:1')).toEqual({ company1_id: 2, company2_id: 1, type: 'customer' });
    });

    it('makes the selected company the contractor when it is picked as contractor', () => {
        expect(Connection.payloadFor(me, other, 'customer:2')).toEqual({ company1_id: 1, company2_id: 2, type: 'customer' });
    });

    it('creates an unclassified link without a role', () => {
        expect(Connection.payloadFor(me, other, '')).toEqual({ company1_id: 1, company2_id: 2, type: null });
    });

    it('offers symmetric types only once', () => {
        expect(Connection.ROLES.filter((_) => _.type === 'partner')).toHaveLength(1);
        expect(Connection.ROLES.filter((_) => _.type === 'group')).toHaveLength(2);
    });

    it('names each side of a directed link by its role', () => {
        const link = Connection.fromJson({ company1_id: 2, company2_id: 1, type: 'group' });
        expect(link.typeOption()?.asCompany1).toBe('subsidiary');
        expect(link.typeOption()?.asCompany2).toBe('parent company');
    });
});
