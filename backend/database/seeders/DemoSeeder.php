<?php

namespace Database\Seeders;

use App\Actions\UpdateInvoiceStatisticsAction;
use App\Enums\CommentType;
use App\Enums\InvoiceItemType;
use App\Enums\MilestoneState;
use App\Enums\VacationState;
use App\Models\CalendarEntry;
use App\Models\Comment;
use App\Models\Company;
use App\Models\CompanyContact;
use App\Models\Contact;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoiceReminder;
use App\Models\LeadSource;
use App\Models\MarketingInitiative;
use App\Models\MarketingProspect;
use App\Models\Milestone;
use App\Models\Param;
use App\Models\Product;
use App\Models\ProductGroup;
use App\Models\Project;
use App\Models\ProjectProjectState;
use App\Models\ProjectState;
use App\Models\User;
use App\Models\Vacation;
use App\Models\VacationGrant;
use App\Models\Vcard;
use Carbon\Carbon;
use Faker\Factory as Faker;
use Faker\Generator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use RuntimeException;

class DemoSeeder extends Seeder {
    public const HISTORY_MONTHS        = 30;
    public const EXISTING_DATA_MESSAGE = 'The database already contains companies or demo data. Run the demo seeder on a freshly migrated database (php artisan demo:seed --fresh).';
    public const ALLOWED_ENVIRONMENTS  = ['local', 'staging', 'testing'];
    private const SEED                 = 20261007;
    private const PREPARED             = 1;
    private const STARTED              = 2;
    private const FINISHED             = 3;
    private const FAILED               = 4;
    private const IGNORED              = 5;
    private const QUOTED               = 6;
    private const LEAD_FAILED          = 7;
    private const BETA_TESTING         = 8;
    private const HYPER_CARE           = 9;
    private const ROLE_DEVELOPER       = 2;

    private ?Generator $faker = null;

    /** @var array<string, User> */
    private array $users = [];

    /** @var array<string, Product> */
    private array $products = [];

    /** @var array<int, array<string, true>>|null */
    private ?array $absences = null;

    /** @var array<int, array<string, true>> */
    private array $holidays = [];

    /** @var array<int, float> */
    private array $invested = [];

    private bool $usersLoaded  = false;
    private ?Project $orga     = null;
    private ?Carbon $start     = null;
    private ?Carbon $end       = null;
    private float $bankBalance = 60000;

    public static function ensureAllowedEnvironment(): void {
        if (! app()->environment(self::ALLOWED_ENVIRONMENTS)) {
            throw new RuntimeException('The demo seeder is disabled in the "'.app()->environment().'" environment.');
        }
    }
    public function run(): void {
        self::ensureAllowedEnvironment();
        if (self::hasExistingData()) {
            throw new RuntimeException(self::EXISTING_DATA_MESSAGE);
        }
        $this->silenceSideEffects();
        mt_srand(self::SEED);
        $this->faker()->seed(self::SEED);

        $this->end   = today();
        $this->start = $this->end->copy()->subMonths(self::HISTORY_MONTHS)->startOfMonth();
        $this->travel($this->start->copy()->subWeeks(2), '09:00');
        $this->foundCompany();

        for ($day = $this->start->copy(); $day->lte($this->end); $day->addDay()) {
            $this->dailyActivity($day->copy());
        }

        Carbon::setTestNow();
        $this->createMarketing();
        $this->createCalendarEntries();
        Company::whereKeyNot($this->me()->id)->get()->each->resetPrecomputedAttributes();
        $this->call(LinearRegressionForecastSeeder::class);
    }
    public function dailyActivity(Carbon $day): void {
        $this->end ??= today();
        $this->start ??= Carbon::parse($this->user('owner')->activeEmployment->started_at)->addWeeks(2);
        $this->travel($day, '07:30');
        $this->hireUsersDueOn($day);
        if ($day->month === 1 && $day->day === 1) {
            $this->startVacationYear($day);
        }
        if (! $this->isWorkday($day)) {
            return;
        }
        if ($day->isSameDay($this->firstWorkdayOfMonth($day))) {
            $this->monthlyRoutine($day);
        }

        $running = $this->logWork($day);
        $this->advanceRunningProjects($day, $running);
        $this->advanceLeads($day);
        $this->generateLeads($day, $running);
        $this->collectPayments($day);
        $this->writeRandomComments($day);
    }

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    public static function hasExistingData(): bool {
        return Company::exists() || User::where('email', DemoSeederData::users()['owner']['email'])->exists();
    }
    private function silenceSideEffects(): void {
        config(['broadcasting.default' => 'null']);
        Bus::fake();
        Mail::fake();
        Notification::fake();
    }
    private function foundCompany(): void {
        foreach (DemoSeederData::params() as $key => $value) {
            Param::put($key, $value);
        }
        Company::updateMe(DemoSeederData::company());
        $this->hire('owner', now());
        User::seedAdmin()?->retireSeedAdmin();
        $this->hire('pm', now());
        Auth::setUser($this->user('owner'));

        $this->createProducts();
        $this->createExpenses();

        $this->orga = $this->me()->createProject('Interne Organisation', null, $this->user('owner')->id);
        $this->orga->update(['is_internal' => true, 'description' => 'Interne Zeiten: Teammeetings, Akquise, Buchhaltung, Weiterbildung']);
        $this->orga->addAssignee($this->user('pm'), self::ROLE_DEVELOPER);
        $this->transition($this->orga, self::STARTED);

        $this->snapshotParams();

        $kickoff = $this->createLead($this->createCustomer(), 'website');
        $this->transition($kickoff, self::QUOTED);
        Project::incrementQuoteNumber();
        $this->travel($this->start, '10:00');
        $this->startProject($kickoff);
    }
    private function hire(string $key, Carbon $day): User {
        $data = DemoSeederData::users()[$key];
        $this->travel($day, '08:00');

        $user = User::register([
            'first_name'  => $data['first'],
            'family_name' => $data['family'],
            'email'       => $data['email'],
            'password'    => DemoSeederData::PASSWORD,
        ]);
        $user->assignWorkingHours($data['hours'], $data['type'], $day->toDateString());
        $user->vcard = $user->vcard->setProperty('TITLE', $data['title'])->setProperty('TEL', $data['phone'], ['type' => 'cell']);
        $user->forceFill(['work_zip' => $data['zip'], 'color' => $data['color']])->save();
        $user->assignRole(...$data['roles']);
        $this->users[$key] = $user;

        $user->grantVacationDays(round(30 * (13 - $day->month) / 12 * 2) / 2);
        $this->planVacations($user, $day);
        return $user;
    }
    private function hireUsersDueOn(Carbon $day): void {
        foreach (DemoSeederData::users() as $key => $data) {
            if (! $this->userExists($key) && $day->gte($this->start->copy()->addMonths($data['hired']))) {
                $this->hire($key, $day);
                $this->orga()->addAssignee($this->users[$key], self::ROLE_DEVELOPER);
            }
        }
    }
    private function createProducts(): void {
        $groups = [];
        foreach (DemoSeederData::productGroups() as $key => $group) {
            $groups[$key] = ProductGroup::create([...$group, 'quote' => '']);
        }
        foreach (DemoSeederData::products() as $key => $data) {
            $product = Product::create([
                'product_group_id' => $groups[$data['group']]->id,
                'name'             => $data['name'],
                'item_number'      => $data['number'],
                'is_active'        => true,
                'is_discountable'  => true,
                'quote'            => '',
            ]);
            InvoiceItem::create([
                'product_id'      => $product->id,
                'text'            => $data['name'],
                'qty'             => 1,
                'price'           => $data['price'],
                'unit_name'       => $data['unit'],
                'vat_rate'        => 19,
                'type'            => $data['type'] ?? InvoiceItemType::Default,
                'is_discountable' => true,
            ]);
            $this->products[$key] = $product;
        }
    }
    private function createExpenses(): void {
        foreach (DemoSeederData::expenses() as $data) {
            $category = ExpenseCategory::firstOrCreate(['name' => $data['category']]);
            (new Expense)->forceFill([
                'name'            => $data['name'],
                'price'           => $data['price'],
                'repeat'          => $data['repeat'],
                'matching_string' => $data['match'],
                'category_id'     => $category->id,
                'starts_at'       => isset($data['months_ago']) ? $this->end->copy()->subMonths($data['months_ago'])->startOfMonth() : $this->start,
                'flags'           => 0,
            ])->save();
        }
    }

    // -------------------------------------------------------------------------
    // Customers & leads
    // -------------------------------------------------------------------------

    private function createCustomer(): Company {
        $data     = DemoSeederData::customers()[$this->customerCount()];
        $faker    = $this->faker();
        $private  = $data['private'] ?? false;
        $domain   = $data['domain'].'.example.com';
        $area     = ltrim($data['area'], '0');
        $email    = $private ? strtolower($this->ascii(explode(' ', $data['name'])[0])).'@'.$domain : 'info@'.$domain;
        $addrType = $private ? 'home' : 'work';
        $vcard    = (new Vcard)->setProperty('FN', $data['name']);
        $private
            ? $vcard->setProperty('N', array_reverse(explode(' ', $data['name'], 2)) + ['', '', '', '', ''])
            : $vcard->setProperty('ORG', $data['name'])->setProperty('URL', 'https://www.'.$domain, ['TYPE' => 'work']);
        $vcard->setProperty('ADR', ['', '', $data['street'], $data['city'], '', $data['zip'], 'DE'], ['TYPE' => $addrType])
            ->setProperty('EMAIL', $email, ['TYPE' => $addrType])
            ->setProperty('TEL', "+49 $area ".$faker->numerify('#######'), ['TYPE' => $addrType])
            ->setProperty('X-LANG', 'de')
            ->setProperty('X-FORMALITY', 'formal');

        $company = Company::create([
            'vcard'           => $vcard,
            'vat_id'          => $private ? null : 'DE'.$faker->numerify('#########'),
            'invoice_email'   => $private ? $email : 'buchhaltung@'.$domain,
            'accepts_support' => ! $private,
            'source_id'       => LeadSource::where('name', $data['source'])->value('id'),
            'source_type'     => LeadSource::class,
        ]);
        Company::assignMissingCustomerNumbers();
        if (isset($data['payment'])) {
            $param        = $company->param('INVOICE_PAYMENT_DURATION');
            $param->value = $data['payment'];
            $param->save();
        }

        $positions = $private ? [] : array_slice(DemoSeederData::contactPositions(), 0, mt_rand(1, 3));
        foreach ($positions as $i => $position) {
            $first   = $faker->firstName();
            $last    = $faker->lastName();
            $contact = Contact::create(['vcard' => Vcard::forName("$first $last")]);
            $cc      = CompanyContact::create([
                'company_id'           => $company->id,
                'contact_id'           => $contact->id,
                'is_invoicing_address' => $i === 0,
                'is_favorite'          => $i === 0,
                'vcard'                => (new Vcard)
                    ->setProperty('EMAIL', strtolower($this->ascii($first).'.'.$this->ascii($last)).'@'.$domain, ['TYPE' => 'work'])
                    ->setProperty('TEL', "+49 $area ".$faker->numerify('#######'), ['TYPE' => 'work'])
                    ->setProperty('TITLE', $position),
            ]);
            if ($i === 0) {
                $company->default_contact_id = $cc->id;
                $company->save();
            }
        }
        return $company->fresh();
    }
    private function customerCount(): int {
        return Company::whereKeyNot($this->me()->id)->count();
    }
    private function isPrivate(Company $company): bool {
        return $company->vcard->getFirstValue('ORG') === null;
    }
    private function createLead(Company $company, ?string $type = null): Project {
        $type ??= $this->isPrivate($company) ? 'private' : $this->pickType($company);
        $config  = DemoSeederData::projectTypes()[$type];
        $manager = mt_rand(1, 100) <= 75 ? $this->user('pm') : $this->user('owner');
        $short   = collect(DemoSeederData::customers())->firstWhere('name', $company->name)['short'] ?? $company->name;
        $name    = $type === 'support' ? $config['name'].' '.now()->year.' '.$short : $config['name'].' '.$short;

        Auth::setUser($manager);
        $project = $company->createProject($name, null, $manager->id);
        Auth::setUser($this->user('owner'));

        Invoice::disablePropagation();
        foreach ($config['items'] as $position => [$productKey, $min, $max, $text]) {
            $template = $this->product($productKey)->invoiceItems()->first();
            InvoiceItem::create([
                'project_id'        => $project->id,
                'product_source_id' => $template->product_id,
                'text'              => $text,
                'qty'               => mt_rand($min, $max),
                'price'             => $template->price,
                'unit_name'         => $template->unit_name,
                'vat_rate'          => $template->vat_rate,
                'type'              => InvoiceItemType::Default,
                'position'          => $position,
                'is_discountable'   => true,
            ]);
        }
        Invoice::enablePropagation();
        $project->propagateDirty();

        $project->update([
            'product_id'       => $this->product($config['items'][0][0])->id,
            'description'      => $config['name'].' für '.$company->name,
            'lead_probability' => mt_rand(3, 8) / 10,
            'remind_at'        => now()->addDays(mt_rand(5, 14)),
        ]);
        return $project->fresh();
    }
    private function pickType(Company $company): string {
        $types = DemoSeederData::projectTypes();
        if (! $company->projects()->whereProgress(ProjectState::Finished)->exists()) {
            unset($types['support']);
        }
        $roll = mt_rand(1, array_sum(array_column($types, 'weight')));
        foreach ($types as $key => $type) {
            if (($roll -= $type['weight']) <= 0) {
                return $key;
            }
        }
        return 'website';
    }
    private function generateLeads(Carbon $day, Collection $running): void {
        $weeklyCapacity = collect($this->activeUsers($day))->sum(fn (User $_) => $_->getHpw() * (1 - $this->orgaShare($_)));
        $backlog        = $running->sum(fn (Project $_) => max(0, $_->work_estimated - $this->invested[$_->id]))
            + 0.5 * Project::whereStateIn([self::PREPARED, self::QUOTED])->get()->sum('work_estimated');
        if ($backlog > $weeklyCapacity * 7 || mt_rand(1, 100) > 35) {
            return;
        }

        $this->travel($day, sprintf('%02d:%02d', mt_rand(9, 16), mt_rand(0, 59)));
        $customers = Company::whereKeyNot($this->me()->id)->get()->reject(fn (Company $_) => $this->isPrivate($_));
        $wantsNew  = $this->customerCount() < count(DemoSeederData::customers()) && ($customers->count() < 4 || mt_rand(1, 100) <= 40);
        $company   = $wantsNew ? $this->createCustomer() : $this->faker()->randomElement($customers->all());
        $lead      = $this->createLead($company);
        $this->comment($lead, 'Erstgespräch geführt, Anforderungen aufgenommen.', $this->user('pm'));
    }
    private function advanceLeads(Carbon $day): void {
        foreach (Project::whereStateIn([self::PREPARED, self::QUOTED])->get() as $project) {
            $since = $this->daysInState($project, $day);
            if ($project->state->id === self::PREPARED) {
                if ($this->roll($project, 'drop', 10) === 0 && $since >= 12) {
                    $this->transition($project, self::LEAD_FAILED);
                } elseif ($this->roll($project, 'drop', 10) !== 0 && $since >= 2 + $this->roll($project, 'quote', 8)) {
                    $this->travel($day, '11:00');
                    $this->transition($project, self::QUOTED);
                    Project::incrementQuoteNumber();
                }
            } elseif ($since >= 5 + $this->roll($project, 'decide', 20)) {
                $this->travel($day, '14:00');
                if ($this->roll($project, 'win', 100) < 68) {
                    $this->startProject($project);
                } else {
                    $this->transition($project, $this->roll($project, 'lost', 5) === 0 ? self::IGNORED : self::LEAD_FAILED);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Project lifecycle
    // -------------------------------------------------------------------------

    private function transition(Project $project, int $stateId): Project {
        $previous       = $project->state;
        $project->state = $stateId;
        $project        = $project->fresh();
        if ($project->state->progress !== $previous->progress) {
            $project->handleStateTransition($previous, Auth::id() ?? $this->user('owner')->id);
        }
        return $project;
    }
    private function startProject(Project $project): void {
        $project   = $this->transition($project, self::STARTED);
        $estimated = $project->work_estimated;
        $devs      = $this->pickDevelopers($project);

        foreach ($project->assignees()->where('assignee_type', User::class)->get() as $assignment) {
            $assignment->update(['hours_planned' => round($estimated * 0.1)]);
        }
        foreach ($devs as $dev) {
            ($project->addAssignee($dev, self::ROLE_DEVELOPER) ?? $project->assignees()->whereAssignee($dev)->first())
                ->update(['hours_planned' => round($estimated * 0.9 / count($devs))]);
        }

        $workdays = (int)ceil($estimated / (6 * count($devs)) * 1.4);
        $project->update(['deadline_at' => $this->addWorkdays(today(), $workdays), 'due_at' => $this->addWorkdays(today(), $workdays + 10)]);

        $project->convertItemsToMilestones();
        $cursor = today();
        foreach ($project->milestones()->orderBy('position')->get() as $i => $milestone) {
            $due = $this->addWorkdays($cursor, max(1, (int)ceil($milestone->duration * 1.4 / count($devs))));
            $milestone->update(['started_at' => $cursor, 'due_at' => $due, 'user_id' => $devs[$i % count($devs)]->id]);
            $cursor = $due;
        }
    }

    /** @return User[] */
    private function pickDevelopers(Project $project): array {
        $sorted = collect($this->activeUsers(today()))
            ->reject(fn (User $_) => $this->userKey($_) === 'owner')
            ->sortBy(fn (User $_) => $_->activeProjects()->count() / max(1, $_->getHpw()))
            ->values();
        return $sorted->take($project->work_estimated > 160 && $sorted->count() > 2 ? 2 : 1)->all();
    }

    /** @return Collection<int, Project> */
    private function logWork(Carbon $day): Collection {
        $running = Project::whereProgress(ProjectState::Running)->where('is_internal', false)->with('assignees')->get()->keyBy('id');
        $items   = InvoiceItem::whereIn('project_id', $running->keys())->where('type', InvoiceItemType::Default)->withSum('foci', 'duration')->orderBy('position')->get()->groupBy('project_id');
        $rows    = [];
        $logged  = [];

        foreach ($this->activeUsers($day) as $user) {
            $hours = $this->hoursOn($user, $day) - (mt_rand(1, 10) <= 3 ? mt_rand(1, 3) / 4 : 0);
            if ($hours <= 0 || $this->isAbsent($user, $day) || $this->callsInSick($user, $day)) {
                continue;
            }
            $projects = $running->filter(fn (Project $_) => $_->assignees->contains(fn ($a) => $a->assignee_type === User::class && $a->assignee_id == $user->id))->values();
            $orga     = $projects->isEmpty() ? $hours : min($hours, $this->quarter($hours * $this->orgaShare($user) * mt_rand(60, 140) / 100));
            $rest     = $hours - $orga;
            $blocks   = [];
            if ($rest > 0) {
                $picked = $this->faker()->randomElements($projects->all(), min(2, $projects->count()));
                foreach ($picked as $i => $project) {
                    $share    = $i === count($picked) - 1 ? $rest : $this->quarter($rest * mt_rand(50, 70) / 100);
                    $blocks[] = [$project, $share];
                    $rest -= $share;
                }
            }
            if ($orga > 0) {
                array_splice($blocks, mt_rand(0, count($blocks)), 0, [[null, $orga]]);
            }

            $clock  = $day->copy()->setTime(8, 0)->addMinutes(mt_rand(0, 6) * 15);
            $worked = 0;
            foreach ($blocks as [$project, $duration]) {
                if ($duration <= 0) {
                    continue;
                }
                $item   = $project ? $this->currentItem($items[$project->id] ?? collect()) : null;
                $endsAt = $clock->copy()->addMinutes((int)round($duration * 60))->toDateTimeString();
                $rows[] = [
                    'user_id'         => $user->id,
                    'parent_type'     => Project::class,
                    'parent_id'       => $project?->id ?? $this->orga()->id,
                    'invoice_item_id' => $item?->id,
                    'started_at'      => $clock->toDateTimeString(),
                    'duration'        => $duration,
                    'comment'         => $item?->text ?? $this->faker()->randomElement(DemoSeederData::orgaTopics()),
                    'is_unpaid'       => false,
                    'flags'           => 0,
                    'created_at'      => $endsAt,
                    'updated_at'      => $endsAt,
                ];
                if ($item) {
                    $item->foci_sum_duration += $duration;
                    $logged[$item->id] = $item;
                }
                $clock->addMinutes((int)round($duration * 60));
                $worked += $duration;
                if ($worked >= 3.5 && $worked - $duration < 3.5) {
                    $clock->addMinutes(45);
                }
            }
        }
        Focus::insert($rows);
        $this->updateMilestones($logged);

        $this->invested = $running->map(fn (Project $_) => (float)($items[$_->id] ?? collect())->sum('foci_sum_duration'))->all();
        return $running;
    }

    private function currentItem(Collection $items): ?InvoiceItem {
        return $items->first(fn (InvoiceItem $_) => $_->foci_sum_duration < $_->assumedWorkload()) ?? $items->last();
    }

    /** @param array<int, InvoiceItem> $items */
    private function updateMilestones(array $items): void {
        foreach ($items as $item) {
            $workload = $item->assumedWorkload();
            $ratio    = $workload > 0 ? $item->foci_sum_duration / $workload : 0;
            Milestone::whereHas('invoiceItems', fn ($_) => $_->whereKey($item->id))->update([
                'progress' => min(100, (int)round($ratio * 100)),
                'state'    => ($ratio >= 1 ? MilestoneState::DONE : MilestoneState::IN_PROGRESS)->value,
            ]);
        }
    }

    private function advanceRunningProjects(Carbon $day, Collection $running): void {
        $this->travel($day, '17:00');
        foreach ($running as $project) {
            $estimated = $project->work_estimated;
            $invested  = $this->invested[$project->id];
            $factor    = 0.85 + $this->roll($project, 'overrun', 45) / 100;
            $flavor    = $this->roll($project, 'flavor', 3);
            $stateId   = $project->state->id;

            if ($stateId === self::STARTED && $this->roll($project, 'fail', 18) === 0 && $invested >= $estimated * 0.45) {
                $this->comment($project, 'Kunde hat das Projekt aus Budgetgründen gestoppt.', $this->user('owner'));
                $this->transition($project, self::FAILED);
            } elseif ($stateId === self::HYPER_CARE) {
                if ($this->daysInState($project, $day) >= 10) {
                    $this->finishProject($project);
                }
            } elseif ($invested >= $estimated * $factor) {
                $flavor === 1 ? $this->transition($project, self::HYPER_CARE) : $this->finishProject($project);
            } elseif ($stateId === self::STARTED && $flavor === 0 && $invested >= $estimated * $factor * 0.8) {
                $this->transition($project, self::BETA_TESTING);
            }
        }
    }
    private function finishProject(Project $project): void {
        $project = $this->transition($project, self::FINISHED);
        $project->milestones()->update(['state' => MilestoneState::DONE->value, 'progress' => 100]);
        $this->createInvoice($project->company, $project->preparedInvoiceItems()->get(), $project);

        $type = collect(DemoSeederData::projectTypes())->first(fn ($_) => str_starts_with($project->name, $_['name'].' '));
        if (($type['hosting'] ?? false) && ! $project->company->repeatingItems()->exists()) {
            $template = $this->product('hosting')->invoiceItems()->first();
            InvoiceItem::create([
                'company_id'         => $project->company_id,
                'product_source_id'  => $template->product_id,
                'text'               => $template->text,
                'qty'                => 1,
                'price'              => $template->price,
                'unit_name'          => $template->unit_name,
                'vat_rate'           => $template->vat_rate,
                'type'               => $template->type,
                'next_recurrence_at' => today()->addMonth()->startOfMonth(),
                'is_discountable'    => true,
            ]);
        }
    }

    // -------------------------------------------------------------------------
    // Invoicing
    // -------------------------------------------------------------------------

    private function createInvoice(Company $company, Collection $items, ?Project $project = null): ?Invoice {
        if ($items->isEmpty()) {
            return null;
        }
        $duration = (int)($project?->param('INVOICE_PAYMENT_DURATION')->value ?: $company->param('INVOICE_PAYMENT_DURATION')->value ?: Param::get('INVOICE_PAYMENT_DURATION')->value);

        Invoice::disablePropagation();
        $invoice = Invoice::create([
            'name'             => Invoice::getCurrentInvoiceNumber()['value'],
            'company_id'       => $company->id,
            'due_at'           => now()->addDays($duration),
            'remind_at'        => now()->addDays($duration),
            'default_interest' => Param::get('INVOICE_OVERDRAFT_INTEREST')->value,
        ]);
        Param::incrementNumber('INVOICE_NO_CURRENT');
        Invoice::batchAssign($items, $invoice->id, null);
        Invoice::enablePropagation();

        $invoice->resetPrecomputedAttributes();
        $company->propagateDirty();
        app(UpdateInvoiceStatisticsAction::class)->execute($company);
        app(UpdateInvoiceStatisticsAction::class)->execute();
        return $invoice;
    }
    private function collectPayments(Carbon $day): void {
        $this->travel($day, '10:30');
        $grace = (int)Param::get('INVOICE_GRACE_PERIOD')->value;
        foreach (Invoice::whereNull('paid_at')->where('is_cancelled', false)->with('company')->get() as $invoice) {
            $late  = collect(DemoSeederData::customers())->firstWhere('name', $invoice->company->name)['late'] ?? false;
            $delay = match (true) {
                $late                                      => 30 + $this->roll($invoice, 'pay', 40),
                $this->roll($invoice, 'slow', 12) === 0    => 70 + $this->roll($invoice, 'pay', 60),
                $this->roll($invoice, 'slow', 12) < 3      => 25 + $this->roll($invoice, 'pay', 30),
                default                                    => 3 + $this->roll($invoice, 'pay', 15),
            };
            if ($invoice->created_at->copy()->addDays($delay)->lte($day)) {
                $invoice->paid_at = now();
                $invoice->save();
                $this->bankBalance += $invoice->gross;
            } elseif (Carbon::parse($invoice->remind_at)->addDays($grace)->lte($day) && $invoice->reminders()->count() < 2) {
                InvoiceReminder::create([
                    'stage'      => $invoice->reminders()->count() + 1,
                    'fee'        => Param::get('INVOICE_REMINDER_FEE')->value,
                    'invoice_id' => $invoice->id,
                ]);
                $invoice->sendReminder();
            }
        }
    }
    private function monthlyRoutine(Carbon $day): void {
        $this->travel($day, '06:00');
        Artisan::call('cron:standing-orders');
        $this->travel($day, '09:00');
        $companyIds = InvoiceItem::whereNull('invoice_id')->whereNull('project_id')->whereNotNull('company_id')->where('type', InvoiceItemType::Default)->distinct()->pluck('company_id');
        foreach (Company::whereKey($companyIds)->get() as $company) {
            $this->createInvoice($company, $company->preparedInvoiceItems()->get());
        }

        $salaries = collect($this->activeUsers($day))->sum(fn (User $_) => $_->getHpw() * 4.33 * 38);
        $this->bankBalance -= $salaries + Expense::where('starts_at', '<=', $day)->get()->sum(fn (Expense $_) => $_->yearlySum() / 12);
        $this->snapshotParams();
        Artisan::call('cron:cashflow');
    }
    private function snapshotParams(): void {
        Param::put('HR_HOURLY_WAGE', round(52 + $this->start->diffInMonths(today(), true) * 0.25, 2));
        Param::put('HR_HPD', 8);
        Param::put('HR_WORKDAYS', $this->workdaysIn(today()));
        Param::put('CASHFLOW_BANK_BALANCE', round($this->bankBalance, 2));
    }

    // -------------------------------------------------------------------------
    // Absences
    // -------------------------------------------------------------------------

    private function startVacationYear(Carbon $day): void {
        foreach ($this->activeUsers($day) as $user) {
            $user->grantVacationDays(30);
            $this->planVacations($user, $day);
        }
    }
    private function planVacations(User $user, Carbon $from): void {
        $year   = $from->year;
        $blocks = [
            [Carbon::create($year, 3, 1)->addWeeks(mt_rand(0, 8))->startOfWeek(), 5],
            [Carbon::create($year, 7, 1)->addWeeks(mt_rand(0, 6))->startOfWeek(), 10],
            [Carbon::create($year, 10, 1)->addWeeks(mt_rand(0, 3))->startOfWeek(), 4],
            [Carbon::create($year, 12, 23), 5],
        ];
        $grant     = $this->currentGrant($user);
        $remaining = $grant->amount + $grant->vacations()->whereIn('state', [VacationState::Approved, VacationState::Open])->sum('amount');
        foreach ($blocks as [$startsAt, $length]) {
            while (! $this->isWorkday($startsAt)) {
                $startsAt->addDay();
            }
            if ($startsAt->lt($from)) {
                continue;
            }
            $endsAt   = $this->addWorkdays($startsAt, $length - 1);
            $future   = $startsAt->gt($this->end->copy()->addDays(7));
            $approved = $future ? null : $from->copy()->addDays(2);
            $hours    = 0;
            for ($d = $startsAt->copy(); $d->lte($endsAt); $d->addDay()) {
                $hours += $this->isWorkday($d) ? $this->hoursOn($user, $d) : 0;
            }
            if ($hours > $remaining) {
                continue;
            }
            $remaining -= $hours;
            Vacation::create([
                'vacation_grant_id' => $grant->id,
                'started_at'        => $startsAt,
                'ended_at'          => $endsAt,
                'amount'            => -$hours,
                'state'             => $future ? VacationState::Open : VacationState::Approved,
                'approved_at'       => $approved,
                'approved_by_id'    => $approved ? $this->user('owner')->id : null,
                'comment'           => $length >= 10 ? 'Sommerurlaub' : 'Urlaub',
                'log'               => '',
            ]);
            if (! $future) {
                $this->markAbsent($user, $startsAt, $endsAt);
            }
        }
    }
    private function callsInSick(User $user, Carbon $day): bool {
        if (mt_rand(1, 1000) > 9) {
            return false;
        }
        $endsAt = $this->addWorkdays($day, mt_rand(0, 3));
        Vacation::create([
            'vacation_grant_id' => $this->currentGrant($user)->id,
            'started_at'        => $day,
            'ended_at'          => $endsAt,
            'amount'            => 0,
            'state'             => VacationState::Sick,
            'approved_by_id'    => $this->user('owner')->id,
            'comment'           => 'Krankmeldung',
            'log'               => '',
        ]);
        $this->markAbsent($user, $day, $endsAt);
        return true;
    }
    private function currentGrant(User $user): VacationGrant {
        return $user->vacation_grants()->where('expires_at', '>', now())->latest('id')->first();
    }
    private function isAbsent(User $user, Carbon $day): bool {
        if ($this->absences === null) {
            $this->absences = [];
            foreach (Vacation::withUserAndGrant()->whereIn('vacations.state', [VacationState::Approved, VacationState::Sick])->get() as $vacation) {
                $this->markAbsent(User::find($vacation->user_id), $vacation->started_at, $vacation->ended_at);
            }
        }
        return isset($this->absences[$user->id][$day->toDateString()]);
    }
    private function markAbsent(User $user, Carbon $from, Carbon $to): void {
        $this->absences ??= [];
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $this->absences[$user->id][$d->toDateString()] = true;
        }
    }

    // -------------------------------------------------------------------------
    // Comments, marketing, calendar
    // -------------------------------------------------------------------------

    private function comment(Company|Project $parent, string $text, User $user): void {
        Comment::create(['text' => $text, 'user_id' => $user->id, 'type' => CommentType::Default, ...$parent->toPoly()]);
    }
    private function writeRandomComments(Carbon $day): void {
        if (mt_rand(1, 100) > 12) {
            return;
        }
        $this->travel($day, sprintf('%02d:%02d', mt_rand(9, 17), mt_rand(0, 59)));
        $author  = $this->faker()->randomElement($this->activeUsers($day));
        $project = $this->faker()->randomElement(Project::whereProgress(ProjectState::Running)->where('is_internal', false)->get()->all() ?: [null]);
        if ($project && mt_rand(0, 1)) {
            $this->comment($project, $this->faker()->randomElement(DemoSeederData::projectNotes()), $author);
        } elseif ($company = $this->faker()->randomElement(Company::whereKeyNot($this->me()->id)->get()->all() ?: [null])) {
            $this->comment($company, $this->faker()->randomElement(DemoSeederData::companyNotes()), $author);
        }
    }
    private function createMarketing(): void {
        $faker     = $this->faker();
        $companies = DemoSeederData::prospectCompanies();
        $member    = $this->user($this->userExists('sophie') ? 'sophie' : 'owner');
        foreach (DemoSeederData::marketingInitiatives() as $data) {
            $startsAt = $this->end->copy()->subMonths($data['starts']);
            $this->travel($startsAt, '10:00');
            $source     = LeadSource::where('name', $data['source'])->first();
            $initiative = MarketingInitiative::create([
                'name'        => $data['name'],
                'description' => $data['description'],
                'status'      => $data['status'],
                'start_date'  => $startsAt,
                'end_date'    => $data['ends'] !== null ? $this->end->copy()->subMonths($data['ends']) : null,
            ]);
            $initiative->channels()->attach($source->id, ['is_primary' => true]);
            $initiative->users()->attach($this->user('owner')->id, ['role' => 'owner']);
            if ($member->isNot($this->user('owner'))) {
                $initiative->users()->attach($member->id, ['role' => 'member']);
            }

            for ($i = 0; $i < $data['prospects']; $i++) {
                $this->travel($startsAt->copy()->addDays(mt_rand(1, 25)), '11:00');
                $first    = $faker->firstName();
                $last     = $faker->lastName();
                $org      = array_shift($companies);
                $email    = strtolower($this->ascii($first).'.'.$this->ascii($last)).'@'.strtolower($this->ascii(explode(' ', $org)[0])).'.example.com';
                $position = $faker->randomElement(DemoSeederData::contactPositions());
                $status   = $data['status'] === 'completed'
                    ? ($i === 0 ? 'converted' : $faker->randomElement(['unresponsive', 'disqualified', 'engaged']))
                    : $faker->randomElement(['new', 'new', 'engaged', 'engaged', 'on_hold', 'unresponsive']);
                (new MarketingProspect)->forceFill(['name' => "$first $last", 'email' => $email, 'company' => $org, 'position' => $position])->fill([
                    'marketing_initiative_id' => $initiative->id,
                    'lead_source_id'          => $source->id,
                    'user_id'                 => $member->id,
                    'vcard'                   => Vcard::forName("$first $last")->setProperty('ORG', $org)->setProperty('TITLE', $position)->setProperty('EMAIL', $email, ['TYPE' => 'work']),
                    'status'                  => $status,
                    'added_via'               => $source->name === 'LinkedIn' ? 'addon' : 'manual',
                    'notes'                   => $status === 'engaged' ? 'Interesse an einem Kennenlerntermin.' : null,
                ])->save();
            }
        }

        $customer = Company::whereKeyNot($this->me()->id)->get()->reject(fn (Company $_) => $this->isPrivate($_))->last();
        MarketingProspect::where('status', 'converted')->first()?->convert(false, $customer->id, null);
        Carbon::setTestNow();
    }
    private function createCalendarEntries(): void {
        $event = fn (string $summary, Carbon $start, Carbon $end, string $rrule = '') => CalendarEntry::create(['vcalendar' => implode("\n", array_filter([
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            'SUMMARY:'.$summary,
            $rrule ? 'RRULE:'.$rrule : null,
            'DTSTART;TZID=Europe/Berlin:'.$start->format('Ymd\THis'),
            'DTEND;TZID=Europe/Berlin:'.$end->format('Ymd\THis'),
            'END:VEVENT',
            'END:VCALENDAR',
        ]))]);
        $jourFixe = $this->start->copy()->next(Carbon::MONDAY)->setTime(9, 30);
        $taxTalk  = $this->end->copy()->addWeeks(2)->next(Carbon::TUESDAY)->setTime(14, 0);
        $fair     = $this->end->copy()->addMonths(2)->next(Carbon::WEDNESDAY)->setTime(9, 0);
        $review   = $this->end->copy()->next(Carbon::FRIDAY)->setTime(13, 0);
        $year     = $this->end->year;

        $event('Jour fixe Team', $jourFixe, $jourFixe->copy()->addMinutes(30), 'FREQ=WEEKLY');
        $event('Steuerberater Quartalsgespräch', $taxTalk, $taxTalk->copy()->addMinutes(90));
        $event('Sommerfest Nordlicht', Carbon::create($year, 7, 17, 17), Carbon::create($year, 7, 17, 23));
        $event('Messe IT-Tage Nord', $fair, $fair->copy()->addDay()->setTime(18, 0));
        $event('Quartalsreview Projekte', $review, $review->copy()->addHours(2));
        $event('Weihnachtsfeier', Carbon::create($year, 12, 11, 18), Carbon::create($year, 12, 11, 23));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function faker(): Generator {
        return $this->faker ??= Faker::create('de_DE');
    }
    private function travel(Carbon $day, string $time): void {
        Carbon::setTestNow($day->copy()->setTimeFromTimeString($time));
    }
    private function me(): Company {
        return Company::me();
    }
    private function orga(): Project {
        return $this->orga ??= $this->me()->projects()->where('is_internal', true)->firstOrFail();
    }
    private function product(string $key): Product {
        return $this->products[$key] ??= Product::where('item_number', DemoSeederData::products()[$key]['number'])->firstOrFail();
    }
    private function user(string $key): User {
        return $this->users[$key] ??= User::where('email', DemoSeederData::users()[$key]['email'])->firstOrFail();
    }
    private function userExists(string $key): bool {
        if (! $this->usersLoaded) {
            $this->usersLoaded = true;
            foreach (DemoSeederData::users() as $k => $data) {
                if ($user = User::where('email', $data['email'])->first()) {
                    $this->users[$k] ??= $user;
                }
            }
        }
        return isset($this->users[$key]);
    }
    private function userKey(User $user): string {
        return (string)array_search($user->getRawOriginal('email'), array_map(fn ($_) => $_['email'], DemoSeederData::users()));
    }
    private function orgaShare(User $user): float {
        return DemoSeederData::users()[$this->userKey($user)]['orga'] ?? 0.1;
    }
    private function hoursOn(User $user, Carbon $day): float {
        return (float)$user->activeEmployment->{strtolower(substr($day->englishDayOfWeek, 0, 2))};
    }

    /** @return User[] */
    private function activeUsers(Carbon $day): array {
        $this->userExists('owner');
        return array_values(array_filter($this->users, fn (User $_) => $_->activeEmployment && $_->activeEmployment->started_at <= $day->toDateString()));
    }

    private function roll(Project|Invoice $model, string $salt, int $modulo): int {
        return crc32($model->id.'-'.$salt) % $modulo;
    }
    private function quarter(float $hours): float {
        return round($hours * 4) / 4;
    }
    private function ascii(string $text): string {
        return str_replace(['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü', ' '], ['ae', 'oe', 'ue', 'ss', 'Ae', 'Oe', 'Ue', '-'], $text);
    }
    private function daysInState(Project $project, Carbon $day): int {
        $since = ProjectProjectState::where('project_id', $project->id)->latest('id')->value('created_at');
        return (int)Carbon::parse($since)->startOfDay()->diffInDays($day->copy()->startOfDay());
    }
    private function isWorkday(Carbon $day): bool {
        return ! $day->isWeekend() && ! isset($this->holidaysOf($day->year)[$day->toDateString()]);
    }

    /** @return array<string, true> */
    private function holidaysOf(int $year): array {
        if (! isset($this->holidays[$year])) {
            $a      = $year % 19;
            $b      = intdiv($year, 100);
            $c      = $year % 100;
            $h      = (19 * $a + $b - intdiv($b, 4) - intdiv($b - intdiv($b + 8, 25) + 1, 3) + 15) % 30;
            $l      = (32 + 2 * ($b % 4) + 2 * intdiv($c, 4) - $h - $c % 4) % 7;
            $m      = intdiv($a + 11 * $h + 22 * $l, 451);
            $easter = Carbon::create($year, intdiv($h + $l - 7 * $m + 114, 31), ($h + $l - 7 * $m + 114) % 31 + 1);
            $dates  = ["$year-01-01", "$year-05-01", "$year-10-03", "$year-10-31", "$year-12-25", "$year-12-26"];
            foreach ([-2, 1, 39, 50] as $offset) {
                $dates[] = $easter->copy()->addDays($offset)->toDateString();
            }
            $this->holidays[$year] = array_fill_keys($dates, true);
        }
        return $this->holidays[$year];
    }

    private function addWorkdays(Carbon $from, int $days): Carbon {
        $date = $from->copy();
        while ($days > 0) {
            $date->addDay();
            $days -= $this->isWorkday($date) ? 1 : 0;
        }
        return $date;
    }
    private function firstWorkdayOfMonth(Carbon $day): Carbon {
        $date = $day->copy()->startOfMonth();
        while (! $this->isWorkday($date)) {
            $date->addDay();
        }
        return $date;
    }
    private function workdaysIn(Carbon $month): int {
        $count = 0;
        for ($d = $month->copy()->startOfMonth(); $d->month === $month->month; $d->addDay()) {
            $count += $this->isWorkday($d) ? 1 : 0;
        }
        return $count;
    }
}
