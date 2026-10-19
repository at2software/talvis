import { dayjs, Dayjs } from '@constants/date/dates';
import { Serializable } from '@models/_core/serializable';
import { environment } from '@environments/environment';
import { Color } from '@constants/Color';
import { NxAction } from '@models/_core/nx.actions';
import { User } from '../user/user.model';
import { InvoiceItem } from '../invoice/invoice-item.model';
import { Company } from '../company/company.model';
import { Project } from '../project/project.model';
import { nx } from '@models/_core/nx-bridge';
import { IHasFoci } from './has-foci.interface';
import { getFocusActions } from './focus.actions';
import { IHasMarker } from '@enums/marker';
import { Type } from '@models/_core/hydrate';
import { TypeFromClass, Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { IHasExtIssue, effectiveExtIssueOf } from '../ext-issue/ext-issue.interface';

@Model('Focus')
export class Focus extends Serializable implements IHasMarker, IHasExtIssue {
    static API_PATH = (): string => 'foci';

    static filterByDateRange(foci: Focus[], startDate: Dayjs, endDate: Dayjs): Focus[] {
        return foci.filter((f) => startDate.diff(f.momentStarted(), 'seconds') < 0 && endDate.diff(f.momentStarted(), 'seconds') >= 0);
    }

    override readonly getName = computed((): string => { this.snapshot(); return this.comment ?? ''; });
    override readonly getAvatar = computed(() => { this.snapshot(); return environment.envApi + `users/${this.user_id}/icon`; });

    duration: number = 0;
    started_at: string = '';
    comment: string | null = '';
    user_id: string = '';
    is_unpaid: boolean = false;
    parent_type?: string;
    parent_id?: string;
    parent_icon?: string;
    parent_name?: string;
    parent_path?: string;
    invoice_item_id?: string;
    invoiced_in_item_id?: string;
    marker: number | null = null;

    ext_issue_plugin_link_id?: string;
    ext_issue_id?: string;
    effectiveExtIssue = () => effectiveExtIssueOf(this);

    #userVal: User | undefined;
    get user(): User | undefined { return this.#userVal ?? nx().global.userFor(this.user_id); }
    set user(v: unknown) { this.#userVal = v instanceof User ? v : (v ? User.fromJson(v) : undefined); }
    @Type(() => InvoiceItem) invoice_item!: InvoiceItem;
    @Type(() => InvoiceItem) invoiced_in_item!: InvoiceItem;
    @TypeFromClass() parent!: IHasFoci;

    protected override buildActions(): NxAction[] { return getFocusActions(this) }

    getInvoiceItemColor = computed(() => { this.snapshot(); return Color.uniqueColorFromString('' + this.invoice_item_id); });
    getInvoicedInItemColor = computed(() => { this.snapshot(); return Color.uniqueColorFromString('' + this.invoiced_in_item_id); });
    getParentName = computed(() => { this.snapshot(); return this.isOwnCompany() ? 'Organizational' : (this.parent?.getName() ?? 'Organizational'); });
    getParentIcon = computed(() => { this.snapshot(); return environment.envApi + this.parent_icon; });
    pStart = computed((): string => 100 * this.perc(this.momentStarted()) + '%');
    pEnd = computed((): string => (this.momentEnded().isSame(this.momentStarted(), 'day') ? 100 * (1 - this.perc(this.momentEnded())) + '%' : '0%'));
    ref = computed((): string => { this.snapshot(); return this.parent?.id || this.user_id || this.invoice_item_id || ''; });
    momentStarted = computed((): Dayjs => { this.snapshot(); return dayjs(this.started_at); });
    momentEnded = computed((): Dayjs => { this.snapshot(); return dayjs(this.ended_at); });

    canToggleInvoicing = (): boolean => {
        const me = nx().global.user;
        return !this.invoice_item_id && (String(this.user_id) === String(me?.id) || !!me?.hasRole('project_manager') || !!me?.hasRole('financial'));
    };

    setParent = (_: Serializable): void => {
        if (_ instanceof Company) { this.update({ parent_id: _.id, parent_type: 'App\\Models\\Company' }).subscribe(); return; }
        if (_ instanceof Project) { this.update({ parent_id: _.id, parent_type: 'App\\Models\\Project' }).subscribe(); return; }
        console.error('setting parent class ' + _.class + ' is not implemented yet');
    };
    adoptParent(parent: IHasFoci): this {
        this.parent ??= parent;
        return this;
    }
    fixParent() {
        if (this.parent.id !== '') return;
        switch (this.parent_type) {
            case 'App\\Models\\Project':
                this.parent = { id: this.parent_id!, class: 'Project' } as IHasFoci;
                break;
            case 'App\\Models\\Company':
                this.parent = { id: this.parent_id!, class: 'Company' } as IHasFoci;
                break;
        }
    }

    get ended_at() {
        return dayjs(this.started_at).add(this.duration, 'hours');
    }

    perc = (ts: Dayjs): number => -ts.startOf('day').diff(ts, 'seconds') / 86400;

    color = (): string => {
        if (this.isOwnCompany()) return '#999999';
        return Color.fromHsl((170 + parseInt(this.ref()) * 161) % 360, 100, 45).toHexString();
    };

    isOwnCompany = () => this.parent?.class == 'Company' && this.parent?.id === nx().ME_ID;
    isUnpaid = () => this.is_unpaid || this.isOwnCompany();
}
