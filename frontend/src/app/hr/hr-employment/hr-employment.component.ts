import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, TemplateRef } from '@angular/core';
import { tracked } from '@constants/tracked';
import { modelResource } from '@models/http/model-resource';
import { dayjs } from '@constants/date/dates';
import { UserService } from '@models/user/user.service';
import { GlobalService } from '@models/global.service';
import { environment } from '@environments/environment';
import { REFLECTION } from '@constants/constants';
import { NgbDatepickerModule, NgbDateStruct, NgbModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalNewUserService } from '@app/_modals/modal-new-user/modal-new-user.component';
import { ModalNewEmploymentComponent } from './modal-new-employment.component';
import { UserEmployment } from '@models/user/user-employment.model';
import { map } from 'rxjs';
import { HrTeamService } from '../hr-team/hr-team.service';
import { SmartLinkDirective } from '@directives/smart-link.directive';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { UlCompactComponent } from '@shards/ul-compact/ul-compact.component';
import { Serializable } from '@models/_core/serializable';
import { TbeRowDto } from '@models/_core/api-response';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface TBlocks {
    paid: [number, string][];
    vacation: [number, string][];
    worked: [number, string][];
    excluded: [number, string][];
    month: string;
    delta: number;
    lastDelta: number;
}
const newTBlocks = (month: string): TBlocks => ({ paid: [], vacation: [], worked: [], excluded: [], month: month, delta: 0, lastDelta: 0 });

type TbeProjectRow = Serializable & { path: string; duration: number };

const sumOf = (_: [number, string][]) => _.map((_) => _[0]).sum();

function buildTBlocks(rows: TbeRowDto[]): { months: TBlocks[]; min: number; max: number } {
    const blocks: Record<string, TBlocks> = {};
    for (const _ of rows) {
        if (!(_.month in blocks)) blocks[_.month] = newTBlocks(_.month);
        if (_.type === 0) {
            blocks[_.month].worked.push([_.duration, 'actual work time']);
            blocks[_.month].excluded.push([_.excluded, 'excluded projects']);
        } else if (_.type === 1) {
            blocks[_.month].paid.push([_.raw, 'paid time']);
            blocks[_.month].vacation.push([_.vacation, _.description]);
        }
    }
    let delta = 0;
    let min = 0;
    let max = 0;
    const step = (change: number) => {
        delta += change;
        max = Math.max(delta, max);
        min = Math.min(delta, min);
    };
    const months = Object.values(blocks);
    for (const block of months) {
        block.lastDelta = delta;
        step(-sumOf(block.paid));
        step(sumOf(block.vacation));
        step(sumOf(block.worked));
        block.delta = delta;
    }
    return { months, min, max };
}

@Component({
    selector: 'hr-employment',
    templateUrl: './hr-employment.component.html',
    styleUrls: ['./hr-employment.component.scss'],
    imports: [SmartLinkDirective, AvatarComponent, DatePipe, DecimalPipe, FormsModule, NgbDatepickerModule, NgbTooltipModule, UlCompactComponent, ToolbarComponent, Nx, AvatarComponent, HotkeyDirective, EmptyStateComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrEmploymentComponent {
    #parent = inject(HrTeamService);
    #userService = inject(UserService);
    #global = inject(GlobalService);
    #modalService = inject(NgbModal);
    #modal = inject(ModalBaseService);
    #newUserModal = inject(ModalNewUserService);

    readonly user = tracked(this.#parent.user);

    readonly #info = modelResource(
        () => this.#parent.userId(),
        (userId) => this.#userService.showTimeBasedEmploymentInfo(userId).pipe(map((_) => ({ ..._, employments: _.employments.map((e) => UserEmployment.fromJson(e)) }))),
    );
    readonly loaded = computed(() => this.#info.hasValue() || this.#info.status() === 'error');
    readonly projects = computed(() => this.#info.value()?.tbe_projects?.map((_) => REFLECTION<TbeProjectRow>(_)) ?? []);
    readonly employments = computed(() => this.#info.value()?.employments ?? []);
    readonly roles = computed(() => this.#info.value()?.roles.map((_) => _.name) ?? []);
    readonly #tbe = computed(() => buildTBlocks(this.#info.value()?.tbe_table ?? []));

    readonly remOutput = linkedSignal(() => this.#remainder());

    env = environment;
    remInput = 0;
    addTbeDate: NgbDateStruct = { year: dayjs().year(), month: dayjs().month(), day: 25 };
    addTbeAmount = 0;
    readonly factor = (1 / 160) * 8 * (20 / 12);

    readonly isAdmin = computed(() => this.#global.user?.hasRole('admin') ?? false);
    get minDelta() { return this.#tbe().min; }

    reload = () => this.#info.reload();

    getTbeMonths = () => this.#tbe().months;
    getMax = () => this.#tbe().max - this.#tbe().min;
    getPerc = (_: number) => (80 * _) / this.getMax();
    getSum = sumOf;
    hasTimebasedEmployment = () => this.user()?.active_employment?.is_time_based ?? false;

    updateRem = () => this.remOutput.set(this.#remainder());

    #remainder = () => (this.remInput + (this.getTbeMonths().last()?.delta ?? 0)) / (1 - this.factor);

    open(content: TemplateRef<unknown>) {
        this.#modalService.open(content, { ariaLabelledBy: 'modal-basic-title' });
    }

    async addUser() {
        const data = await this.#newUserModal.open().catch(() => undefined);
        if (!data) return;
        this.#userService.create(data).subscribe();
    }

    onNewEmployment() {
        const user = this.user();
        if (!user) return;
        this.#modal.open(ModalNewEmploymentComponent, user).then((_) => {
            if (_) _.store().subscribe(() => this.reload());
        });
    }

    addTbe = () => {
        const user = this.user();
        if (!user) return;
        const payload = {
            paid_at: this.addTbeDate.year + '-' + this.addTbeDate.month + '-' + this.addTbeDate.day,
            raw: this.addTbeAmount,
            vacation: this.addTbeAmount * this.factor,
        };
        this.#userService.addTbe(user, payload).subscribe(() => {
            this.#modalService.dismissAll();
            this.reload();
        });
    };
}
