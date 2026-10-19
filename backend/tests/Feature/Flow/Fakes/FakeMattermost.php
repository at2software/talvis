<?php

namespace Tests\Feature\Flow\Fakes;

use App\Http\Controllers\PluginMattermostController;

class FakeMattermost extends PluginMattermostController {
    public array $known   = [];
    public array $dialogs = [];
    public array $updates = [];

    public function __construct() {}
    public function resolveUserId(string $usernameOrId): ?string {
        return $this->known[strtolower(ltrim($usernameOrId, '@'))] ?? null;
    }
    public function openDialog(string $triggerId, string $url, array $dialog): bool {
        $this->dialogs[] = $dialog;
        return true;
    }
    public function updatePost(string $id, string $message, $props = null, ?string $channelId = null) {
        $this->updates[] = ['id' => $id, 'message' => $message, 'props' => $props];
        return [];
    }
}
