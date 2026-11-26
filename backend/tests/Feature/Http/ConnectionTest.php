<?php

namespace Tests\Feature\Http;

use App\Models\Company;
use App\Models\Connection;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Product;
use App\Models\ProductGroup;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

#[Group('database')]
class ConnectionTest extends TestCase {
    use DatabaseTransactions;

    private User $manager;

    protected function setUp(): void {
        parent::setUp();
        Bus::fake();
        Role::findOrCreate('project_manager', 'api');
        $this->manager = User::factory()->create();
        $this->manager->assignRole('project_manager');
    }
    public function test_a_researched_connection_keeps_its_type_and_provenance(): void {
        [$customer, $agency] = Company::factory()->count(2)->create();

        $this->actingAs($this->manager)->postJson('/api/connections', [
            'company1_id' => $customer->id,
            'company2_id' => $agency->id,
            'type'        => 'customer',
            'source'      => 'research',
            'source_url'  => 'https://example.com/referenzen',
            'verified_at' => '2026-11-21',
        ])->assertCreated()->assertJsonPath('type', 'customer')->assertJsonPath('source', 'research');

        $connection = Connection::between($agency->id, $customer->id);
        $this->assertSame('https://example.com/referenzen', $connection->source_url);
        $this->assertSame('2026-11-21', $connection->verified_at->toDateString());
    }
    public function test_a_connection_without_attributes_is_untyped_and_manual(): void {
        [$a, $b] = Company::factory()->count(2)->create();

        $this->actingAs($this->manager)->postJson('/api/connections', ['company1_id' => $a->id, 'company2_id' => $b->id])->assertCreated();

        $connection = Connection::between($a->id, $b->id)->fresh();
        $this->assertNull($connection->type);
        $this->assertSame('manual', $connection->source->value);
    }
    public function test_the_same_pair_cannot_be_connected_twice_in_either_direction(): void {
        [$a, $b] = Company::factory()->count(2)->create();
        Connection::create(['company1_id' => $a->id, 'company2_id' => $b->id]);

        $this->actingAs($this->manager)->postJson('/api/connections', ['company1_id' => $b->id, 'company2_id' => $a->id])->assertStatus(405);
        $this->postJson('/api/connections', ['company1_id' => $a->id, 'company2_id' => $a->id])->assertUnprocessable();
    }
    public function test_an_unknown_type_is_rejected(): void {
        [$a, $b] = Company::factory()->count(2)->create();

        $this->actingAs($this->manager)->postJson('/api/connections', ['company1_id' => $a->id, 'company2_id' => $b->id, 'type' => 'supplier'])->assertUnprocessable();
    }
    public function test_updating_sets_the_type_and_can_reverse_the_direction(): void {
        [$a, $b]    = Company::factory()->count(2)->create();
        $connection = Connection::create(['company1_id' => $a->id, 'company2_id' => $b->id]);

        $this->actingAs($this->manager)->putJson("/api/connections/{$connection->id}", ['type' => 'group', 'reverse' => true])
            ->assertOk()
            ->assertJsonPath('type', 'group')
            ->assertJsonPath('company1_id', $b->id)
            ->assertJsonPath('company2_id', $a->id);
    }
    public function test_the_network_colors_a_company_by_the_main_product_group_it_buys_most_in(): void {
        [$customer, $agency] = Company::factory()->count(2)->create();
        $web                 = ProductGroup::create(['name' => 'Web', 'color' => '#111111']);
        $threeD              = ProductGroup::create(['name' => '3D', 'color' => '#222222']);
        $realtime            = ProductGroup::create(['name' => 'Realtime', 'color' => '#333333', 'product_group_id' => $threeD->id]);
        $invoice             = Invoice::factory()->create(['company_id' => $customer->id]);
        foreach ([[$web, 500], [$realtime, 400], [$threeD, 300]] as [$group, $net]) {
            $product = Product::create(['name' => $group->name, 'product_group_id' => $group->id]);
            InvoiceItem::factory()->net($net)->create(['invoice_id' => $invoice->id, 'company_id' => $customer->id, 'product_source_id' => $product->id]);
        }
        Connection::create(['company1_id' => $customer->id, 'company2_id' => $agency->id]);

        $this->actingAs($this->manager)->getJson("/api/companies/{$agency->id}/connections")
            ->assertOk()
            ->assertJsonPath('0.company1.primary_group.name', '3D')
            ->assertJsonPath('0.company1.primary_group.color', '#222222')
            ->assertJsonPath('0.company2.primary_group', null);
    }
    public function test_the_ego_network_adds_relevant_second_degree_companies_and_the_path_to_us(): void {
        $me                                                      = Company::findOrFail(Param::get('ME_ID')->value);
        [$root, $a, $b, $bridge, $noise, $keyAccount, $customer] = Company::factory()->count(7)->create();
        $keyAccount->update(['is_key_account' => true]);
        DB::table('companies')->where('id', $customer->id)->update(['net' => 5000]);
        foreach ([[$root, $a], [$root, $b], [$a, $b], [$bridge, $a], [$bridge, $b], [$noise, $a], [$keyAccount, $a], [$customer, $b], [$me, $a]] as [$x, $y]) {
            Connection::create(['company1_id' => $x->id, 'company2_id' => $y->id]);
        }

        $response = $this->actingAs($this->manager)->getJson("/api/companies/{$root->id}/network")->assertOk();

        $depth = $response->json('depth');
        $this->assertSame(0, $depth[$root->id]);
        $this->assertSame(1, $depth[$a->id]);
        $this->assertSame(2, $depth[$bridge->id]);
        $this->assertSame(2, $depth[$keyAccount->id]);
        $this->assertSame(2, $depth[$customer->id]);
        $this->assertArrayNotHasKey($noise->id, $depth);
        $this->assertSame([$me->id, $a->id, $root->id], $response->json('path'));
        $pairs = collect($response->json('connections'))->map(fn ($_) => [$_['company1_id'], $_['company2_id']]);
        $this->assertContains([$a->id, $b->id], $pairs);
        $this->assertContains([$me->id, $a->id], $pairs);
    }
    public function test_a_company_can_be_flagged_as_key_account(): void {
        $company = Company::factory()->create();

        $this->actingAs($this->manager)->putJson("/api/companies/{$company->id}", ['is_key_account' => true])->assertOk();

        $this->assertTrue($company->fresh()->is_key_account);
    }
}
