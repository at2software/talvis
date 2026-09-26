import { computed } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { Model, TypeFromClass } from '@constants/model/type-discriminators';
import { Type } from '@models/_core/hydrate';
import { Serializable } from '@models/_core/serializable';
import { User } from '../user/user.model';

@Model('DeletionLog')
export class DeletionLog extends Serializable {
    static API_PATH = (): string => 'deletion_logs';

    override readonly getName = computed(() => { this.snapshot(); return this.label; });

    user_id?: string;
    model_type: string = '';
    model_id: string = '';
    context_type: string | null = null;
    context_id: string | null = null;
    label: string = '';
    payload: Dictionary = {};
    meta: Dictionary = {};
    is_restorable: boolean = false;
    restored_at: string | null = null;
    restored_by_id?: string;

    @Type(() => User) user?: User;
    @Type(() => User) restored_by?: User;
    @TypeFromClass() context: Serializable | null = null;

    targetClass = computed(() => (this.snapshot().model_type as string ?? '').replace(/^App\\Models\\/, ''));
    isRestored = computed(() => !!this.snapshot().restored_at);
    canRestore = computed(() => this.snapshot().is_restorable && !this.snapshot().restored_at);
}
