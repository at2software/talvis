<?php

namespace Tests\Unit\Http;

use App\Http\Controllers\PluginMattermostController;
use Tests\TestCase;

class MattermostChannelHeaderTest extends TestCase {
    public function test_links_become_linked_16px_icons_with_safe_titles_and_hover_texts(): void {
        config(['app.api_url' => 'https://t.example/backend/api/']);
        $markdown = PluginMattermostController::headerMarkdown([
            ['title' => 'TALVIS', 'hint' => 'TALVIS: "Bau" (info)', 'icon' => 'talvis.png', 'url' => 'https://t.example/projects/1'],
            ['title' => 'Back[end] | (main)', 'icon' => 'git.png', 'url' => 'https://git.example/projects/9'],
        ]);

        $this->assertSame('[![TALVIS](https://t.example/backend/api/../icons/talvis.png =16x16 "TALVIS: Bau info")](https://t.example/projects/1) [![Backend main](https://t.example/backend/api/../icons/git.png =16x16 "Backend main")](https://git.example/projects/9)', $markdown);
    }
    public function test_links_beyond_the_mattermost_limit_are_dropped_whole(): void {
        $links  = array_map(fn (int $i) => ['title' => "Repo {$i}", 'icon' => 'git.png', 'url' => "https://git.example/projects/{$i}"], range(1, 40));
        $header = PluginMattermostController::headerMarkdown($links);

        $this->assertLessThanOrEqual(PluginMattermostController::HEADER_MAX, mb_strlen($header));
        $this->assertStringEndsWith(')', $header);
        $this->assertStringNotContainsString('projects/40)', $header);
    }
}
