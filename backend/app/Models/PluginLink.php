<?php

namespace App\Models;

use App\Http\Controllers\PluginController;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class PluginLink extends BaseModel {
    use HasFactory, SoftDeletes;

    const FLAG_GITLAB_HOOKED = 1 << 0;

    protected $fillable = ['name', 'url', 'type', 'parent_id', 'parent_type', 'framework_id', 'framework_version'];
    protected $hidden   = ['deleted_at', 'created_at', 'updated_at'];

    public function parent(): MorphTo {
        return $this->morphTo();
    }
    public function framework() {
        return $this->belongsTo(Framework::class);
    }
    public function getIconAttribute() {
        switch ($this->type) {
            case 'git': return '../icons/git.png';
            case 'mattermost': return '../icons/mattermost.png';
            case 'mantis': return '../icons/mantis.png';
            case 'svn': return '../icons/svn.png';
        }
        return '../icons/dashboard.jpg';
    }
    public static function buildApiPathFromProject(array $project): string {
        return substr($project['web_url'], 0, -strlen($project['path_with_namespace'])).'projects/'.$project['id'];
    }
    public function buildApiPath(): string {
        $parts = explode('/projects/', $this->url);
        return $parts[0].'/api/v4/projects/'.$parts[1];
    }
    public static function arrayFindKey(array $array, callable $callback): int {
        foreach ($array as $key => $value) {
            if ($callback($value)) {
                return $key;
            }
        }
        return -1;
    }
    public function newCollection(array $models = []): PluginLinkCollection {
        return new PluginLinkCollection($models);
    }
}

class PluginLinkCollection extends Collection {
    public function withoutOrchestratedProjects(): static {
        return $this->reject(fn (PluginLink $link) => $link->parent instanceof Project && $link->parent->isOrchestrated());
    }
    public function siblingsOfType($type) {
        if (class_exists($type) && is_subclass_of($type, PluginController::class)) {
            $controllers = PluginController::getPluginControllers($type);

            $result = [];

            foreach ($this as $link) {
                if ($link->parent) {
                    $linkTypes = $link->parent->pluginLinks()->pluck('type', 'url')->toArray();

                    foreach ($controllers as $controller) {
                        $controllerKey = $controller->getKey();
                        foreach ($linkTypes as $url => $linkType) {
                            if ($linkType === $controllerKey) {
                                $channelId = $this->extractChannelId($url, $controller);
                                if ($channelId) {
                                    $result[] = [
                                        'controller' => $controller,
                                        'channelId'  => $channelId,
                                        'url'        => $url,
                                    ];
                                }
                            }
                        }
                    }
                }
            }
            return collect($result);
        }

        if (is_string($type)) {
            $links = [];
            foreach ($this as $link) {
                if ($link->parent) {
                    foreach ($link->parent->pluginLinks()->where('type', $type)->get() as $_) {
                        $links[] = $_->url;
                    }
                }
            }
            return array_unique($links);
        }
        return collect([]);
    }
    private function extractChannelId(string $url, $controller): ?string {
        $parts = explode('/', $url);
        return array_pop($parts); // Last part should be channel ID
    }
}
