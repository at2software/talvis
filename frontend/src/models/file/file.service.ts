import { Service } from '@angular/core';
import { Observable } from 'rxjs';
import { Invoice } from '@models/invoice/invoice.model';
import { TalvisHttpService } from '../http/http.talvis';
import { File } from './file.model';
import { InvoiceReminder } from '../invoice/invoice-reminder.model';

@Service()
export class FileService extends TalvisHttpService<File> {
    public apiPath = 'files';
    override readonly model = File;

    previewBlob(file: File): Observable<Blob> {
        return this.http().get(this.baseUrl() + `files/${file.id}`, { responseType: 'blob' });
    }

    download(target: Invoice | InvoiceReminder | File): void {
        let url: string | undefined = undefined;
        if (target instanceof Invoice) url = `invoices/${target.id}/pdf`;
        if (target instanceof InvoiceReminder) url = `invoice_reminders/${target.id}/pdf`;
        if (target instanceof File) url = `files/${target.id}`;
        if (!url) {
            return console.warn('type ' + typeof target + ' is not explicitely defined for file retrieval');
        }
        this.getFile(url!);
    }

    uploadWithProgress = (path: string, file: FormData) =>
        this.http().request<any>('POST', this.baseUrl() + path, { body: file, reportUploadProgress: true, observe: 'events' });
    uploadTravelExpenses = (files: FormData, success?: () => void) => this.postBlob('users/travel-expenses', files, success);
}
