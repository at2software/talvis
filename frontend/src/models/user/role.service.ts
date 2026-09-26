import { EventEmitter, inject, Service } from '@angular/core';
import { RoleManagementDto } from '@models/_core/api-response';
import { Role } from '@models/user/role.model';
import { User } from '@models/user/user.model';
import { GlobalService } from '../global.service';
import { TalvisHttpService } from '../http/http.talvis';
import { Serializable } from '@models/_core/serializable';
import { firstValueFrom, map, Observable } from 'rxjs';

/** Deserialized form of {@link RoleManagementDto} - real models, so templates can use `[nx]`. */
interface RoleManagementResult {
    roles: Role[];
    users: User[];
}

@Service()
export class RoleService extends TalvisHttpService<Serializable> {
    apiPath = 'roles';
    onReady = new EventEmitter<void>();
    onUpdate = new EventEmitter<void>();

    #isReady = false;
    get isReady(): boolean {
        return this.#isReady;
    }

    global = inject(GlobalService);

    constructor() {
        super();
        this.global.init.subscribe(() => {
            if (!this.#isReady) {
                this.#isReady = true;
                this.onReady.next();
            }
        });
    }

    #convertToModels = (data: RoleManagementDto): RoleManagementResult => ({
        roles: (data.roles ?? []).map((r) => Role.fromJson(r)),
        users: (data.users ?? []).map((u) => User.fromJson(u)),
    })
    indexRoleManagement(): Observable<RoleManagementResult> {
        return this.get<RoleManagementDto>('roles/').pipe(map(this.#convertToModels));
    }

    async loadRoleManagement(): Promise<RoleManagementResult> {
        return firstValueFrom(this.indexRoleManagement());
    }

    async assignRole(roleId: number, userId: string): Promise<RoleManagementResult> {
        const response = await firstValueFrom(this.post<RoleManagementDto>(`roles/${roleId}/users/${userId}`, {}));
        return this.#convertToModels(response);
    }

    async removeRole(roleId: number, userId: string): Promise<RoleManagementResult> {
        const response = await firstValueFrom(this.delete<RoleManagementDto>(`roles/${roleId}/users/${userId}`));
        return this.#convertToModels(response);
    }

    hasAnyRole(roles: string): boolean {
        const requiredRoles = roles.split('|');
        return this.global.user?.hasAnyRole(requiredRoles) ?? false;
    }
}
