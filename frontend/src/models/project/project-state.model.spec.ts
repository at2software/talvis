import { NxStatic } from '@app/nx/nx.static';
import type { GlobalService } from '@models/global.service';
import { ProjectState } from '@models/project/project-state.model';

const state = (id: string, progress: number) => ProjectState.fromJson({ id, name: `s${id}`, progress });

beforeAll(() => {
    NxStatic.global = {
        tables: [],
        project_states: [state('1', ProjectState.ProgressPrepared), state('2', ProjectState.ProgressPrepared), state('3', ProjectState.ProgressRunning)],
    } as unknown as GlobalService;
});

describe('ProjectState id helpers', () => {
    it('returns comma-joined ids, not arrays', () => {
        expect(ProjectState.idsPrepared()).toBe('1,2');
        expect(ProjectState.idsRunning()).toBe('3');
    });

    // Spreading these strings scatters their characters, which produced query params like
    // `1,,,2,3` and made the backend ignore the filter entirely.
    it('concatenates the prepared and running ids into one usable filter', () => {
        expect(ProjectState.idsPreparedOrRunning()).toBe('1,2,3');
        expect([...ProjectState.idsPrepared(), ...ProjectState.idsRunning()].join(',')).not.toBe('1,2,3');
    });
});

describe('ProjectState.allowedTargetIds', () => {
    const pm = { hasAnyRole: (roles: string[]) => roles.includes('project_manager') };

    afterEach(() => (ProjectState.transitions = undefined));

    it('falls back to the built-in matrix while no transitions are loaded', () => {
        expect(ProjectState.allowedTargetIds(3, pm)).toEqual(['1']);
    });

    it('uses the loaded transitions and hides those whose role the user lacks', () => {
        ProjectState.transitions = [
            { id: 1, from_state_id: 1, to_state_id: 2, required_role: null },
            { id: 2, from_state_id: 1, to_state_id: 6, required_role: 'financial' },
            { id: 3, from_state_id: 1, to_state_id: 7, required_role: 'project_manager' },
            { id: 4, from_state_id: 2, to_state_id: 3, required_role: null },
        ];
        expect(ProjectState.allowedTargetIds('1', pm)).toEqual(['2', '7']);
        expect(ProjectState.allowedTargetIds(1)).toEqual(['2']);
    });
});
