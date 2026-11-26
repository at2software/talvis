import { NxAction } from '@models/_core/nx.actions';
import { Dictionary } from '@constants/constants';
import { Serializable } from '@models/_core/serializable';
import * as forge from 'node-forge';
import { nx } from '@models/_core/nx-bridge';
import { getEncryptisingleActionResolveds } from './encryption.actions';
import { Model } from '@constants/model/type-discriminators';

@Model('Encryption')
export class Encryption extends Serializable {
    static API_PATH = (): string => 'encryptions';

    key: string = '';
    my_id?: string;

    #encryptedValue: string | Dictionary<unknown> | undefined;
    #decrypted?: { from: unknown; key: forge.pki.rsa.PrivateKey; json: string | null };

    // TODO(#614): the decrypted shape is EncryptionValueDto, but this getter also returns
    // undefined and ~89 call sites assume it never does. Typing it honestly is its own change.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get value(): any {
        const user = nx().global.user;
        if (!this.#encryptedValue || !user?.keyPair) return undefined;
        const key = user.keyPair.privateKey;
        if (this.#decrypted?.from !== this.#encryptedValue || this.#decrypted.key !== key) {
            this.#decrypted = { from: this.#encryptedValue, key, json: this.#decrypt(key) };
        }
        try {
            return this.#decrypted.json === null ? undefined : JSON.parse(this.#decrypted.json);
        } catch {
            return undefined;
        }
    }
    set value(v: string | Dictionary<unknown>) { this.#encryptedValue = v; }
    #decrypt(key: forge.pki.rsa.PrivateKey): string | null {
        try {
            return key.decrypt(this.#encryptedValue as string);
        } catch {
            return null;
        }
    }

    protected override buildActions(): NxAction[] { return getEncryptisingleActionResolveds(this) }

    getMyIdKey = () => 'MY_' + this.key + '_' + this.value.url.replace(/(^https?:\/\/|\/|\\)/i, '');

    loadJson(x: Dictionary) {
        this.fromJson(x);
        return this;
    }

    override dirtyFields(): Dictionary {
        const changes = super.dirtyFields();
        const user = nx().global.user;
        if ('value' in changes && user?.keyPair) {
            changes['value'] = user.keyPair.publicKey.encrypt(JSON.stringify(changes['value']));
        }
        return changes;
    }
    protected updateMyself = (x: Dictionary) => this.loadJson(x);

    static createRsaKeypair = (): Promise<forge.pki.rsa.KeyPair> => {
        return new Promise((resolve, reject) => {
            forge.pki.rsa.generateKeyPair({ bits: 4096, workers: -1 }, (err, keypair) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(keypair);
                }
            });
        });
    };
}
