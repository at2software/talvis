import { NxAction } from '@models/_core/nx.actions';
import { Serializable } from '@models/_core/serializable';
import { Company } from './company.model';
import { Type } from '@models/_core/hydrate';
import { getConnectisingleActionResolveds } from './connection.actions';
import { Model } from '@constants/model/type-discriminators';

export type ConnectionType = 'customer' | 'partner' | 'group' | 'competitor' | 'referral';
export type ConnectionSource = 'manual' | 'research';

export interface ConnectionTypeOption {
    key: ConnectionType;
    label: string;
    color: string;
    directed: boolean;
    asCompany1: string;
    asCompany2: string;
}

export interface ConnectionRoleOption {
    value: string;
    label: string;
    type: ConnectionType;
    isCompany1: boolean;
}

@Model('Connection')
export class Connection extends Serializable {
    static readonly TYPES: ConnectionTypeOption[] = [
        {
            key: 'customer',
            label: $localize`:@@i18n.connections.type_customer:customer relationship`,
            color: 'grey',
            directed: true,
            asCompany1: $localize`:@@i18n.connections.role_customer:customer`,
            asCompany2: $localize`:@@i18n.connections.role_contractor:contractor`,
        },
        {
            key: 'partner',
            label: $localize`:@@i18n.connections.type_partner:partnership`,
            color: 'blue',
            directed: false,
            asCompany1: $localize`:@@i18n.connections.role_partner:partner`,
            asCompany2: $localize`:@@i18n.connections.role_partner:partner`,
        },
        {
            key: 'group',
            label: $localize`:@@i18n.connections.type_group:group of companies`,
            color: 'purple',
            directed: true,
            asCompany1: $localize`:@@i18n.connections.role_subsidiary:subsidiary`,
            asCompany2: $localize`:@@i18n.connections.role_parent:parent company`,
        },
        {
            key: 'competitor',
            label: $localize`:@@i18n.connections.type_competitor:competition`,
            color: 'red',
            directed: false,
            asCompany1: $localize`:@@i18n.connections.role_competitor:competitor`,
            asCompany2: $localize`:@@i18n.connections.role_competitor:competitor`,
        },
        {
            key: 'referral',
            label: $localize`:@@i18n.connections.type_referral:referral`,
            color: 'yellow',
            directed: true,
            asCompany1: $localize`:@@i18n.connections.role_referrer:referrer`,
            asCompany2: $localize`:@@i18n.connections.role_referred:referred`,
        },
    ];

    static readonly ROLES: ConnectionRoleOption[] = Connection.TYPES.flatMap((_) => [
        { value: `${_.key}:1`, label: _.asCompany1, type: _.key, isCompany1: true },
        ...(_.directed ? [{ value: `${_.key}:2`, label: _.asCompany2, type: _.key, isCompany1: false }] : []),
    ]);

    static payloadFor(me: Company, other: Company, roleValue: string) {
        const role = Connection.ROLES.find((_) => _.value === roleValue);
        const [company1, company2] = role?.isCompany1 ? [other, me] : [me, other];
        return { company1_id: company1.id, company2_id: company2.id, type: role?.type ?? null };
    }

    net: number = 0;
    projects_count: number = 0;
    company1_id: string = '';
    company2_id: string = '';
    type: ConnectionType | null = null;
    source: ConnectionSource = 'manual';
    source_url: string | null = null;
    verified_at: string | null = null;
    @Type(()=>Company) other_company!: Company;
    @Type(()=>Company) company1!: Company;
    @Type(()=>Company) company2!: Company;

    protected override buildActions(): NxAction[] { return getConnectisingleActionResolveds(this) }

    static API_PATH = (): string => 'connections';

    frontendUrl = (): string => `/customers/${this.other_company.id}`;
    otherCompany = (_: Company): Company | undefined => ((this.other_company ?? this.company1_id == _.id) ? this.company2 : this.company1);
    typeOption = (): ConnectionTypeOption | undefined => Connection.TYPES.find((_) => _.key === this.type);
    addCompanyAction = (_: Company | undefined) => {
        if (_) this.actions.unshift({ title: 'Open ' + _.getName(), action: () => this.navigateTo(`/customers/${_.id}`) });
    };
}
