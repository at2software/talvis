<?php

namespace App\Console\Commands;

use GdImage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class GeneratePipelineBadges extends Command {
    private const HEIGHT      = 44;
    private const PADDING     = 6;
    private const GAP         = 4;
    private const STATUS_SIZE = 32;
    private const JOB_SIZE    = 40;
    private const RADIUS      = 10;
    private const SUPERSAMPLE = 4;
    private const BACKGROUND  = [0, 0, 0, 0.4];

    protected $signature   = 'icons:pipeline-badges';
    protected $description = 'Combine every status-*.png with every job-*.png into a pill badge at public/icons/badges/<status>-<job>.png';

    public function handle(): int {
        $iconDir  = public_path('icons');
        $badgeDir = "$iconDir/badges";
        File::ensureDirectoryExists($badgeDir);

        $jobs     = $this->iconsByName("$iconDir/job-*.png", 'job-');
        $statuses = $this->iconsByName("$iconDir/status-*.png", 'status-');

        foreach ($jobs as $job => $jobFile) {
            foreach ($statuses as $status => $statusFile) {
                imagepng($this->compose($statusFile, $jobFile), "$badgeDir/$status-$job.png", 9);
            }
        }

        $this->info(sprintf('Generated %d badges (%dx%d) in %s', count($jobs) * count($statuses), self::width(), self::HEIGHT, $badgeDir));
        return self::SUCCESS;
    }
    private static function width(): int {
        return self::PADDING + self::STATUS_SIZE + self::GAP + self::JOB_SIZE + self::PADDING;
    }

    /**
     * @return array<string, string>
     */
    private function iconsByName(string $pattern, string $prefix): array {
        $icons = [];
        foreach (glob($pattern) as $file) {
            $icons[substr(basename($file, '.png'), strlen($prefix))] = $file;
        }
        ksort($icons);
        return $icons;
    }

    private function compose(string $statusFile, string $jobFile): GdImage {
        $badge = $this->transparentCanvas(self::width(), self::HEIGHT);
        imagecopyresampled($badge, $this->pill(), 0, 0, 0, 0, self::width(), self::HEIGHT, self::width() * self::SUPERSAMPLE, self::HEIGHT * self::SUPERSAMPLE);

        imagealphablending($badge, true);
        $this->copyScaled($badge, imagecreatefrompng($statusFile), self::PADDING, (self::HEIGHT - self::STATUS_SIZE) / 2, self::STATUS_SIZE);
        $this->copyScaled($badge, imagecreatefrompng($jobFile), self::PADDING + self::STATUS_SIZE + self::GAP, (self::HEIGHT - self::JOB_SIZE) / 2, self::JOB_SIZE);
        imagealphablending($badge, false);

        return $badge;
    }
    private function pill(): GdImage {
        $scale  = self::SUPERSAMPLE;
        $width  = self::width() * $scale;
        $height = self::HEIGHT * $scale;
        $radius = self::RADIUS * $scale;
        $pill   = $this->transparentCanvas($width, $height);

        [$r, $g, $b, $opacity] = self::BACKGROUND;
        $color                 = imagecolorallocatealpha($pill, $r, $g, $b, (int)round(127 * (1 - $opacity)));

        imagefilledrectangle($pill, $radius, 0, $width - $radius - 1, $height - 1, $color);
        imagefilledrectangle($pill, 0, $radius, $width - 1, $height - $radius - 1, $color);
        foreach ([[$radius, $radius], [$width - $radius - 1, $radius], [$radius, $height - $radius - 1], [$width - $radius - 1, $height - $radius - 1]] as [$x, $y]) {
            imagefilledellipse($pill, $x, $y, 2 * $radius, 2 * $radius, $color);
        }
        return $pill;
    }
    private function transparentCanvas(int $width, int $height): GdImage {
        $canvas = imagecreatetruecolor($width, $height);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        return $canvas;
    }
    private function copyScaled(GdImage $target, GdImage $source, int $x, int $y, int $size): void {
        imagecopyresampled($target, $source, $x, $y, 0, 0, $size, $size, imagesx($source), imagesy($source));
    }
}
