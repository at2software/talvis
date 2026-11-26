<?php

namespace Tests\Feature\Invoicing;

use App\Actions\CreateInvoiceAction;
use App\Actions\Project\DuplicateProjectAction;
use App\Actions\UpdateInvoiceStatisticsAction;
use App\Enums\InvoiceItemType;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Project;
use App\Models\ProjectState;
use App\Models\User;
use horstoeko\zugferd\codelists\ZugferdInvoiceType;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectSubscriptionTest extends TestCase {
    use DatabaseTransactions;

    private const PREPARED = 1;
    private const STARTED  = 2;
    private const FINISHED = 3;

    protected function setUp(): void {
        parent::setUp();
        Storage::fake();
    }
    private function userWithRole(string ...$roles): User {
        $user = User::factory()->create();
        $user->assignRole($roles);
        return $user;
    }
    private function projectIn(int $stateId, array $attributes = []): Project {
        $project = Project::factory()->create($attributes);
        if ($stateId !== self::PREPARED) {
            $project->states()->attach($stateId);
        }
        return $project->fresh();
    }
    private function subscription(Project $project, array $attributes = []): InvoiceItem {
        return InvoiceItem::factory()->repeating()->net(99)->create([
            'project_id' => $project->id,
            'text'       => 'Hosting',
            'position'   => 0,
            ...$attributes,
        ]);
    }
    private function runStandingOrders(): void {
        $this->artisan('cron:standing-orders')->assertSuccessful();
    }
    private function generatedItemsOf(Project $project) {
        return InvoiceItem::where('project_id', $project->id)->where('type', InvoiceItemType::Default)->get();
    }
    public static function runningProjectStates(): array {
        return ['hyper care' => [ProjectState::HyperCare], 'started' => [self::STARTED]];
    }
    #[DataProvider('runningProjectStates')]
    public function test_standing_orders_create_project_items_in_the_recurring_stage(int $stateId): void {
        $project  = $this->projectIn($stateId);
        $due      = Carbon::parse('2026-10-01');
        $template = $this->subscription($project, ['next_recurrence_at' => $due]);
        InvoiceItem::factory()->net(10)->create(['project_id' => $project->id, 'stage' => 1, 'position' => 4]);

        $this->runStandingOrders();

        $created = $this->generatedItemsOf($project)->where('stage', 1)->firstWhere('position', 5);
        $this->assertNotNull($created);
        $this->assertSame($project->id, $created->project_id);
        $this->assertNull($created->company_id);
        $this->assertNull($created->invoice_id);
        $this->assertSame(1, (int)$created->stage);
        $this->assertSame(InvoiceItemType::Default, $created->type);
        $this->assertNull($created->next_recurrence_at);
        $this->assertStringStartsWith('Hosting<br>Zeitraum: 01.10.2026 - 31.10.2026', $created->text);
        $this->assertStringNotContainsString($project->name, $created->text);
        $this->assertSame('2026-11-01', $template->fresh()->next_recurrence_at->format('Y-m-d'));
    }
    public function test_standing_orders_of_customers_behave_as_before(): void {
        $company = Company::factory()->create();
        InvoiceItem::factory()->net(10)->create(['company_id' => $company->id, 'position' => 2]);
        $template = InvoiceItem::factory()->repeating()->net(50)->create(['company_id' => $company->id, 'text' => 'Wartung', 'position' => 0, 'next_recurrence_at' => Carbon::parse('2026-10-01')]);

        $this->runStandingOrders();

        $created = InvoiceItem::where('company_id', $company->id)->where('type', InvoiceItemType::Default)->where('text', 'like', 'Wartung%')->sole();
        $this->assertNull($created->project_id);
        $this->assertNull($created->invoice_id);
        $this->assertSame(0, (int)$created->stage);
        $this->assertSame(3, (int)$created->position);
        $this->assertSame('Wartung<br>Zeitraum: 01.10.2026 - 31.10.2026', $created->text);
        $this->assertSame('2026-11-01', $template->fresh()->next_recurrence_at->format('Y-m-d'));
    }
    public function test_subscription_items_are_billed_with_the_recurring_invoice(): void {
        $project = $this->projectIn(ProjectState::HyperCare);
        $this->subscription($project, ['next_recurrence_at' => now()->subDay()]);
        $support = InvoiceItem::factory()->net(20)->create(['project_id' => $project->id, 'stage' => 1]);
        $final   = InvoiceItem::factory()->net(500)->create(['project_id' => $project->id, 'stage' => 0]);
        $this->runStandingOrders();
        $subscriptionItem = $this->generatedItemsOf($project)->where('stage', 1)->firstWhere('text', '!=', $support->text);
        $this->assertNotNull($subscriptionItem);

        $user = $this->userWithRole('invoicing');
        $ids  = collect($this->actingAs($user)->getJson("/api/projects/{$project->id}/invoice-items?support_only=1")->assertOk()->json())->pluck('id');
        $this->assertContains($subscriptionItem->id, $ids);
        $this->assertContains($support->id, $ids);

        $captured = null;
        $this->mock(UpdateInvoiceStatisticsAction::class, fn ($mock) => $mock->shouldReceive('execute'));
        $this->mock(CreateInvoiceAction::class, fn ($mock) => $mock->shouldReceive('execute')->once()->andReturnUsing(
            function ($items, $title, $prefix, $suffix, $company, $documentType) use (&$captured) {
                $captured = ['ids' => collect($items)->pluck('id')->all(), 'type' => $documentType];
                return [Invoice::factory()->for($company)->create(), '%PDF-1.7', 'invoice.pdf'];
            }
        ));

        $this->actingAs($user)->get("/api/projects/{$project->id}/invoice?type=1")->assertOk();

        $this->assertSame(ZugferdInvoiceType::INVOICE, $captured['type']);
        $this->assertEqualsCanonicalizing([$support->id, $subscriptionItem->id], $captured['ids']);
        $this->assertNotNull($subscriptionItem->fresh()->invoice_id);
        $this->assertNull($final->fresh()->invoice_id);
    }
    public function test_projects_with_subscriptions_count_as_having_support_items(): void {
        $withSubscription = $this->projectIn(ProjectState::HyperCare);
        $this->subscription($withSubscription);
        InvoiceItem::factory()->net(99)->create(['project_id' => $withSubscription->id, 'stage' => 1]);

        $withoutSubscription = $this->projectIn(self::STARTED);
        InvoiceItem::factory()->net(99)->create(['project_id' => $withoutSubscription->id, 'stage' => 1]);

        $ids = Project::whereHasSupportItems()->pluck('id');

        $this->assertContains($withSubscription->id, $ids);
        $this->assertNotContains($withoutSubscription->id, $ids);
    }
    public function test_repeating_items_endpoint_lists_only_the_projects_subscriptions(): void {
        $project = $this->projectIn(ProjectState::HyperCare);
        $monthly = $this->subscription($project);
        $yearly  = $this->subscription($project, ['type' => InvoiceItemType::Yearly, 'position' => 1]);
        InvoiceItem::factory()->net(10)->create(['project_id' => $project->id]);
        $this->subscription($this->projectIn(ProjectState::HyperCare));

        $response = $this->actingAs($this->userWithRole('project_manager'))->getJson("/api/projects/{$project->id}/repeating-items")->assertOk();

        $this->assertSame([$monthly->id, $yearly->id], collect($response->json())->pluck('id')->all());
        $this->assertArrayHasKey('next_recurrence_at', $response->json(0));

        $this->actingAs($this->userWithRole('invoicing'))->getJson("/api/projects/{$project->id}/repeating-items")->assertOk();
        $this->actingAs($this->userWithRole('user'))->getJson("/api/projects/{$project->id}/repeating-items")->assertForbidden();
    }
    public static function activationByState(): array {
        return [
            'started'    => [self::STARTED, true],
            'hyper care' => [ProjectState::HyperCare, true],
            'prepared'   => [self::PREPARED, false],
            'finished'   => [self::FINISHED, false],
        ];
    }
    #[DataProvider('activationByState')]
    public function test_new_subscriptions_start_right_away_in_running_projects(int $stateId, bool $active): void {
        $project = $this->projectIn($stateId);

        $item = $this->subscription($project);

        $this->assertSame($active, $item->fresh()->next_recurrence_at !== null);
    }
    public function test_subscriptions_created_via_api_start_right_away(): void {
        $project = $this->projectIn(ProjectState::HyperCare);

        $response = $this->actingAs($this->userWithRole('invoicing'))->postJson('/api/invoice_items', [
            'project_id' => $project->id, 'text' => 'Hosting', 'type' => InvoiceItemType::Monthly->value, 'qty' => 1, 'price' => 99, 'stage' => 0,
        ])->assertSuccessful();

        $this->assertNotNull($response->json('next_recurrence_at'));
    }
    public function test_changing_an_item_to_a_repeating_type_starts_it_in_running_projects(): void {
        $project = $this->projectIn(ProjectState::HyperCare);
        $item    = InvoiceItem::factory()->net(99)->create(['project_id' => $project->id]);

        $item->update(['type' => InvoiceItemType::Monthly]);

        $this->assertNotNull($item->fresh()->next_recurrence_at);
    }
    public function test_paused_subscriptions_stay_paused_and_can_be_reactivated(): void {
        $project = $this->projectIn(ProjectState::HyperCare);
        $item    = $this->subscription($project);
        $user    = $this->userWithRole('invoicing');

        $this->actingAs($user)->putJson("/api/invoice_items/{$item->id}", ['next_recurrence_at' => null])->assertOk();
        $this->assertNull($item->fresh()->next_recurrence_at);

        $this->actingAs($user)->putJson("/api/invoice_items/{$item->id}", ['next_recurrence_at' => '2026-11-20'])->assertOk();
        $this->assertSame('2026-11-20', $item->fresh()->next_recurrence_at->format('Y-m-d'));
    }
    public function test_project_managers_can_pause_subscriptions_of_their_projects(): void {
        $pm      = $this->userWithRole('project_manager');
        $project = $this->projectIn(ProjectState::HyperCare, ['project_manager_id' => $pm->id]);
        $item    = $this->subscription($project);

        $this->actingAs($pm)->putJson("/api/invoice_items/{$item->id}", ['next_recurrence_at' => null])->assertOk();

        $this->assertNull($item->fresh()->next_recurrence_at);
    }
    public function test_project_details_expose_subscription_and_open_item_counters(): void {
        $project = $this->projectIn(ProjectState::HyperCare);
        $this->subscription($project);
        InvoiceItem::factory()->net(10)->create(['project_id' => $project->id, 'stage' => 1]);
        InvoiceItem::factory()->net(10)->create(['project_id' => $project->id, 'stage' => 1]);

        $response = $this->actingAs($this->userWithRole('admin'))->getJson("/api/projects/{$project->id}")->assertOk();

        $this->assertSame(1, $response->json('repeating_items_count'));
        $this->assertSame([0, 2, 0], array_values($response->json('open_items_by_stage')));
    }
    public function test_spawns_reference_their_subscription_item(): void {
        $project  = $this->projectIn(ProjectState::HyperCare);
        $template = $this->subscription($project, ['next_recurrence_at' => Carbon::parse('2026-10-01')]);

        $this->runStandingOrders();

        $spawn = $this->generatedItemsOf($project)->sole();
        $this->assertSame($template->id, $spawn->recurrence_source_id);
        $this->assertSame($template->id, $spawn->recurrenceSource->id);
        $this->assertNull($template->fresh()->recurrence_source_id);
        $this->assertSame([$spawn->id], $template->recurrenceSpawns()->pluck('id')->all());
    }
    public function test_recurrence_source_is_not_mass_assignable_nor_copied(): void {
        $project  = $this->projectIn(ProjectState::HyperCare);
        $template = $this->subscription($project, ['next_recurrence_at' => Carbon::parse('2026-10-01')]);
        $this->runStandingOrders();
        $spawn = $this->generatedItemsOf($project)->sole();

        $this->assertNotContains('recurrence_source_id', (new InvoiceItem)->getFillable());
        $copy = app(DuplicateProjectAction::class)->execute($project->fresh(), 'Kopie');

        $copies = InvoiceItem::where('project_id', $copy->id)->get();
        $this->assertNotNull($copies->firstWhere('text', $spawn->text));
        $this->assertTrue($copies->every(fn (InvoiceItem $_) => $_->recurrence_source_id === null));
        $this->assertSame($template->id, $spawn->fresh()->recurrence_source_id);
    }
}
