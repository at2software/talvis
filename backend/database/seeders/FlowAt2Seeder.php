<?php

namespace Database\Seeders;

use App\Flow\Models\Gate;
use App\Flow\Models\JobType;
use App\Flow\Models\Phase;
use App\Flow\Models\RiskClass;
use App\Flow\Models\Transition;
use App\Models\ProjectState;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Spatie\Permission\Models\Role;

class FlowAt2Seeder extends Seeder {
    private const ROLES        = ['dev', 'design'];
    private const RISK_CLASSES = [
        ['key' => 'low', 'name' => 'niedrig', 'level' => 1, 'release_required_approvals' => 1],
        ['key' => 'medium', 'name' => 'mittel', 'level' => 2, 'release_required_approvals' => 1],
        ['key' => 'high', 'name' => 'hoch', 'level' => 3, 'release_required_approvals' => 2],
        ['key' => 'critical', 'name' => 'kritisch', 'level' => 4, 'release_required_approvals' => 2],
    ];
    private const PREPARED     = 'prepared';
    private const QUOTED       = 'quoted';
    private const FINISHED     = 'finished';
    private const FAILED       = 'failed';
    private const IGNORED      = 'ignored';
    private const HYPER_CARE   = 'hyper care';
    private const DISCOVERY    = 'discovery';
    private const MVP          = 'mvp';
    private const RUNNING_BLUE = '#135BCD';
    private const PHASES       = [
        ['key' => 'conversion', 'name' => 'Conversion', 'state' => self::PREPARED, 'sort' => 10],
        ['key' => 'discovery', 'name' => 'Discovery', 'state' => self::DISCOVERY, 'sort' => 20],
        ['key' => 'mvp', 'name' => 'MVP', 'state' => self::MVP, 'sort' => 30],
        ['key' => 'care', 'name' => 'Care', 'state' => self::HYPER_CARE, 'sort' => 40],
    ];
    private const GATES = [
        ['phase' => 'discovery', 'key' => 'architecture', 'name' => 'Architektur', 'required_role' => 'dev', 'required_approvals' => 1, 'condition' => ['always' => true], 'sort' => 10],
        ['phase' => 'discovery', 'key' => 'ui', 'name' => 'UI', 'required_role' => 'design', 'required_approvals' => 1, 'condition' => ['always' => true], 'sort' => 20],
        ['phase' => 'mvp', 'key' => 'security', 'name' => 'Sicherheit', 'required_role' => 'dev', 'required_approvals' => 2, 'condition' => ['risk_level_gte' => 2], 'sort' => 10],
        ['phase' => 'mvp', 'key' => 'release', 'name' => 'Release', 'required_role' => 'dev', 'required_approvals' => null, 'condition' => ['always' => true], 'sort' => 20],
        ['phase' => 'care', 'key' => 'architecture', 'name' => 'Architektur', 'required_role' => 'dev', 'required_approvals' => 1, 'condition' => ['always' => true], 'sort' => 5],
        ['phase' => 'care', 'key' => 'security', 'name' => 'Sicherheit', 'required_role' => 'dev', 'required_approvals' => 2, 'condition' => ['risk_level_gte' => 2], 'sort' => 10],
        ['phase' => 'care', 'key' => 'release', 'name' => 'Release', 'required_role' => 'dev', 'required_approvals' => null, 'condition' => ['always' => true], 'sort' => 20],
    ];
    private const TRANSITIONS = [
        [self::PREPARED, self::DISCOVERY],
        [self::QUOTED, self::DISCOVERY],
        [self::DISCOVERY, self::MVP],
        [self::DISCOVERY, self::PREPARED],
        [self::DISCOVERY, self::FAILED],
        [self::DISCOVERY, self::IGNORED],
        [self::MVP, self::HYPER_CARE],
        [self::MVP, self::PREPARED],
        [self::MVP, self::FINISHED],
        [self::MVP, self::FAILED],
        [self::MVP, self::IGNORED],
    ];
    private const CARE_FIX = [
        'key'              => 'care_fix',
        'name'             => 'Care-Fix',
        'description'      => 'Behebt ein gemeldetes Problem in einem Projekt in der Care-Phase: Branch ab base_ref, Fix plus Test, Merge Request. Ergebnis braucht die Release-Freigabe der Care-Phase.',
        'review_gate_keys' => ['release'],
        'input_schema'     => ['fields' => [
            ['key' => 'issue', 'type' => 'url', 'required' => true, 'label' => 'Issue', 'description' => 'Link auf das Issue, das behoben werden soll.'],
            ['key' => 'repo', 'type' => 'url', 'required_without' => 'repos', 'label' => 'Repository', 'description' => 'Clone-URL des Repositories. Pflicht, solange „Repositories“ leer ist.'],
            ['key' => 'base_ref', 'type' => 'string', 'required_without' => 'repos', 'label' => 'Basis', 'description' => 'Branch, Tag oder Commit, von dem aus gearbeitet wird (z. B. master). Pflicht, solange „Repositories“ leer ist.'],
            ['key' => 'repos', 'type' => 'list', 'label' => 'Repositories', 'description' => 'Mehrere Repositories als JSON-Liste, z. B. [{"url": "https://…", "base_ref": "master", "role": "backend"}].', 'fields' => [
                ['key' => 'url', 'type' => 'url', 'required' => true],
                ['key' => 'base_ref', 'type' => 'string', 'required' => true],
                ['key' => 'role', 'type' => 'string'],
            ]],
            ['key' => 'harness_customer_path', 'type' => 'string', 'label' => 'Kunden-Harness', 'description' => 'Pfad zur kundenspezifischen Agenten-Anweisung im Repository.'],
            ['key' => 'harness_internal_path', 'type' => 'string', 'label' => 'Internes Harness', 'description' => 'Pfad zur internen at²-Agenten-Anweisung.'],
            ['key' => 'escalation_rules', 'type' => 'list', 'label' => 'Eskalationsregeln', 'description' => 'Eine Regel pro Zeile; wann der Agent statt zu handeln eine Gate-Anfrage stellt.'],
        ]],
    ];

    public function run(): void {
        DB::transaction(function () {
            foreach (self::ROLES as $role) {
                Role::firstOrCreate(['name' => $role, 'guard_name' => 'api']);
            }

            foreach (self::RISK_CLASSES as $riskClass) {
                RiskClass::updateOrCreate(['key' => $riskClass['key']], $riskClass);
            }

            $states = [
                self::DISCOVERY => $this->runningState(self::DISCOVERY),
                self::MVP       => $this->runningState(self::MVP),
            ] + ProjectState::whereIn('name', [self::PREPARED, self::QUOTED, self::FINISHED, self::FAILED, self::IGNORED, self::HYPER_CARE])->pluck('id', 'name')->all();
            $missing = array_diff([self::PREPARED, self::QUOTED, self::FINISHED, self::FAILED, self::IGNORED, self::HYPER_CARE], array_keys($states));
            if ($missing !== []) {
                throw new RuntimeException('FlowAt2Seeder needs these project states: '.implode(', ', $missing).'.');
            }

            $phases = [];
            foreach (self::PHASES as $phase) {
                $phases[$phase['key']] = Phase::updateOrCreate(['key' => $phase['key']], [
                    'name'             => $phase['name'],
                    'project_state_id' => $states[$phase['state']],
                    'sort'             => $phase['sort'],
                ]);
            }

            foreach (self::GATES as $gate) {
                Gate::updateOrCreate(['phase_id' => $phases[$gate['phase']]->id, 'key' => $gate['key']], [
                    'name'               => $gate['name'],
                    'required_role'      => $gate['required_role'],
                    'required_approvals' => $gate['required_approvals'],
                    'condition'          => $gate['condition'],
                    'sort'               => $gate['sort'],
                ]);
            }

            foreach (self::TRANSITIONS as [$from, $to]) {
                Transition::firstOrCreate(['from_state_id' => $states[$from], 'to_state_id' => $states[$to]], ['active' => true]);
            }

            JobType::updateOrCreate(['key' => self::CARE_FIX['key']], self::CARE_FIX);
        });
    }
    private function runningState(string $name): int {
        return ProjectState::firstOrCreate(['name' => $name], [
            'progress'      => ProjectState::Running,
            'color'         => self::RUNNING_BLUE,
            'is_in_stats'   => true,
            'is_successful' => false,
        ])->id;
    }
}
