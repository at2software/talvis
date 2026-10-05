<?php

namespace App\Jobs;

use App\Helpers\NLog;
use App\Http\Controllers\PluginGitController;
use App\Models\Framework;
use App\Models\PluginLink;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(\Illuminate\Support\Collection $links, array{id: int, name: string, web_url: string} $project, array<string, string> $credentials)
 */
class GitPushWebhookJob implements ShouldQueue {
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param Collection<int, PluginLink> $links
     * @param array{id: int, name: string, web_url: string} $project
     * @param array<string, string> $credentials Vault credentials keyed by env name
     */
    public function __construct(
        private Collection $links,
        private array $project,
        private array $credentials,
    ) {}

    public function handle(): void {
        foreach ($this->links as $link) {
            $link->update(['framework_id' => null, 'framework_version' => null]);
        }

        try {
            $controller = new PluginGitController($this->credentials);
            $detection  = $controller->detectFramework($this->links->first());
            $framework  = Framework::where('name', $detection['framework'])->first();

            if ($framework) {
                foreach ($this->links as $link) {
                    $link->update([
                        'framework_id'      => $framework->id,
                        'framework_version' => $detection['version'],
                    ]);
                }
            }
        } catch (\Exception $e) {
            NLog::warning("Framework detection failed on push: {$e->getMessage()}");
        }
    }
}
