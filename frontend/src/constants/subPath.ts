import { Type } from '@angular/core';
import { Route } from '@angular/router';

export const subPath = (path: string, parentComponent: Type<any>, childComponent: Type<any>, isRoot: boolean = false, title: string = 'TALVIS'): Route => ({
    path: path,
    component: parentComponent,
    children: [{ path: '', component: childComponent, title: title }],
    data: { isRoot: isRoot },
});
