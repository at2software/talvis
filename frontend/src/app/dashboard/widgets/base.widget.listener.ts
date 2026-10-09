import { Service } from '@angular/core';
import { Subject } from 'rxjs';
import type { TOptions } from './base.widget.component';

@Service()
export class BaseWidgetListener {
    reloadRequested = new Subject<void>();
    updated = new Subject<[TOptions, number, number]>();
    deleted = new Subject<[unknown, number, number]>();
    added = new Subject<string>();
}
