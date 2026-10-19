<?php

namespace Tests\Feature\Http;

use App\Enums\Recurrence;
use App\Models\Company;
use App\Models\Focus;
use App\Models\LeadSource;
use App\Models\MarketingInitiative;
use App\Models\MarketingInitiativeActivity;
use App\Models\MarketingProspect;
use App\Models\MarketingProspectActivity;
use App\Models\Project;
use App\Models\User;
use App\Services\MarketingRemarketingService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class MarketingTouchpointTest extends TestCase {
    use DatabaseTransactions;

    private User $user;
    private MarketingInitiative $initiative;

    protected function setUp(): void {
        parent::setUp();
        $this->user = User::factory()->create();
        $this->user->assignRole('marketing');
        $this->actingAs($this->user);

        $this->initiative = MarketingInitiative::create(['name' => 'Cold calls', 'status' => 'active']);
        foreach ([['Call', 1, 'CALL'], ['Mail', 3, 'EMAIL']] as [$name, $offset, $quickAction]) {
            MarketingInitiativeActivity::create([
                'marketing_initiative_id' => $this->initiative->id,
                'name'                    => $name,
                'day_offset'              => $offset,
                'description'             => '',
                'quick_action'            => $quickAction,
            ]);
        }
    }
    private function prospect(string $vcardBody): MarketingProspect {
        return MarketingProspect::create([
            'marketing_initiative_id' => $this->initiative->id,
            'lead_source_id'          => LeadSource::firstOrCreate(['name' => 'Other'])->id,
            'user_id'                 => $this->user->id,
            'vcard'                   => "BEGIN:VCARD\nVERSION:3.0\n{$vcardBody}\nEND:VCARD",
        ]);
    }
    private function callActivity(MarketingProspect $prospect): MarketingProspectActivity {
        return $prospect->activities()->whereHas('marketingInitiativeActivity', fn ($q) => $q->where('quick_action', 'CALL'))->firstOrFail();
    }
    public function test_unanswered_call_bumps_and_reschedules_the_sequence(): void {
        $prospect = $this->prospect("FN:Erika Muster\nTEL:+49 541 987712");
        $call     = $this->callActivity($prospect);
        $mail     = $prospect->activities()->whereKeyNot($call->id)->firstOrFail();
        $gap      = $call->scheduled_at->diffInDays($mail->scheduled_at);
        $retryAt  = today()->addDays(5);

        $this->postJson("/api/marketing/prospects/{$prospect->id}/touchpoints", [
            'marketing_prospect_activity_id' => $call->id,
            'channel'                        => 'call',
            'result'                         => 'no_answer',
            'retry_at'                       => $retryAt->toDateString(),
        ])->assertSuccessful();

        $call->refresh();
        $this->assertSame('pending', $call->status);
        $this->assertSame(1, $call->bumps);
        $this->assertTrue($call->scheduled_at->isSameDay($retryAt));
        $this->assertEquals($gap, $call->scheduled_at->diffInDays($mail->fresh()->scheduled_at));
    }
    public function test_connected_call_with_meeting_completes_step_and_engages_prospect(): void {
        $prospect = $this->prospect("FN:Erika Muster\nTEL:0541 987712");
        $call     = $this->callActivity($prospect);

        $this->postJson("/api/marketing/prospects/{$prospect->id}/touchpoints", [
            'marketing_prospect_activity_id' => $call->id,
            'channel'                        => 'call',
            'result'                         => 'connected',
            'outcome'                        => 'meeting_booked',
            'notes'                          => 'Termin Donnerstag',
        ])->assertSuccessful();

        $this->assertSame('completed', $call->fresh()->status);
        $this->assertSame('engaged', $prospect->fresh()->status);
        $this->assertSame(1, $this->getJson('/api/marketing/touchpoints/stats?user_id='.$this->user->id)->json('total.meetings'));
    }
    public function test_result_must_fit_the_channel(): void {
        $prospect = $this->prospect('FN:Erika Muster');

        $this->postJson("/api/marketing/prospects/{$prospect->id}/touchpoints", ['channel' => 'email', 'result' => 'voicemail'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('result');
    }
    public function test_bounced_email_fails_the_step(): void {
        $prospect = $this->prospect("FN:Erika Muster\nEMAIL:erika@example.com");
        $mail     = $prospect->activities()->whereHas('marketingInitiativeActivity', fn ($q) => $q->where('quick_action', 'EMAIL'))->firstOrFail();

        $prospect->logTouchpoint($this->user, ['channel' => 'email', 'result' => 'bounced'], $mail);

        $this->assertSame('failed', $mail->fresh()->status);
    }
    public function test_queue_lists_due_steps_of_the_selected_channel(): void {
        $prospect = $this->prospect('FN:Erika Muster');
        $this->callActivity($prospect)->update(['scheduled_at' => today()->subDay()]);

        $mail = $prospect->activities()->whereKeyNot($this->callActivity($prospect)->id)->firstOrFail();
        $mail->update(['scheduled_at' => today()->subDay()]);

        $queue = fn (string $channel) => collect($this->getJson("/api/marketing/touchpoints/queue?channel={$channel}")->assertOk()->json());

        $this->assertContains($prospect->id, $queue('call')->pluck('marketing_prospect_id'));
        $this->assertSame([$mail->id], $queue('email')->where('marketing_prospect_id', $prospect->id)->pluck('id')->all());
        $this->assertNotContains($prospect->id, $queue('linkedin')->pluck('marketing_prospect_id'));
    }
    public function test_queue_skips_steps_whose_preceding_step_is_still_open(): void {
        $mailStep = $this->initiative->initiativeActivities()->where('quick_action', 'EMAIL')->firstOrFail();
        MarketingInitiativeActivity::create([
            'marketing_initiative_id' => $this->initiative->id,
            'name'                    => 'Callback',
            'day_offset'              => 1,
            'description'             => '',
            'quick_action'            => 'CALL',
            'parent_activity_id'      => $mailStep->id,
        ]);
        $prospect = $this->prospect('FN:Erika Muster');
        $prospect->activities()->update(['scheduled_at' => today()->subDay()]);
        $this->callActivity($prospect)->update(['status' => 'completed']);

        $queue = fn (string $channel) => collect($this->getJson("/api/marketing/touchpoints/queue?channel={$channel}")->json())->where('marketing_prospect_id', $prospect->id);

        $this->assertCount(0, $queue('call'));
        $this->assertCount(1, $queue('email'));
    }
    public function test_identity_matches_phone_formats_email_case_and_linkedin_slug(): void {
        $a = $this->prospect("FN:A\nTEL:+49 (0)541 98 77 12\nEMAIL:Erika@Example.com\nURL:https://www.linkedin.com/in/erika-muster/");
        $b = $this->prospect("FN:B\nTEL:0541-987712");
        $c = $this->prospect("FN:C\nEMAIL:erika@example.com");
        $d = $this->prospect("FN:D\nURL:https://linkedin.com/in/Erika-Muster?trk=x");
        $e = $this->prospect("FN:E\nTEL:0541 123456");

        $ids = MarketingProspect::findByIdentity($a->vcard, $this->initiative->id, $a->id)->pluck('id');

        $this->assertEqualsCanonicalizing([$b->id, $c->id, $d->id], $ids->all());
        $this->assertNotContains($e->id, $ids);
    }
    public function test_store_rejects_duplicate_in_same_initiative(): void {
        $this->prospect("FN:Erika Muster\nEMAIL:erika@example.com");

        $this->postJson('/api/marketing/prospects', [
            'marketing_initiative_id' => $this->initiative->id,
            'vcard'                   => "BEGIN:VCARD\nVERSION:3.0\nFN:E. Muster\nEMAIL:ERIKA@example.com\nEND:VCARD",
        ])->assertConflict();
    }
    public function test_merge_keeps_target_and_takes_over_contact_data_and_touchpoints(): void {
        $target = $this->prospect("FN:Erika Muster\nEMAIL:erika@example.com");
        $source = $this->prospect("FN:Erika M.\nEMAIL:erika@example.com\nTEL:0541 987712\nORG:Muster GmbH");
        $source->logTouchpoint($this->user, ['channel' => 'call', 'result' => 'no_answer']);

        $this->postJson("/api/marketing/prospects/{$target->id}/merge", ['source_id' => $source->id])->assertOk();

        $target = MarketingProspect::findOrFail($target->id);
        $this->assertNull(MarketingProspect::find($source->id));
        $this->assertSame('0541 987712', $target->vcard->getFirstValue('TEL'));
        $this->assertSame('Muster GmbH', $target->vcard->getFirstValue('ORG'));
        $this->assertCount(1, $target->vcard->getAttr('EMAIL'));
        $this->assertSame(1, $target->touchpoints()->count());
    }
    public function test_reschedule_overdue_moves_each_prospect_sequence(): void {
        $prospect = $this->prospect('FN:Erika Muster');
        $this->callActivity($prospect)->update(['scheduled_at' => today()->subDays(10)]);
        $target = today()->addDays(2);

        $this->postJson('/api/marketing/prospects/activities/reschedule-overdue', ['date' => $target->toDateString(), 'marketing_initiative_id' => $this->initiative->id])
            ->assertOk()
            ->assertJson(['moved' => 1]);

        $this->assertTrue($this->callActivity($prospect)->scheduled_at->isSameDay($target));
    }
    public function test_remarketing_counts_project_work_as_contact(): void {
        $company = Company::factory()->create(['remarketing_interval' => Recurrence::Monthly, 'created_at' => now()->subYear()]);
        $project = Project::factory()->create(['company_id' => $company->id]);
        $project->forceFill(['created_at' => now()->subYear()])->save();

        $this->assertTrue(MarketingRemarketingService::getRemarketingDue()->contains('id', $company->id));

        Focus::create(['parent_type' => Project::class, 'parent_id' => $project->id, 'user_id' => $this->user->id, 'started_at' => now()->subDay(), 'duration' => 1, 'flags' => 0]);

        $this->assertFalse(MarketingRemarketingService::getRemarketingDue()->contains('id', $company->id));
    }
    public function test_remarketing_due_follows_last_contact_not_company_edits(): void {
        $company = Company::factory()->create(['remarketing_interval' => Recurrence::Monthly]);
        $company->logTouchpoint($this->user, ['channel' => 'call', 'result' => 'connected', 'outcome' => 'info_requested']);
        $company->marketingTouchpoints()->update(['occurred_at' => now()->subMonths(2)]);
        $company->touch();

        $this->assertTrue(MarketingRemarketingService::getRemarketingDue()->contains('id', $company->id));

        $company->logTouchpoint($this->user, ['channel' => 'email', 'result' => 'sent']);

        $this->assertFalse(MarketingRemarketingService::getRemarketingDue()->contains('id', $company->id));
    }
}
