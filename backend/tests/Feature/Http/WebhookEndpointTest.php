<?php

namespace Tests\Feature\Http;

use App\Enums\WebhookEvent;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\User;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Services\SafeUrlGuard;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class WebhookEndpointTest extends TestCase {
    use DatabaseTransactions;

    private const URL = 'https://hooks.example.com/talvis';

    private function admin(): User {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        return $admin;
    }
    private function trustUrls(): void {
        $this->mock(SafeUrlGuard::class, function ($mock) {
            $mock->shouldReceive('validate')->andReturn(['93.184.215.14']);
            $mock->shouldReceive('pinnedCurlOptions')->andReturn([]);
        });
    }
    private function endpoint(array $events = ['invoice.paid'], bool $active = true): WebhookEndpoint {
        return WebhookEndpoint::create(['name' => 'n8n', 'url' => self::URL, 'events' => $events, 'is_active' => $active]);
    }
    public function test_admins_create_endpoints_and_see_the_secret_only_on_request(): void {
        $this->trustUrls();
        $this->actingAs($this->admin());

        $created = $this->postJson('/api/webhook-endpoints', ['name' => 'n8n', 'url' => self::URL, 'events' => ['invoice.created', 'project.state_changed']])
            ->assertCreated()
            ->json();

        $this->assertStringStartsWith('whsec_', $created['secret']);
        $this->assertArrayNotHasKey('secret', $this->getJson('/api/webhook-endpoints')->assertOk()->json()[0]);
        $this->assertSame($created['secret'], $this->getJson("/api/webhook-endpoints/{$created['id']}/secret")->json('secret'));
        $this->assertNotSame($created['secret'], $this->postJson("/api/webhook-endpoints/{$created['id']}/secret")->json('secret'));
    }
    public function test_endpoints_need_https_a_public_host_and_known_events(): void {
        $this->actingAs($this->admin());

        $this->postJson('/api/webhook-endpoints', ['name' => 'x', 'url' => 'http://hooks.example.com', 'events' => ['invoice.paid']])->assertJsonValidationErrors('url');
        $this->postJson('/api/webhook-endpoints', ['name' => 'x', 'url' => 'https://127.0.0.1/hook', 'events' => ['invoice.paid']])->assertJsonValidationErrors('url');
        $this->postJson('/api/webhook-endpoints', ['name' => 'x', 'url' => self::URL, 'events' => ['ping']])->assertJsonValidationErrors('events.0');
    }
    public function test_only_admins_manage_endpoints(): void {
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/webhook-endpoints')->assertForbidden();
    }
    public function test_events_are_queued_for_active_subscribed_endpoints_only(): void {
        $subscribed = $this->endpoint(['invoice.paid']);
        $other      = $this->endpoint(['company.created']);
        $inactive   = $this->endpoint(['invoice.paid'], active: false);

        $invoice = Invoice::factory()->for(Company::factory())->create(['paid_at' => null, 'is_cancelled' => false]);
        $invoice->paid_at = now();
        $invoice->save();

        $this->assertSame(1, $subscribed->deliveries()->count());
        $this->assertSame(0, $other->deliveries()->count());
        $this->assertSame(0, $inactive->deliveries()->count());
        $delivery = $subscribed->deliveries()->sole();
        $this->assertSame('invoice.paid', $delivery->payload['type']);
        $this->assertSame($invoice->name, $delivery->payload['data']['number']);
    }
    public function test_delivery_is_signed_per_standard_webhooks(): void {
        $this->trustUrls();
        Http::fake([self::URL => Http::response('', 204)]);
        $endpoint = $this->endpoint();
        $delivery = $endpoint->queue(WebhookEvent::InvoicePaid, ['id' => 1]);

        $this->artisan('cron:deliver-webhooks')->assertSuccessful();

        Http::assertSent(function (Request $request) use ($endpoint, $delivery) {
            $key      = base64_decode(substr($endpoint->secret, strlen('whsec_')));
            $expected = 'v1,'.base64_encode(hash_hmac('sha256', $delivery->uuid.'.'.$request->header('webhook-timestamp')[0].'.'.$request->body(), $key, true));
            return $request->header('webhook-id')[0] === $delivery->uuid
                && $request->header('webhook-signature')[0] === $expected
                && $request['type'] === 'invoice.paid';
        });
        $this->assertNotNull($delivery->refresh()->delivered_at);
        $this->assertNotNull($endpoint->refresh()->last_delivered_at);
    }
    public function test_failed_deliveries_are_retried_with_backoff(): void {
        $this->trustUrls();
        Http::fake([self::URL => Http::response('nope', 500)]);
        $endpoint = $this->endpoint();
        $delivery = $endpoint->queue(WebhookEvent::InvoicePaid, ['id' => 1]);

        $this->artisan('cron:deliver-webhooks')->assertSuccessful();

        $delivery->refresh();
        $this->assertNull($delivery->delivered_at);
        $this->assertSame(1, $delivery->attempts);
        $this->assertSame(500, $delivery->response_status);
        $this->assertTrue($delivery->next_attempt_at->between(now()->addSeconds(50), now()->addSeconds(70)));
        $this->assertSame(1, $endpoint->refresh()->failure_count);
        $this->assertSame(0, WebhookDelivery::due()->whereKey($delivery->id)->count());
    }
}
