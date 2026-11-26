<?php

namespace Database\Seeders;

use App\Models\Project;
use App\Models\Sentinel;
use App\Models\UptimeCheck;
use App\Models\UptimeMonitor;
use App\Models\User;
use App\Models\Vault;
use App\Support\Letterhead;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class DemoExtrasSeeder extends Seeder {
    private const CHECK_DAYS   = 14;
    private const CHECK_STEP   = 15;
    private const MONITORS     = [
        ['name' => 'Customer portal', 'url' => 'https://portal.demo-customer.example/health', 'base' => 180, 'jitter' => 60, 'outage' => null],
        ['name' => 'Online shop', 'url' => 'https://shop.demo-customer.example/', 'base' => 420, 'jitter' => 180, 'outage' => 5],
        ['name' => 'ERP interface', 'url' => 'https://erp.demo-customer.example/api/ping', 'base' => 260, 'jitter' => 90, 'outage' => null],
        ['name' => 'Marketing website', 'url' => 'https://www.demo-customer.example/', 'base' => 140, 'jitter' => 40, 'outage' => null],
        ['name' => 'Mobile app backend', 'url' => 'https://api.demo-app.example/v2/status', 'base' => 310, 'jitter' => 120, 'outage' => null],
        ['name' => 'Staging environment', 'url' => 'https://staging.demo-customer.example/', 'base' => 560, 'jitter' => 250, 'outage' => null],
    ];
    private const VAULTS = [
        'MATTERMOST' => ['ENDPOINT' => 'https://chat.demo-company.example', 'TEAM_ID' => 'demo-team', 'TEAM_NAME' => 'demo', 'LOGIN_ID' => 'talvis-bot', 'PASSWORD' => 'not-a-real-secret', 'TOWN_SQUARE' => 'town-square'],
        'SLACK'      => ['TOKEN' => 'not-a-real-token', 'TOWN_SQUARE' => 'general'],
        'GITLAB'     => ['URL' => 'https://git.demo-company.example', 'TOKEN' => 'not-a-real-token', 'APIKEY' => 'not-a-real-key'],
        'M365'       => ['TENANT_ID' => '00000000-0000-0000-0000-000000000000', 'CLIENT_ID' => '00000000-0000-0000-0000-000000000001', 'CLIENT_SECRET' => 'not-a-real-secret'],
    ];

    public function run(): void {
        mt_srand(20261020);
        DemoSeeder::ensureAllowedEnvironment();
        $this->seedLetterhead();
        $this->seedVaults();
        $this->seedUptime();
        $this->seedSentinels();
        foreach (app()->tagged('demo-seeders') as $seeder) {
            $seeder->run();
        }
    }
    private function seedLetterhead(): void {
        $template = file_get_contents(public_path('pdf/template.html'));
        $template = preg_replace('/(<div class="address-sender">).*?(<\/div>)/s', '$1[senderAddress]$2', $template);
        $template = str_replace('Kempten, [dayNow]', '[place], [dayNow]', $template);
        $template = str_replace('<img src="pdf/at2_logo.png"', '<img src="[logo]"', $template);
        $template = preg_replace('/(<div class="footer-company">).*?(<\/table>)/s', '$1<table><tr><td>[companyContact]</td><td>[companyRegistration]</td><td>[companyBankDetails]</td></tr>$2', $template);
        $css      = str_replace('  width: 25mm;
  height: 17.75362319mm;', '  width: 44mm;
  height: auto;', file_get_contents(public_path('pdf/styles.css')));
        Letterhead::save($template, $css);
        copy(__DIR__.'/demo-assets/nordlicht-logo.png', storage_path('app/pdf/logo.png'));
    }
    private function seedVaults(): void {
        foreach (self::VAULTS as $prefix => $keys) {
            foreach ($keys as $key => $value) {
                Vault::updateOrCreate(['key' => $prefix.'_'.$key], ['value' => $value]);
            }
        }
    }
    private function seedUptime(): void {
        $owner    = User::where('email', DemoSeederData::users()['owner']['email'])->firstOrFail();
        $projects = Project::whereNull('is_internal')->orWhere('is_internal', false)->orderBy('id')->limit(count(self::MONITORS))->pluck('id');
        $now      = Carbon::now()->startOfMinute();

        foreach (self::MONITORS as $index => $data) {
            $monitor = UptimeMonitor::create([
                'name'                    => $data['name'],
                'url'                     => $data['url'],
                'method'                  => 'GET',
                'expected_status_code'    => 200,
                'timeout'                 => 30,
                'response_time_threshold' => 1000,
                'check_interval'          => self::CHECK_STEP * 60,
                'is_active'               => true,
                'created_by_user_id'      => $owner->id,
            ]);
            $monitor->recipients()->attach($owner->id, ['notify_via_email' => true, 'notify_via_chat' => true, 'notify_on_recovery' => true]);
            if (isset($projects[$index])) {
                $monitor->projects()->attach($projects[$index]);
            }

            $rows     = [];
            $outage   = $data['outage'] === null ? null : $now->copy()->subDays($data['outage'])->setTime(3, 0);
            $previous = 'up';
            for ($at = $now->copy()->subDays(self::CHECK_DAYS); $at->lte($now); $at->addMinutes(self::CHECK_STEP)) {
                $down      = $outage && $at->between($outage, $outage->copy()->addMinutes(75));
                $time      = max(40, $data['base'] + mt_rand(-$data['jitter'], $data['jitter']) + (mt_rand(0, 600) === 0 ? mt_rand(900, 1400) : 0));
                $status    = $down ? 'down' : ($time > 1000 ? 'degraded' : 'up');
                $previous  = $status;
                $rows[]    = [
                    'uptime_monitor_id' => $monitor->id,
                    'checked_at'        => $at->toDateTimeString(),
                    'status'            => $status,
                    'response_time'     => $down ? null : $time,
                    'status_code'       => $down ? 503 : 200,
                    'error_message'     => $down ? 'Service Unavailable' : null,
                ];
            }
            foreach (array_chunk($rows, 500) as $chunk) {
                UptimeCheck::insert($chunk);
            }
            $monitor->forceFill(['last_check_at' => $now, 'last_status' => $previous])->save();
        }
    }
    private function seedSentinels(): void {
        $owner = User::where('email', DemoSeederData::users()['owner']['email'])->firstOrFail();
        $rules = [
            [
                'name'             => 'Announce paid invoices',
                'trigger'          => 3,
                'table_name'       => 'invoices',
                'trigger_variable' => 'invoice',
                'condition'        => [[
                    $this->condition('not_null', [['column', 'invoice.paid_at']]),
                    $this->condition('changed', [['column', 'invoice.paid_at']]),
                ]],
                'result'           => [$this->command('slack_post', [['channel_id', 'billing'], ['message', 'Invoice {{invoice.name}} has been paid - {{invoice.gross}} EUR']])],
            ],
            [
                'name'             => 'Kick-off for new projects',
                'trigger'          => 2,
                'table_name'       => 'projects',
                'trigger_variable' => 'project',
                'condition'        => [],
                'result'           => [
                    $this->command('mattermost_post', [['channel_id', 'town-square'], ['message', 'New project created: {{project.name}}']]),
                    [
                        'key'        => 'for_each',
                        'options'    => $this->options([['relation', 'project.assignees'], ['variable', 'member']]),
                        'conditions' => [],
                        'actions'    => [$this->command('mattermost_post', [['channel_id', 'town-square'], ['message', '{{member.name}}, you have been assigned to {{project.name}}']])],
                    ],
                ],
            ],
            [
                'name'             => 'Month-end invoicing reminder',
                'trigger'          => 6,
                'table_name'       => 'invoices',
                'trigger_variable' => null,
                'condition'        => [$this->condition('day_in_month', [['input', '-1']])],
                'result'           => [$this->command('slack_post', [['channel_id', 'billing'], ['message', 'Month end: please review all prepared invoices.']])],
            ],
        ];

        foreach ($rules as $rule) {
            $sentinel = new Sentinel([
                'name'             => $rule['name'],
                'table_name'       => $rule['table_name'],
                'trigger_variable' => $rule['trigger_variable'],
                'condition'        => json_encode($rule['condition']),
                'result'           => json_encode($rule['result']),
                'user_id'          => $owner->id,
            ]);
            $sentinel->trigger = $rule['trigger'];
            $sentinel->save();
            $owner->subscribedSentinels()->attach($sentinel);
        }
    }
    private function options(array $pairs): array {
        return array_map(fn ($_) => ['key' => $_[0], 'value' => $_[1]], $pairs);
    }
    private function condition(string $key, array $pairs): array {
        return ['key' => $key, 'inverted' => false, 'options' => $this->options($pairs)];
    }
    private function command(string $key, array $pairs): array {
        return ['key' => $key, 'options' => $this->options($pairs)];
    }
}
