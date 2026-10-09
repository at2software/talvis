import { TemplateRef } from '@angular/core';
import { ToastService } from './toast.service';

export interface ToastAction {
    label: string;
    onClick: () => void;
}

export interface ToastOptions {
    classname?: string;
    icon?: string;
    autohide?: boolean;
    delay?: number;
    progress?: number;
    actions?: ToastAction[];
}

export interface ToastItem extends ToastOptions {
    textOrTpl: string | TemplateRef<unknown>;
}

export class Toast {
    static service: ToastService;

    static show(textOrTpl: string | TemplateRef<unknown>, options: ToastOptions = { classname: 'bg-green bg-gradient text-dark accent-success' }): ToastItem {
        const toast = { textOrTpl, ...options };
        Toast.service?.toasts.update((toasts) => [...toasts, toast]);
        return toast;
    }
    static remove(toast: ToastItem | null) {
        if (toast) Toast.service?.remove(toast);
    }
    static warn(textOrTpl: string | TemplateRef<unknown>) {
        Toast.show(textOrTpl, { classname: 'bg-warning bg-gradient text-dark', icon: 'warning' });
    }
    static success(textOrTpl: string | TemplateRef<unknown>) {
        Toast.show(textOrTpl, { classname: 'bg-success bg-gradient text-dark', icon: 'check' });
    }
    static error(textOrTpl: string | TemplateRef<unknown>) {
        Toast.show(textOrTpl, { classname: 'bg-danger bg-gradient text-white', icon: 'error' });
    }
    static info(textOrTpl: string | TemplateRef<unknown>) {
        Toast.show(textOrTpl, { classname: 'bg-info bg-gradient', icon: 'info' });
    }
}
