<?php

namespace App\Console\Commands;

use App\Mail\FrameworkMajorVersionUpdate;
use App\Models\Framework;
use App\Models\Param;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

class FetchLatestFrameworkVersions extends Command {
    /**
     * @var string
     */
    protected $signature = 'git:fetch-latest-framework-versions';

    /**
     * @var string
     */
    protected $description = 'Fetch the latest stable versions for all frameworks';

    public function handle() {
        $frameworks = Framework::where('name', '!=', 'unknown')->get();

        $this->info("Fetching latest versions for {$frameworks->count()} frameworks...");
        $this->newLine();

        foreach ($frameworks as $framework) {
            $this->info("Checking: {$framework->name}");

            try {
                $latestVersion = $this->fetchLatestVersion($framework->name);

                if ($latestVersion) {
                    $previousVersion = $framework->latest_version;

                    if ($previousVersion && $this->hasMajorVersionChanged($previousVersion, $latestVersion)) {
                        $this->sendMajorVersionNotification($framework->name, $previousVersion, $latestVersion);
                        $this->info("  ✉ Major version change detected: {$previousVersion} → {$latestVersion}");
                    }

                    $framework->latest_version = $latestVersion;
                    $framework->save();

                    $this->info("  ✓ Latest version: {$latestVersion}");
                } else {
                    $this->warn('  ⚠ Could not determine latest version');
                }
            } catch (\Exception $e) {
                $this->error("  ✗ Error: {$e->getMessage()}");
            }

            $this->newLine();
        }

        $this->info('Completed fetching latest framework versions!');
        return 0;
    }
    private function fetchLatestVersion(string $frameworkName): ?string {
        return match ($frameworkName) {
            'laravel' => $this->fetchLaravelVersion(),
            'angular' => $this->fetchAngularVersion(),
            'ios'     => $this->fetchIOSVersion(),
            'macos'   => $this->fetchMacOSVersion(),
            'android' => $this->fetchAndroidVersion(),
            default   => null,
        };
    }
    private function fetchLaravelVersion(): ?string {
        try {
            $response = Http::get('https://packagist.org/packages/laravel/framework.json');
            if ($response->successful()) {
                $data           = $response->json();
                $versions       = array_keys($data['package']['versions'] ?? []);
                $stableVersions = array_filter($versions, fn ($v) => preg_match('/^v?\d+\.\d+\.\d+$/', $v));
                if (! empty($stableVersions)) {
                    $stableVersions = array_map(fn ($v) => ltrim($v, 'v'), $stableVersions);
                    usort($stableVersions, fn ($a, $b) => version_compare($b, $a));
                    return reset($stableVersions);
                }
            }
        } catch (\Exception $e) {
        }
        return null;
    }
    private function fetchAngularVersion(): ?string {
        try {
            $response = Http::get('https://registry.npmjs.org/@angular/core');
            if ($response->successful()) {
                $data = $response->json();
                return $data['dist-tags']['latest'] ?? null;
            }
        } catch (\Exception $e) {
            // Silently fail
        }
        return null;
    }
    private function fetchIOSVersion(): ?string {
        try {
            $response = Http::get('https://developer.apple.com/news/releases/rss/releases.rss');
            if ($response->successful()) {
                $xml = simplexml_load_string($response->body());
                if ($xml) {
                    foreach ($xml->channel->item as $item) {
                        $title = (string)$item->title;
                        if (preg_match('/iOS\s+(\d+(?:\.\d+)?)/', $title, $matches)) {
                            return $matches[1];
                        }
                    }
                }
            }
        } catch (\Exception $e) {
            // Silently fail
        }
        return null;
    }
    private function fetchMacOSVersion(): ?string {
        try {
            $response = Http::get('https://developer.apple.com/news/releases/rss/releases.rss');
            if ($response->successful()) {
                $xml = simplexml_load_string($response->body());
                if ($xml) {
                    foreach ($xml->channel->item as $item) {
                        $title = (string)$item->title;
                        if (preg_match('/macOS\s+(\d+(?:\.\d+)?)/', $title, $matches)) {
                            return $matches[1];
                        }
                    }
                }
            }
        } catch (\Exception $e) {
            // Silently fail
        }
        return null;
    }
    private function fetchAndroidVersion(): ?string {
        try {
            $response = Http::get('https://developer.android.com/studio/releases/platforms');
            if ($response->successful()) {
                $html = $response->body();
                if (preg_match('/API level (\d+)/', $html, $matches)) {
                    return $matches[1];
                }
            }
        } catch (\Exception $e) {
            // Silently fail
        }
        return null;
    }
    private function hasMajorVersionChanged(string $oldVersion, string $newVersion): bool {
        $oldMajor = $this->extractMajorVersion($oldVersion);
        $newMajor = $this->extractMajorVersion($newVersion);
        return $oldMajor !== null && $newMajor !== null && $oldMajor !== $newMajor;
    }
    private function extractMajorVersion(string $version): ?int {
        if (preg_match('/(\d+)/', $version, $matches)) {
            return (int)$matches[1];
        }
        return null;
    }
    private function sendMajorVersionNotification(string $frameworkName, string $oldVersion, string $newVersion): void {
        $notificationEmail = Param::get('NOTIFICATION_EMAIL_ON_FRAMEWORK_UPDATE');

        if (! $notificationEmail || ! $notificationEmail->value) {
            return;
        }

        try {
            Mail::to($notificationEmail->value)->send(
                new FrameworkMajorVersionUpdate($frameworkName, $oldVersion, $newVersion)
            );
        } catch (\Exception $e) {
            $this->error("  ✗ Failed to send email: {$e->getMessage()}");
        }
    }
}
