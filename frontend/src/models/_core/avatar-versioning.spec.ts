import { NxStatic } from '@app/nx/nx.static';
import type { GlobalService } from '@models/global.service';
import { Company } from '@models/company/company.model';
import { User } from '@models/user/user.model';
import { environment } from '@environments/environment';
import type { VcardClass } from '@models/vcard/vcard-class.model';

/**
 * Avatars are served with a long max-age, so the url has to change when the image does. The backend
 * puts `?{updated_at}` into the payload `icon`; Company and User must use it and only fall back to the
 * bare url for lean payloads without icon.
 */
beforeAll(() => {
    NxStatic.global = { tables: [], project_states: [] } as unknown as GlobalService;
});

const fromJsonOf: Record<string, (json: object) => VcardClass> = {
    Company: (json) => Company.fromJson(json),
    User: (json) => User.fromJson(json),
};

describe.each([
    ['Company', 'companies'],
    ['User', 'users'],
])('%s.getAvatar', (name, path) => {
    const Cls = { fromJson: fromJsonOf[name] };

    it('uses the versioned payload icon prefixed with the api url', () => {
        const m = Cls.fromJson({ id: '5', icon: `${path}/5/icon?1700000000` });

        expect(m.getAvatar()).toBe(environment.envApi + `${path}/5/icon?1700000000`);
    });

    it('leaves an absolute icon url untouched', () => {
        expect(Cls.fromJson({ id: '5', icon: 'https://cdn.example.com/a.png' }).getAvatar()).toBe('https://cdn.example.com/a.png');
        expect(Cls.fromJson({ id: '5', icon: `/backend/api/${path}/5/icon?1` }).getAvatar()).toBe(`/backend/api/${path}/5/icon?1`);
    });

    it('falls back to the unversioned url without icon', () => {
        expect(Cls.fromJson({ id: '5' }).getAvatar()).toBe(environment.envApi + `${path}/5/icon`);
    });

    it('follows a patch of updated_at and icon', () => {
        const m = Cls.fromJson({ id: '5', updated_at: '2024-01-01 00:00:00', icon: `${path}/5/icon?1700000000` });
        expect(m.getAvatar()).toBe(environment.envApi + `${path}/5/icon?1700000000`);

        m.patch({ updated_at: '2024-01-02 00:00:00', icon: `${path}/5/icon?1700086400` });

        expect(m.getAvatar()).toBe(environment.envApi + `${path}/5/icon?1700086400`);
    });

    it('takes over an avatar upload response without a second request', () => {
        const m = Cls.fromJson({ id: '5', icon: `${path}/5/icon?1` });
        const refresh = vi.spyOn(m, 'refresh');

        m.applyAvatarUpload([{ id: '5', updated_at: '2024-01-02 00:00:00', icon: `${path}/5/icon?2` }]);

        expect(m.getAvatar()).toBe(environment.envApi + `${path}/5/icon?2`);
        expect(m.updated_at).toBe('2024-01-02 00:00:00');
        expect(refresh).not.toHaveBeenCalled();
    });
});
