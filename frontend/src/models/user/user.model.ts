import { VcardClass } from '../vcard/vcard-class.model';
import { environment } from '@environments/environment';
import { Vacation } from '../vacation/vacation.model';
import { UserEmployment } from './user-employment.model';
import { Encryption } from '../encryption/encryption.model';
import * as forge from 'node-forge';
import { NxAction } from '@models/_core/nx.actions';
import { ReplaySubject, tap } from 'rxjs';
import { Type } from '@models/_core/hydrate';
import { Company } from '@models/company/company.model';
import { Project } from '@models/project/project.model';
import { getUserActions } from './user.actions';
import { Model, TypeFromClass } from '@constants/model/type-discriminators';
import { IHasFoci } from '@models/focus/has-foci.interface';
import { computed } from '@angular/core';
import { storageGet, storageSet, storageRemove } from '@constants/storage';
import { nx } from '@models/_core/nx-bridge';
import { Toast } from '@shards/toast/toast';

@Model('User')
export class User extends VcardClass {
    static API_PATH = (): string => 'users';
    static iconPathFor = (user_id: string) => environment.envApi + `users/${user_id}/icon`;
    static COOKIE_ENC_KEY = 'ENC_PEM';
    
    override readonly getAvatar = computed(() => { this.snapshot(); return environment.envApi + `users/${this.id}/icon`; });
    override frontendUrl = (): string | undefined => (nx().global.user?.hasAnyRole(['hr', 'project_manager']) ? `/hr/${this.id}` : undefined);

    readonly #encryptionInitialized = new ReplaySubject<boolean>(1);
    readonly encryptionInitialized = this.#encryptionInitialized.asObservable();
    api_token: string = '';
    email: string = '';
    is_retired: boolean = false;
    public_key: string | null = null;
    private_key: string | null = null;
    keyPair: forge.pki.rsa.KeyPair | null = null;
    savesEncryptionCookie: boolean = false;
    encryptions: Encryption[] = [];
    is_sick?: string;
    is_on_vacation?: string;
    color: string = '#000000';
    work_zip?: number;
    role_names: string[] = [];
    m365_object_id: string | null = null;
    m365_address: string | null = null;
    latest_foci?: { id: string; parent_path: string; parent_name: string }[];

    @Type(()=>UserEmployment) active_employment!: UserEmployment;
    @Type(()=>UserEmployment) employments!: UserEmployment[];
    @Type(()=>Vacation) approvedVacations!: Vacation[];
    @Type(()=>Vacation) currentSickNotes!: Vacation[];

    @TypeFromClass() current_focus?: Company | Project | undefined;
    @TypeFromClass() active_projects!: IHasFoci[];

    protected override buildActions(): NxAction[] { return getUserActions(this) }

    css = computed(() => this.snapshot().color);
    readonly getM365Address = computed(() => this.snapshotAsThis().m365_address ?? null);

    avatar = () => this.getAvatar();

    getHpwArray = () => this.active_employment?.hpwArray() ?? [0, 0, 0, 0, 0, 0, 0];
    getHpwWithKeys = () => Object.assign({}, ...['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((_: string, i: number) => ({ [_]: this.getHpwArray()[i] })));
    getHpw = () => this.getHpwArray().reduce((a, b) => a + b);
    getWorkingDaysAmount = () => this.getHpwArray().filter((_) => _ > 0).length;
    getAverageHpd = () => this.getHpw() / this.getWorkingDaysAmount();

    hasRole = (roleName: string): boolean => {
        if (roleName !== 'admin' && this.role_names.includes('admin')) {
            return true;
        }
        return this.role_names.includes(roleName);
    };

    hasAnyRole = (roles: string[]): boolean => {
        if (this.role_names.includes('admin')) {
            return true;
        }
        return roles.some((role) => this.role_names.includes(role));
    };

    connectMicrosoft365 = () => this.httpService.get<{ url: string }>('microsoft365/connect').pipe(tap(({ url }) => (window.location.href = url)));
    disconnectMicrosoft365 = () => this.httpService.delete(`${this.apiPathWithId()}/microsoft365`).pipe(tap(() => this.patch({ m365_object_id: null, m365_address: null })));

    initRsaEncryption() {
        const pem = storageGet<string>(User.COOKIE_ENC_KEY, '');
        if (pem && pem.length) {
            this.importFromPem(pem, true);
        } else {
            this.#encryptionInitialized.next(true);
        }
    }
    importFromPem(pem: string, toggleSave = false) {
        try {
            const decrypted = forge.pki.privateKeyFromPem(pem);
            if (decrypted) {
                if (toggleSave) this.savesEncryptionCookie = true;
                this.#assignRsaKeyPair(this.toKeyPair(decrypted));
            }
        } catch (_x: unknown) {
            Toast.error($localize`:@@i18n.rsa.invalidPem:invalid PEM key`);
            this.#deleteEncryptionCookie();
        } finally {
            this.#encryptionInitialized.next(true);
        }
    }
    toKeyPair = (_: forge.pki.rsa.PrivateKey) => ({ privateKey: _, publicKey: forge.pki.rsa.setPublicKey(_.n, _.e) });
    #assignRsaKeyPair(_: forge.pki.rsa.KeyPair) {
        this.keyPair = _;
        this.public_key = forge.pki.publicKeyToPem(_.publicKey);
        this.private_key = forge.pki.privateKeyToPem(_.privateKey);
    }
    async createRsaKeyPair() {
        const keypair = await Encryption.createRsaKeypair();
        this.#assignRsaKeyPair(keypair);
    }
    toggleEncryptionCookie = () => (!this.savesEncryptionCookie ? this.#saveEncryptionCookie() : this.#deleteEncryptionCookie());
    #saveEncryptionCookie() {
        if (this.private_key) {
            this.savesEncryptionCookie = true;
            storageSet(User.COOKIE_ENC_KEY, this.private_key!);
        }
    }
    addEncryption(key: string, value: string) {
        if (this.keyPair) {
            const enc = Encryption.fromJson();
            enc.key = key;
            enc.value = this.keyPair.publicKey.encrypt(value);
            enc.store().subscribe();
        }
    }
    #deleteEncryptionCookie() {
        if (this.savesEncryptionCookie) {
            this.savesEncryptionCookie = false;
            storageRemove(User.COOKIE_ENC_KEY);
        }
    }
}
