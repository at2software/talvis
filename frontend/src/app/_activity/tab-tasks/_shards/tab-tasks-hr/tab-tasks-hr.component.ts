import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { modelListResource } from '@models/http/model-resource';
import { Nx } from '@app/nx/nx.directive';
import { ActionEmitterType } from '@app/nx/nx.directive';
import { Vacation } from '@models/vacation/vacation.model';
import { VacationService } from '@models/vacation/vacation.service';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TabTasksBaseComponent } from '../tab-tasks-base.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'tab-tasks-hr',
    templateUrl: './tab-tasks-hr.component.html',
    imports: [AvatarComponent, Nx, NgbTooltipModule, DatePipe],
})
export class TabTasksHrComponent extends TabTasksBaseComponent {
    #vacationService = inject(VacationService);

    #vacationRequests = modelListResource(this.ready, () => this.#vacationService.indexPendingRequests());
    #sickNotes = modelListResource(this.ready, () => this.#vacationService.indexSickNotes());

    vacationRequests = this.#vacationRequests.value;
    sickNotes = this.#sickNotes.value;

    constructor() {
        super();
        effect(() => this.countChanged.emit(this.vacationRequests().length + this.sickNotes().length));
    }

    override reload() {
        this.#vacationRequests.reload();
        this.#sickNotes.reload();
    }

    actionsResolved(e: ActionEmitterType) {
        if (e.object.nx() instanceof Vacation) this.reload();
    }

    getPrepopulatedSickNoteMail(_: Vacation) {
        const to = this.global.setting('SICKNOTE_EMAIL_RECEIPIENT');
        const formatDate = (dateStr: string | undefined) => {
            if (!dateStr) return '';
            return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        let subject = this.global.setting('SICKNOTE_EMAIL_SUBJECT') || '';
        subject = subject.replace(/\[data\]/g, `${_.user?.getName() || ''} - ${formatDate(_.started_at)} to ${formatDate(_.ended_at)}`);
        subject = encodeURIComponent(subject);

        let body = this.global.setting('SICKNOTE_EMAIL_TEXT') || '';
        const decodeHtmlEntities = (text: string) => {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            return textarea.value;
        };
        body = decodeHtmlEntities(body);
        body = body.replace(/\[data\]/g, `\nMitarbeiter:in: ${_.user?.getName() || 'N/A'}\nZeitraum: ${formatDate(_.started_at)} to ${formatDate(_.ended_at)}\n${_.comment ? `Kommentar: ${_.comment}` : ''}`);
        body = body.replace(/<br\s*\/?>/gi, '\n');
        body = body.replace(/<\/(div|p)>/gi, '\n\n');
        body = body.replace(/<(div|p)\s*[^>]*>/gi, '');
        body = body.replace(/<\/?[^>]+(>|$)/g, '');
        body = body.replace(/^\n+/, '');
        body = body.replace(/\n{3,}/g, '\n\n');
        body = encodeURIComponent(body);
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    }
}
