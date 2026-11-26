<?php

namespace Tests\Feature\Invoicing;

use App\Models\Company;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class LinkFociToInvoiceItemTest extends TestCase {
    use DatabaseTransactions;

    protected function setUp(): void {
        parent::setUp();
        Storage::fake();
    }
    private function userWithRole(string ...$roles): User {
        $user = User::factory()->create();
        $user->assignRole($roles);
        return $user;
    }
    private function pm(): User {
        return $this->userWithRole('project_manager');
    }
    private function focusOf(Model $parent, array $attributes = []): Focus {
        return Focus::factory()->forParent($parent)->create(['duration' => 1.5, ...$attributes]);
    }
    private function openItemOf(Project $project, array $attributes = []): InvoiceItem {
        return InvoiceItem::factory()->net(250)->create(['project_id' => $project->id, 'stage' => 1, ...$attributes]);
    }
    private function link(Model $parent, array $focusIds, int|string $itemId, ?User $user = null) {
        return $this->actingAs($user ?? $this->pm())->postJson('/api/foci/link-item/'.$parent->getTable().'/'.$parent->id, [
            'itemIds'       => array_map('strval', $focusIds),
            'invoiceItemId' => (string)$itemId,
        ]);
    }
    private function uninvoicedIds(Model $parent): array {
        return collect($this->actingAs($this->pm())->getJson('/api/foci/uninvoiced/'.$parent->getTable().'/'.$parent->id)->assertOk()->json())->pluck('id')->all();
    }
    public function test_links_foci_of_a_project_without_changing_the_item(): void {
        $project = Project::factory()->create();
        $item    = $this->openItemOf($project);
        $before  = $item->fresh()->only(['qty', 'price', 'net']);
        $a       = $this->focusOf($project);
        $b       = $this->focusOf($project);
        $other   = $this->focusOf($project);

        $this->link($project, [$a->id, $b->id], $item->id)->assertOk()->assertJsonPath('id', $item->id);

        $this->assertSame($item->id, $a->fresh()->invoiced_in_item_id);
        $this->assertSame($item->id, $b->fresh()->invoiced_in_item_id);
        $this->assertNull($other->fresh()->invoiced_in_item_id);
        $this->assertEquals($before, $item->fresh()->only(['qty', 'price', 'net']));
        $this->assertEqualsCanonicalizing([$other->id], $this->uninvoicedIds($project));
    }
    public function test_links_foci_of_a_company(): void {
        $company = Company::factory()->create();
        $item    = InvoiceItem::factory()->net(80)->create(['company_id' => $company->id]);
        $before  = $item->fresh()->only(['qty', 'price', 'net']);
        $a       = $this->focusOf($company);
        $b       = $this->focusOf($company);

        $this->link($company, [$a->id, $b->id], $item->id)->assertOk();

        $this->assertSame($item->id, $a->fresh()->invoiced_in_item_id);
        $this->assertSame($item->id, $b->fresh()->invoiced_in_item_id);
        $this->assertEquals($before, $item->fresh()->only(['qty', 'price', 'net']));
        $this->assertSame([], $this->uninvoicedIds($company));
    }
    public function test_rejects_items_that_are_no_open_target_of_the_parent(): void {
        $project = Project::factory()->create();
        $focus   = $this->focusOf($project);

        $invoiced  = $this->openItemOf($project, ['position' => 1]);
        $foreign   = $this->openItemOf(Project::factory()->create());
        $deleted   = $this->openItemOf($project, ['position' => 2]);
        $repeating = InvoiceItem::factory()->repeating()->net(99)->create(['project_id' => $project->id, 'stage' => 1]);

        $invoiced->invoice_id = Invoice::factory()->create()->id;
        $invoiced->save();
        $deleted->delete();

        foreach ([$invoiced, $foreign, $deleted, $repeating] as $item) {
            $this->link($project, [$focus->id], $item->id)->assertUnprocessable()->assertJsonValidationErrors('invoiceItemId');
        }
        $this->assertNull($focus->fresh()->invoiced_in_item_id);
    }
    public function test_rejects_foreign_or_already_billed_foci(): void {
        $project  = Project::factory()->create();
        $item     = $this->openItemOf($project);
        $own      = $this->focusOf($project);
        $foreign  = $this->focusOf(Project::factory()->create());
        $billedIn = $this->openItemOf($project);
        $billed   = $this->focusOf($project, ['invoiced_in_item_id' => $billedIn->id]);

        $this->link($project, [$own->id, $foreign->id], $item->id)->assertUnprocessable()->assertJsonValidationErrors('itemIds');
        $this->link($project, [$own->id, $billed->id], $item->id)->assertUnprocessable()->assertJsonValidationErrors('itemIds');

        $this->assertNull($own->fresh()->invoiced_in_item_id);
        $this->assertNull($foreign->fresh()->invoiced_in_item_id);
        $this->assertSame($billedIn->id, $billed->fresh()->invoiced_in_item_id);
    }
    public function test_requires_hr_or_project_manager(): void {
        $project = Project::factory()->create();
        $item    = $this->openItemOf($project);
        $focus   = $this->focusOf($project);

        $this->link($project, [$focus->id], $item->id, $this->userWithRole('user'))->assertForbidden();
        $this->assertNull($focus->fresh()->invoiced_in_item_id);

        $this->link($project, [$focus->id], $item->id, $this->userWithRole('hr'))->assertOk();
    }
    public function test_unknown_parent_is_not_found(): void {
        $item = $this->openItemOf(Project::factory()->create());

        $this->actingAs($this->pm())->postJson('/api/foci/link-item/projects/999999999', ['itemIds' => ['1'], 'invoiceItemId' => (string)$item->id])->assertNotFound();
    }
    public function test_deleting_the_item_releases_the_linked_foci(): void {
        $project = Project::factory()->create();
        $item    = $this->openItemOf($project);
        $focus   = $this->focusOf($project);
        $this->link($project, [$focus->id], $item->id)->assertOk();

        $item->fresh()->delete();

        $this->assertNull($focus->fresh()->invoiced_in_item_id);
    }
}
