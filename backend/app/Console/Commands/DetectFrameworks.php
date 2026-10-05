<?php

namespace App\Console\Commands;

use App\Http\Controllers\PluginGitController;
use App\Models\Framework;
use App\Models\PluginLink;
use Illuminate\Console\Command;

class DetectFrameworks extends Command {
    /**
     * @var string
     */
    protected $signature = 'git:detect-frameworks {--fresh : Force update all plugin links} {--only= : Only update specific framework (e.g., ios, android)}';

    /**
     * @var string
     */
    protected $description = 'Detect frameworks and versions for all git plugin links';

    public function handle() {
        $gitController = app(PluginGitController::class);

        if (! $gitController) {
            $this->error('PluginGitController not available. Check GITLAB configuration.');
            return 1;
        }

        $query = PluginLink::where('type', 'git');

        if ($onlyFramework = $this->option('only')) {
            $frameworkId = Framework::where('name', $onlyFramework)->value('id');
            if (! $frameworkId) {
                $this->error("Framework '{$onlyFramework}' not found in database.");
                return 1;
            }
            $query->where('framework_id', $frameworkId);
        } elseif (! $this->option('fresh')) {
            $query->whereNull('framework_id');
        }

        $gitLinks = $query->get();

        if ($gitLinks->isEmpty()) {
            $this->info('No git plugin links to process.');
            return 0;
        }

        $groupedLinks = $gitLinks->groupBy('url');

        $this->info("Found {$gitLinks->count()} git plugin links ({$groupedLinks->count()} unique repositories). Starting framework detection...");

        $frameworks = Framework::pluck('id', 'name')->toArray();
        $processed  = 0;
        $updated    = 0;

        foreach ($groupedLinks as $url => $links) {
            $firstLink = $links->first();
            $this->info("Processing repository: {$url} ({$links->count()} link(s))");

            try {
                $detection = $gitController->detectFramework($firstLink);

                $frameworkName = $detection['framework'];
                $version       = $detection['version'];

                if (! isset($frameworks[$frameworkName])) {
                    $this->warn("  Framework '{$frameworkName}' not found in database. Skipping.");

                    continue;
                }

                $frameworkId = $frameworks[$frameworkName];

                foreach ($links as $link) {
                    $link->update([
                        'framework_id'      => $frameworkId,
                        'framework_version' => $version,
                    ]);
                }

                $coloredFramework = $this->colorizeFramework($frameworkName, $version);
                $this->line("  ✓ Detected: {$coloredFramework} - updated {$links->count()} link(s)");
                $updated += $links->count();
            } catch (\Exception $e) {
                $this->error("  ✗ Error: {$e->getMessage()}");
            }

            $processed++;
        }

        $this->newLine();
        $this->info('Framework detection completed!');
        $this->info("Processed: {$processed}");
        $this->info("Updated: {$updated}");
        return 0;
    }
    private function colorizeFramework(string $framework, ?string $version): string {
        $colors = [
            'unknown' => 'gray',
            'laravel' => 'red',
            'angular' => 'red',
            'ios'     => 'yellow',
            'android' => 'yellow',
            'macos'   => 'orange',
        ];

        $color       = $colors[$framework] ?? 'white';
        $versionText = $version ? " <fg=gray>(v{$version})</>" : ' <fg=gray>(no version)</>';
        return "<fg={$color}>{$framework}</>{$versionText}";
    }
}
