<?php

namespace Tests\Feature\Http;

use App\Models\PluginLink;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Support\FakeMattermostChannel;
use Tests\TestCase;

class MattermostChannelHeaderSyncTest extends TestCase {
    use DatabaseTransactions;

    private function projectWithRepo(string $repo): Project {
        $project = Project::factory()->create();
        PluginLink::create(['name' => $repo, 'url' => "https://git.example/{$repo}", 'type' => 'git', ...$project->toPoly()]);
        return $project->load('pluginLinks');
    }
    public function test_projects_sharing_a_channel_get_one_stable_header(): void {
        $first      = $this->projectWithRepo('backend');
        $second     = $this->projectWithRepo('frontend');
        $mattermost = new FakeMattermostChannel;

        $this->assertTrue($mattermost->syncChannelHeader('c1', [$second, $first]));
        $this->assertFalse($mattermost->syncChannelHeader('c1', [$first, $second]));
        $this->assertFalse($mattermost->syncChannelHeader('c1', [$second->fresh('pluginLinks'), $first->fresh('pluginLinks')]));

        $this->assertCount(1, $mattermost->writes);
        [$path, $payload] = $mattermost->writes[0];
        $this->assertSame('channels/c1/patch', $path);
        $this->assertSame(['header'], array_keys($payload));
        $this->assertStringContainsString('"TALVIS: '.$first->name.'"', $payload['header']);
        $this->assertStringContainsString('"TALVIS: '.$second->name.'"', $payload['header']);
        $this->assertLessThan(strpos($payload['header'], 'git.example/frontend'), strpos($payload['header'], 'git.example/backend'));
    }
    public function test_legacy_links_behind_the_managed_ones_are_removed(): void {
        $project               = $this->projectWithRepo('backend');
        $mattermost            = new FakeMattermostChannel;
        $mattermost->header    = '[![TALVIS](old)](old) | [:aqua: Bauinfo](https://www.aqua7.de/at2/?id=1)';

        $mattermost->syncChannelHeader('c1', [$project]);

        $this->assertStringNotContainsString('aqua7.de', $mattermost->header);
        $this->assertStringNotContainsString(' | ', $mattermost->header);
    }
    public function test_a_link_shared_by_two_projects_appears_once(): void {
        $first      = $this->projectWithRepo('shared');
        $second     = $this->projectWithRepo('shared');
        $mattermost = new FakeMattermostChannel;

        $mattermost->syncChannelHeader('c1', [$first, $second]);

        $this->assertSame(1, substr_count($mattermost->writes[0][1]['header'], 'git.example/shared'));
    }
}
