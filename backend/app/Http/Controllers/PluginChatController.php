<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

abstract class PluginChatController extends PluginController {
    abstract protected function getToken(): string;
    public static function createInstance(): ?static {
        try {
            return app(static::class);
        } catch (\Exception $e) {
            return null;
        }
    }
    public function getChannelNameFor(Project $project): string {
        return 'nexus_project_'.$project->id;
    }
    public function getUserId(User $user): ?string {
        $found = $user->encryptions()->where('key', static::getKey())->first()?->my_id;
        return $found;
    }
    abstract public function getDirectChannelIdFor(string $userId): ?string;

    // ###### outbound communication
    abstract public function createOrUpdatePost(string $cacheId, string $channelId, string $message, $props = null);
    abstract public function createPost(string $channelId, string $message, $props = null);
    abstract public function updatePost(string $id, string $message, $props = null, ?string $channelId = null);

    /** Returns ['posts' => [id => post], 'order' => [id, ...]] or empty array on failure */
    abstract public function getChannelPosts(string $channelId, int $page = 0, int $perPage = 200): array;

    abstract public function createChannel(string $name, string $display_name, string $purpose, string $header): ?string;
    abstract public function addUsersToChannel(string $channelId, User ...$users);
    abstract public function removeUserFromChannel($channelId, User $id);
    abstract public function getChannelId(string $name): ?string;

    // ###### plugin-specific abstractions
    abstract public function getImageMarkdown(string $path, string $title = 'image'): string;
    abstract public function getIconFor(Project $project): string;
    abstract public function env(string $key): ?string;
    abstract public function updatePosition(string $position, string $userId): void;
    abstract public function updateStatus(string $status, string $userId): void;
    public function _createOrUpdatePost(string $cacheId, string $channelId, string $message, $props, string $dataKey) {
        $props  = [...($props ?? []), 'cache_id' => $cacheId];
        $key    = static::getKey().'_'.$cacheId;
        $postId = Cache::get($key) ?? $this->findExistingPost($cacheId, $channelId);
        if (! $postId) {
            $data   = $this->createPost($channelId, $message, $props);
            $postId = $data[$dataKey] ?? null;
        } else {
            $this->updatePost($postId, $message, $props, $channelId);
        }
        if ($postId) {
            Cache::put($key, $postId, now()->addHours(24));
        }
    }
    protected function findExistingPost(string $cacheId, string $channelId): ?string {
        return null;
    }
    public function getOrCreateChannel($project, string $purpose, string $header, ?string $postfix = null) {
        return $this->getChannelIdFor($project, $postfix) ?? $this->createChannelFor($project, $purpose, $header, $postfix);
    }
    public function createChannelFor(Project $project, string $purpose, string $header, ?string $postfix = null) {
        if (! empty($postfix)) {
            $postfix = '_'.strtolower($postfix);
        }
        return $this->createChannel($this->getChannelNameFor($project).$postfix, $project->name.' '.$postfix, $purpose, $header);
    }
    public function getChannelIdFor(Project $project, ?string $postfix = null): ?string {
        $linked = $project->pluginLinks()->where('type', static::getKey())->value('url');
        if ($linked && count($parts = explode('/', $linked)) > 4) {
            return end($parts);
        }
        if (! empty($postfix)) {
            $postfix = '_'.strtolower($postfix);
        }
        return $this->getChannelId($this->getChannelNameFor($project).$postfix);
    }
    public function addUsersToProjectChannel(Project $project, User ...$users) {
        if ($channelId = $this->getChannelIdFor($project)) {
            $this->addUsersToChannel($channelId, ...$users);
        }
    }
}
