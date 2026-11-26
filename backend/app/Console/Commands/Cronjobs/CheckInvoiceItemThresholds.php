<?php

namespace App\Console\Commands\Cronjobs;

use App\Enums\InvoiceItemType;
use App\Mail\InvoiceItemWorkThresholdAlert;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Project;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class CheckInvoiceItemThresholds extends Command {
    protected $signature   = 'cron:check-invoice-item-thresholds';
    protected $description = 'Send email alerts to project managers and booking users when a project feature exceeds configured budget thresholds';

    public function handle(): int {
        $thresholds = json_decode(Param::get('INVOICE_ITEM_WORK_THRESHOLDS')->value ?? '[]', true) ?: [];
        if (empty($thresholds)) {
            $this->info('No feature thresholds configured, skipping.');
            return 0;
        }
        sort($thresholds);

        $minHours = (float)Param::get('INVOICE_ITEM_ALERT_MIN_HOURS')->value;
        $minShare = (float)Param::get('INVOICE_ITEM_ALERT_MIN_SHARE')->value;

        $projects = Project::whereRunning()
            ->whereNot('is_time_based', true)
            ->get();

        $this->info("Checking feature thresholds for {$projects->count()} projects...");

        foreach ($projects as $project) {
            $this->checkProject($project, $thresholds, $minHours, $minShare);
        }

        $this->info('Done.');
        return 0;
    }
    private function checkProject(Project $project, array $thresholds, float $minHours, float $minShare): void {
        $notifiedParam = $project->param('INVOICE_ITEM_THRESHOLD_NOTIFIED', false);
        $notified      = json_decode($notifiedParam->value ?? '[]', true) ?: [];
        $changed       = false;

        $items = $project->invoiceItems()
            ->where('type', InvoiceItemType::Default)
            ->withSum('foci', 'duration')
            ->get();

        foreach ($items as $item) {
            $workload = $item->assumedWorkload();
            if ($workload <= 0 || ! $this->isRelevant($workload, $project, $minHours, $minShare)) {
                continue;
            }

            $ratio     = $item->progress;
            $sent      = $notified[$item->id] ?? [];
            $itemState = $sent;

            foreach ($thresholds as $threshold) {
                $exceeded = ($ratio * 100) >= $threshold;

                if ($exceeded && ! in_array($threshold, $itemState)) {
                    $this->sendAlert($project, $item, $threshold, $ratio);
                    $itemState[] = $threshold;
                } elseif (! $exceeded && in_array($threshold, $itemState)) {
                    $itemState = array_values(array_diff($itemState, [$threshold]));
                }
            }

            if ($itemState !== $sent) {
                $changed = true;
                if ($itemState) {
                    $notified[$item->id] = $itemState;
                } else {
                    unset($notified[$item->id]);
                }
            }
        }

        if ($changed) {
            $notifiedParam->value = json_encode($notified);
            $notifiedParam->save();
        }
    }
    private function isRelevant(float $workload, Project $project, float $minHours, float $minShare): bool {
        if ($minHours <= 0 && $minShare <= 0) {
            return true;
        }
        if ($minHours > 0 && $workload >= $minHours) {
            return true;
        }
        $estimated = (float)$project->work_estimated;
        return $minShare > 0 && $estimated > 0 && ($workload / $estimated * 100) >= $minShare;
    }
    private function sendAlert(Project $project, InvoiceItem $item, int $threshold, float $ratio): void {
        $bookingUserIds = $item->foci()->distinct()->pluck('user_id');
        $recipients     = User::whereIn('id', $bookingUserIds->push($project->project_manager_id)->filter()->unique())
            ->get()
            ->pluck('email')
            ->filter()
            ->unique();

        if ($recipients->isEmpty()) {
            $this->warn("  ⚠ No recipients for feature #{$item->id} of project #{$project->id}, skipping threshold {$threshold}%");
            return;
        }

        foreach ($recipients as $email) {
            try {
                Mail::to($email)->send(new InvoiceItemWorkThresholdAlert($item, $threshold, $ratio));
                $this->info("  ✉ Sent {$threshold}% alert for \"{$item->text}\" ({$project->name}) to {$email}");
            } catch (\Exception $e) {
                $this->error("  ✗ Failed to send alert for \"{$item->text}\" to {$email}: {$e->getMessage()}");
            }
        }
    }
}
