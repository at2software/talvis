<?php

namespace Database\Seeders;

use App\Actions\UpdateInvoiceStatisticsAction;
use App\Enums\InvoiceItemType;
use App\Enums\MilestoneState;
use App\Models\AssignmentRole;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Project;
use App\Models\User;
use App\Models\WebhookEndpoint;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DemoPolishSeeder extends Seeder {
    private const RUNNING_PROJECT_STATE = 2;
    private const LEAD_NAMES            = ['Customer Portal', 'Mobile App', 'Online Shop', 'ERP Integration', 'Website Relaunch', 'Data Platform', 'Digital Consulting'];
    private const NEW_INVOICES          = [
        ['age' => 2, 'text' => 'Change request: reporting dashboard', 'qty' => 38, 'price' => 105, 'unit' => 'h'],
        ['age' => 4, 'text' => 'Extension: SSO integration', 'qty' => 6, 'price' => 840, 'unit' => 'PD'],
        ['age' => 6, 'text' => 'Additional screen design', 'qty' => 64, 'price' => 95, 'unit' => 'h'],
        ['age' => 9, 'text' => 'Performance optimization', 'qty' => 22, 'price' => 105, 'unit' => 'h'],
        ['age' => 11, 'text' => 'Release support & hypercare', 'qty' => 90, 'price' => 110, 'unit' => 'h'],
    ];
    private const PREPARED_ITEMS = [
        ['text' => 'Post-launch adjustments', 'qty' => 18, 'price' => 105, 'unit' => 'h'],
        ['text' => 'Training sessions for the team', 'qty' => 3, 'price' => 1150, 'unit' => 'PD'],
        ['text' => 'Additional interface mapping', 'qty' => 2, 'price' => 840, 'unit' => 'PD'],
        ['text' => 'Documentation update', 'qty' => 26, 'price' => 95, 'unit' => 'h'],
    ];
    private const INITIATIVE_FLOWS = [
        ['name' => 'Trade Fair Follow-up', 'steps' => [['Send thank-you message', 0], ['Share event recap', 3], ['Book discovery call', 7], ['Send proposal', 14]]],
        ['name' => 'LinkedIn Outreach Cadence', 'steps' => [['Connection request', 0], ['Intro message', 2], ['Share case study', 6], ['Follow-up call', 10]]],
        ['name' => 'Newsletter Nurture', 'steps' => [['Welcome email', 0], ['Product update', 5], ['Customer story', 12]]],
    ];

    public function run(): void {
        DemoSeeder::ensureAllowedEnvironment();
        mt_srand(20261021);
        $this->translateGeneratedTexts();
        $this->staggerVacations();
        $this->fixCalendar();
        $this->spreadOwnerFocus();
        $this->arrangeProjects();
        $this->settleInvoices();
        $this->addPreparedItems();
        $this->seedPreparedHistory();
        $this->renameLeads();
        $this->polishMarketing();
        $this->todaysActivities();
        $this->assignAccountManagers();
        $this->configureCompany();
        $this->configureDashboard();
    }
    private function owner(): User {
        return User::where('email', DemoSeederData::users()['owner']['email'])->firstOrFail();
    }
    private function runningProjects() {
        return Project::whereIn('id', DB::table('project_project_state as pp')
            ->where('pp.project_state_id', self::RUNNING_PROJECT_STATE)
            ->whereRaw('pp.id = (select max(id) from project_project_state where project_id = pp.project_id)')
            ->pluck('pp.project_id'))
            ->where('is_internal', false)
            ->orderBy('id')
            ->get();
    }
    private function translateGeneratedTexts(): void {
        DB::table('comments')->where('text', 'Projekt beginnt')->update(['text' => 'Project started']);
        DB::table('comments')->where('text', 'Projekt beendet. Gute Arbeit.')->update(['text' => 'Project finished. Great work.']);
        DB::table('vacation_grants')->where('name', 'like', 'Urlaubsanspruch %')->update(['name' => DB::raw("REPLACE(name, 'Urlaubsanspruch', 'Annual leave')")]);
    }
    private function staggerVacations(): void {
        $today   = today();
        $perUser = [
            'tim'    => [[$today->copy()->subDays(1), 4]],
            'pm'     => [[$today->copy()->subDays(7), 4]],
            'sophie' => [[$today->copy()->addDays(2), 2]],
            'lea'    => [[$today->copy()->addDays(9), 5]],
            'owner'  => [[$today->copy()->addDays(16), 5], [Carbon::create($today->year, 12, 28), 3]],
        ];
        $hoursPerDay = ['owner' => 8, 'pm' => 8, 'lea' => 8, 'tim' => 7.5, 'sophie' => 5];
        $users       = DemoSeederData::users();
        $approver    = $this->owner()->id;

        foreach ($perUser as $key => $blocks) {
            $user  = User::where('email', $users[$key]['email'])->firstOrFail();
            $grant = DB::table('vacation_grants')->where('user_id', $user->id)->where('expires_at', '>', $today)->orderByDesc('id')->first();
            DB::table('vacations as v')->join('vacation_grants as g', 'g.id', '=', 'v.vacation_grant_id')->where('g.user_id', $user->id)
                ->where('v.state', '!=', 3)->where('v.ended_at', '>=', $today->copy()->subDays(21))->delete();
            foreach ($blocks as [$start, $days]) {
                $start = $start->copy();
                while ($start->isWeekend()) {
                    $start->addDay();
                }
                $end  = $start->copy();
                $left = $days - 1;
                while ($left > 0) {
                    $end->addDay();
                    if (! $end->isWeekend()) {
                        $left--;
                    }
                }
                $approved = true;
                DB::table('vacations')->insert([
                    'vacation_grant_id' => $grant->id,
                    'started_at'        => $start->toDateString(),
                    'ended_at'          => $end->toDateString(),
                    'amount'            => -$days * $hoursPerDay[$key],
                    'state'             => $approved ? 1 : 0,
                    'approved_at'       => $approved ? $today->copy()->subDays(10) : null,
                    'approved_by_id'    => $approved ? $approver : null,
                    'comment'           => 'Vacation',
                    'log'               => '',
                    'created_at'        => now(),
                    'updated_at'        => now(),
                ]);
            }
        }
    }
    private function fixCalendar(): void {
        $review = DB::table('calendar_entries')->where('vcalendar', 'like', '%SUMMARY:Quarterly project review%')->first();
        if ($review) {
            $day = today()->next(Carbon::THURSDAY)->addWeek();
            DB::table('calendar_entries')->where('id', $review->id)->update(['vcalendar' => implode("\n", [
                'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:'.substr(hash('sha256', 'Quarterly project review'), 0, 32).'@nordlicht-software.example.com', 'SUMMARY:Quarterly project review',
                'DTSTART;TZID=Europe/Berlin:'.$day->copy()->setTime(13, 0)->format('Ymd\THis'),
                'DTEND;TZID=Europe/Berlin:'.$day->copy()->setTime(15, 0)->format('Ymd\THis'),
                'END:VEVENT', 'END:VCALENDAR',
            ])]);
        }
        $extra = [
            ['Client workshop Hanse Versicherung', today()->addDays(3)->setTime(10, 0), 150],
            ['Design review', today()->addDays(6)->setTime(14, 0), 60],
            ['Sprint planning', today()->addDays(1)->setTime(9, 0), 60],
        ];
        foreach ($extra as [$summary, $start, $minutes]) {
            DB::table('calendar_entries')->insert(['created_at' => now(), 'updated_at' => now(), 'vcalendar' => implode("\n", [
                'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:'.substr(hash('sha256', $summary), 0, 32).'@nordlicht-software.example.com', 'SUMMARY:'.$summary,
                'DTSTART;TZID=Europe/Berlin:'.$start->format('Ymd\THis'),
                'DTEND;TZID=Europe/Berlin:'.$start->copy()->addMinutes($minutes)->format('Ymd\THis'),
                'END:VEVENT', 'END:VCALENDAR',
            ])]);
        }
    }
    private function spreadOwnerFocus(): void {
        $owner   = $this->owner();
        $running = $this->runningProjects();
        if ($running->isEmpty()) {
            return;
        }
        $orga    = Project::where('is_internal', true)->value('id');
        $targets = $running->take(4)->values();
        foreach ($targets as $project) {
            Project::find($project->id)->addAssignee($owner, AssignmentRole::DEVELOPER);
        }
        $rows = DB::table('foci')->where('user_id', $owner->id)->where('parent_type', Project::class)->where('parent_id', $orga)
            ->where('started_at', '>=', now()->subDays(75))->orderBy('id')->get(['id', 'started_at']);
        foreach ($rows as $index => $row) {
            if ($index % 5 < 3) {
                DB::table('foci')->where('id', $row->id)->update(['parent_id' => $targets[$index % $targets->count()]->id, 'invoice_item_id' => null]);
            }
        }
    }
    private function arrangeProjects(): void {
        $today = today();
        foreach ($this->runningProjects() as $project) {
            $milestones = DB::table('milestones')->where('project_id', $project->id)->orderBy('position')->orderBy('id')->get();
            $items      = InvoiceItem::where('project_id', $project->id)->where('type', InvoiceItemType::Default)->orderBy('position')->get()->values();
            $count      = $milestones->count();
            if ($count === 0 || $items->count() !== $count) {
                continue;
            }
            $running = min(max(1, (int)floor($count * 0.4)), $count - 1);
            $hours   = fn (InvoiceItem $_) => (float)$_->qty * (in_array($_->unit_name, ['PD', 'PT'], true) ? 8 : 1);

            $foci     = DB::table('foci')->where('parent_type', Project::class)->where('parent_id', $project->id)->orderBy('started_at')->get(['id', 'duration']);
            $invested = (float)$foci->sum('duration');
            $done     = $items->take($running)->sum($hours);
            $current  = $hours($items[$running]);
            $future   = $items->slice($running + 1)->sum($hours);
            $factor   = $invested / max(1, 0.93 * $done + 0.55 * $current);
            $g        = max(0.3, min(3, ($invested / 0.72 - $factor * ($done + $current)) / max(1, $future)));

            Invoice::disablePropagation();
            foreach ($items as $i => $item) {
                $item->update(['qty' => max(1, ceil($item->qty * ($i <= $running ? $factor : $g)))]);
            }
            Invoice::enablePropagation();
            $items = InvoiceItem::where('project_id', $project->id)->where('type', InvoiceItemType::Default)->orderBy('position')->get()->values();

            $length   = fn (int $i) => (int)ceil(ceil($hours($items[$i]) / (8 * 0.85)) * 7 / 5) + 1;
            $runStart = $today->copy()->subDays((int)round($length($running) * 0.45));
            $blocks   = [$running => [$runStart, $runStart->copy()->addDays($length($running))]];
            for ($i = $running - 1; $i >= 0; $i--) {
                $end        = $blocks[$i + 1][0]->copy();
                $blocks[$i] = [$end->copy()->subDays($length($i)), $end];
            }
            for ($i = $running + 1; $i < $count; $i++) {
                $start      = $blocks[$i - 1][1]->copy();
                $blocks[$i] = [$start, $start->copy()->addDays($length($i))];
            }
            foreach ($milestones as $i => $milestone) {
                [$start, $end] = $blocks[$i];
                DB::table('milestones')->where('id', $milestone->id)->update([
                    'started_at' => $start->toDateString(),
                    'due_at'     => $end->toDateString(),
                    'duration'   => max(1, $start->diffInWeekdays($end)),
                    'progress'   => $i < $running ? 100 : ($i === $running ? 60 : 0),
                    'state'      => ($i < $running ? MilestoneState::DONE : ($i === $running ? MilestoneState::IN_PROGRESS : MilestoneState::TODO))->value,
                ]);
            }

            DB::table('projects')->where('id', $project->id)->update(['due_at' => $blocks[$count - 1][1]->copy()->addDays(7)->toDateString()]);

            $cursor    = 0;
            $remaining = 0.0;
            foreach ($foci as $focus) {
                while ($cursor < $running && $remaining + $focus->duration > 0.93 * $hours($items[$cursor])) {
                    $cursor++;
                    $remaining = 0.0;
                }
                $remaining += $focus->duration;
                DB::table('foci')->where('id', $focus->id)->update(['invoice_item_id' => $items[min($cursor, $running)]->id]);
            }
            Project::find($project->id)->propagateDirty();
        }
    }
    private function seedPreparedHistory(): void {
        $paramId = DB::table('params')->where('key', 'CASHFLOW_INVOICES_PREPARED')->value('id');
        if (! $paramId) {
            return;
        }
        $rows  = DB::table('float_params')->where('param_id', $paramId)->orderBy('created_at')->get(['id']);
        $count = $rows->count();
        foreach ($rows as $index => $row) {
            $trend = 3200 + 6300 * ($index / max(1, $count - 1));
            DB::table('float_params')->where('id', $row->id)->update(['value' => $index === $count - 1 ? 9490 : round($trend + mt_rand(-1800, 1800), 2)]);
        }
    }
    private function settleInvoices(): void {
        $today = today();
        foreach (DB::table('invoices')->whereNull('paid_at')->where('due_at', '<', $today)->get(['id', 'due_at']) as $invoice) {
            DB::table('invoices')->where('id', $invoice->id)->update(['paid_at' => Carbon::parse($invoice->due_at)->addDays(mt_rand(0, 5))->min($today)]);
        }
        $finished = Project::whereFinishedSuccessfull()->where('is_internal', false)->orderByDesc('id')->get();
        $finished = $finished->values();
        $offset   = count(self::PREPARED_ITEMS);

        foreach (self::NEW_INVOICES as $index => $data) {
            $project = $finished[$offset + $index] ?? null;
            if (! $project) {
                continue;
            }
            $company = Company::find($project->company_id);
            $invoice = $this->invoiceFor($project, $company, $data);
            DB::table('invoices')->where('id', $invoice->id)->update([
                'created_at' => $today->copy()->subDays($data['age'])->setTime(10, 30),
                'due_at'     => $today->copy()->subDays($data['age'])->addDays(14),
                'remind_at'  => $today->copy()->subDays($data['age'])->addDays(14),
            ]);
        }
    }
    private function invoiceFor(Project $project, Company $company, array $data): Invoice {
        Invoice::disablePropagation();
        $item    = $this->item($project, $data);
        $invoice = Invoice::create([
            'name'             => Invoice::getCurrentInvoiceNumber()['value'],
            'company_id'       => $company->id,
            'due_at'           => now()->addDays(14),
            'remind_at'        => now()->addDays(14),
            'default_interest' => Param::get('INVOICE_OVERDRAFT_INTEREST')->value,
        ]);
        Param::incrementNumber('INVOICE_NO_CURRENT');
        Invoice::batchAssign(collect([$item]), $invoice->id, null);
        Invoice::enablePropagation();
        $invoice->resetPrecomputedAttributes();
        $company->propagateDirty();
        app(UpdateInvoiceStatisticsAction::class)->execute($company);
        app(UpdateInvoiceStatisticsAction::class)->execute();
        return $invoice;
    }
    private function item(Project $project, array $data): InvoiceItem {
        $template = InvoiceItem::where('project_id', $project->id)->orderBy('position')->first();
        return InvoiceItem::create([
            'project_id'        => $project->id,
            'product_source_id' => $template?->product_source_id,
            'text'              => $data['text'],
            'qty'               => $data['qty'],
            'price'             => $data['price'],
            'unit_name'         => $data['unit'],
            'vat_rate'          => $template?->vat_rate ?? 19,
            'type'              => InvoiceItemType::Default,
            'position'          => ($template ? InvoiceItem::where('project_id', $project->id)->max('position') : 0) + 1,
            'is_discountable'   => true,
        ]);
    }
    private function addPreparedItems(): void {
        $finished = Project::whereFinishedSuccessfull()->where('is_internal', false)->orderByDesc('id')->get()->values();
        Invoice::disablePropagation();
        foreach (self::PREPARED_ITEMS as $index => $data) {
            if (isset($finished[$index])) {
                $this->item($finished[$index], $data);
            }
        }
        Invoice::enablePropagation();
        foreach (array_slice($finished->all(), 0, count(self::PREPARED_ITEMS)) as $project) {
            $project->propagateDirty();
        }
    }
    private function renameLeads(): void {
        $leads = DB::table('project_project_state as pp')->whereIn('pp.project_state_id', [1, 6])
            ->whereRaw('pp.id = (select max(id) from project_project_state where project_id = pp.project_id)')
            ->join('projects as p', 'p.id', '=', 'pp.project_id')->where('p.is_internal', false)->orderByDesc('p.id')->get(['p.id', 'p.company_id']);
        $customers = collect(DemoSeederData::customers());
        foreach ($leads as $index => $lead) {
            $company = Company::find($lead->company_id)?->name;
            $short   = $customers->firstWhere('name', $company)['short'] ?? $company;
            DB::table('projects')->where('id', $lead->id)->update(['name' => self::LEAD_NAMES[$index % count(self::LEAD_NAMES)].' '.$short]);
        }
    }
    private function polishMarketing(): void {
        $users     = DemoSeederData::users();
        $teamIds   = [
            User::where('email', $users['sophie']['email'])->value('id'),
            User::where('email', $users['owner']['email'])->value('id'),
            User::where('email', $users['pm']['email'])->value('id'),
        ];
        $prospects = DB::table('marketing_prospects')->orderBy('id')->get(['id', 'marketing_initiative_id']);
        $sources   = [3, 1, 2, 4, 3, 1, 1, 2, 3, 4, 1, 3, 2, 5, 5];
        $ages      = [20, 42, 55, 68, 80, 9, 14, 19, 24, 28, 2, 4, 6, 36, 100];
        $converted = [0 => 12, 3 => 25, 6 => 5, 7 => 38];

        foreach ($prospects as $i => $prospect) {
            $row = [
                'lead_source_id' => $sources[$i % count($sources)],
                'user_id'        => $teamIds[$i % count($teamIds)],
                'created_at'     => now()->subDays($ages[$i % count($ages)]),
            ];
            if (isset($converted[$i])) {
                $row['status']     = 'converted';
                $row['updated_at'] = now()->subDays($converted[$i]);
            } elseif (in_array($i, [1, 4, 8, 10, 12, 13], true)) {
                $row['status'] = 'engaged';
            } elseif (in_array($i, [2, 5, 9, 11, 14], true)) {
                $row['status'] = 'new';
            }
            DB::table('marketing_prospects')->where('id', $prospect->id)->update($row);
        }

        $initiatives = DB::table('marketing_initiatives')->orderBy('id')->pluck('id')->all();
        $workflowIds = [];
        $steps       = [];
        foreach (self::INITIATIVE_FLOWS as $index => $flow) {
            $workflowId   = DB::table('marketing_workflows')->insertGetId(['name' => $flow['name'], 'description' => null, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
            $initiativeId = $initiatives[$index] ?? $initiatives[0];
            foreach ($flow['steps'] as $position => [$name, $offset]) {
                $steps[$initiativeId][] = DB::table('marketing_initiative_activities')->insertGetId([
                    'marketing_initiative_id' => $initiativeId,
                    'marketing_workflow_id'   => $workflowId,
                    'name'                    => $name,
                    'day_offset'              => $offset,
                    'is_required'             => true,
                    'has_external_dependency' => false,
                    'created_at'              => now(),
                    'updated_at'              => now(),
                ]);
            }
            $workflowIds[$initiativeId] = $workflowId;
        }

        foreach (DB::table('marketing_prospects')->where('status', 'converted')->get(['id', 'marketing_initiative_id']) as $n => $prospect) {
            foreach ($steps[$prospect->marketing_initiative_id] ?? $steps[array_key_first($steps)] as $s => $stepId) {
                $scheduled = now()->subDays(34 - $n * 3 - $s * 3)->setTime(10, 0);
                DB::table('marketing_prospect_activities')->insert([
                    'marketing_prospect_id' => $prospect->id, 'marketing_initiative_activity_id' => $stepId, 'scheduled_at' => $scheduled,
                    'completed_at'          => $scheduled->copy()->addHours(2), 'status' => 'completed', 'bumps' => 0, 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        $open = DB::table('marketing_prospects')->whereIn('status', ['new', 'engaged'])->orderBy('id')->get(['id', 'marketing_initiative_id']);
        foreach ($open as $n => $prospect) {
            $initiativeSteps = $steps[$prospect->marketing_initiative_id] ?? $steps[array_key_first($steps)];
            $done            = $n % 3 === 0 ? 2 : 1;
            foreach ($initiativeSteps as $s => $stepId) {
                $isDone    = $s < $done;
                $scheduled = $isDone ? now()->subDays(mt_rand(3, 24) - $s)->setTime(mt_rand(9, 16), 0) : today()->addDays(($n + $s) % 7)->setTime(20, 0);
                DB::table('marketing_prospect_activities')->insert([
                    'marketing_prospect_id'            => $prospect->id,
                    'marketing_initiative_activity_id' => $stepId,
                    'scheduled_at'                     => $scheduled,
                    'completed_at'                     => $isDone ? $scheduled->copy()->addHours(2) : null,
                    'status'                           => $isDone ? 'completed' : 'pending',
                    'bumps'                            => 0,
                    'created_at'                       => now(),
                    'updated_at'                       => now(),
                ]);
            }
        }
    }
    private function todaysActivities(): void {
        $stepId = DB::table('marketing_initiative_activities')->orderBy('id')->value('id');
        foreach (DB::table('marketing_prospects')->whereIn('status', ['new', 'engaged'])->limit(2)->pluck('id') as $i => $prospectId) {
            DB::table('marketing_prospect_activities')->insert([
                'marketing_prospect_id' => $prospectId, 'marketing_initiative_activity_id' => $stepId,
                'scheduled_at'          => today()->setTime(0, 15 + $i * 10), 'completed_at' => today()->setTime(0, 30 + $i * 10),
                'status'                => 'completed', 'bumps' => 0, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }
    private function assignAccountManagers(): void {
        $users = DemoSeederData::users();
        $pm    = User::where('email', $users['pm']['email'])->firstOrFail();
        $owner = $this->owner();
        $me    = Company::me()?->id;
        Company::all()->filter(fn (Company $_) => $_->id !== $me)->values()->each(function (Company $company, int $index) use ($pm, $owner) {
            $company->addAssignee($index % 3 === 0 ? $owner : $pm, AssignmentRole::DEVELOPER);
        });
    }
    private function configureCompany(): void {
        $webhook = WebhookEndpoint::create(['name' => 'Accounting system', 'url' => 'https://hooks.accounting.demo-company.example/talvis', 'is_active' => true, 'created_by_id' => $this->owner()->id]);
        $webhook->forceFill(['last_delivered_at' => now()->subHours(3)])->save();
        Param::put('INVOICE_PREFIX', 'Thank you for your order. We invoice the following services:');
        Param::put('INVOICE_SUFFIX', 'Please transfer the amount within 14 days of the invoice date, quoting the invoice number. Thank you for your trust.');
        $me = Company::me()?->id;
        foreach (Company::all()->filter(fn (Company $_) => $_->id !== $me) as $company) {
            $raw   = (string)DB::table('companies')->where('id', $company->id)->value('vcard');
            $lines = array_values(array_filter(preg_split('/?
/', $raw), fn ($l) => ! preg_match('/^X-(LANG|FORMALITY):/', $l)));
            array_splice($lines, array_search('END:VCARD', $lines), 0, ['X-LANG:en', 'X-FORMALITY:formal']);
            DB::table('companies')->where('id', $company->id)->update(['vcard' => implode('
', $lines)]);
        }
        $featured = Company::all()->first(fn (Company $_) => $_->name === 'Stadtwerke Quickborn GmbH');
        if ($featured) {
            $prospects = DB::table('marketing_prospects')->whereIn('status', ['new', 'engaged'])->orderBy('id')->limit(3)->pluck('id');
            DB::table('marketing_prospects')->whereIn('id', $prospects)->update(['company_id' => $featured->id, 'company_contact_id' => $featured->default_contact_id]);
        }
    }
    private function configureDashboard(): void {
        $owner  = $this->owner();
        $layout = json_decode($owner->ensureDefaultDashboard());
        foreach ($layout as $dashboard) {
            foreach ($dashboard->cols as $c => $col) {
                $dashboard->cols[$c] = collect($col)->map(fn ($w) => $w->widget === 'widget-revenue-monthly' ? (object)['widget' => 'widget-uptime-monitors', 'options' => (object)[]] : $w)->values()->all();
            }
        }
        $param        = $owner->param('DASHBOARDS');
        $param->value = json_encode($layout);
        $param->save();
    }
}
