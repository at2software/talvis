<?php

namespace App\Console\Commands\Cronjobs;

use App\Models\Company;
use App\Models\User;
use App\Services\FocusStatisticsService;
use Illuminate\Console\Command;

class MonthlyStats extends Command {
    protected $signature   = 'cron:monthly-stats';
    protected $description = 'Calculate monthly prediction bias factors for all active users';

    public function handle(): int {
        $this->info('Starting monthly stats calculation...');

        $startDate = now()->subMonths(36);
        $users     = User::whereEmployed()->get();

        foreach ($users as $user) {
            $this->info("Processing user: {$user->name}");

            $predictionData = $user->getPredictionAccuracyData($startDate);

            if (empty($predictionData['monthly_accuracy'])) {
                $this->warn("No prediction data found for user {$user->name}");

                continue;
            }

            $totalWeight = 0;
            $weightedSum = 0;

            foreach ($predictionData['monthly_accuracy'] as $month) {
                $weight = $month['items_count'];
                $weightedSum += $month['unfocused']['weighted_average_bias_factor'] * $weight;
                $totalWeight += $weight;
            }

            $overallBiasFactor = $totalWeight > 0 ? $weightedSum / $totalWeight : 1.0;

            $param = $user->param('STATS_PREDICTION_BIAS');
            $this->info($param);
            $param->value = round($overallBiasFactor, 4);
            $param->save();

            $this->info("Stored bias factor {$overallBiasFactor} for user {$user->name}");

            $focusData = $user->getFocusAccuracyData($startDate);

            if (! empty($focusData['monthly_focus_accuracy'])) {
                $totalWeightDuration = 0;
                $weightedDurationSum = 0;

                foreach ($focusData['monthly_focus_accuracy'] as $month) {
                    $weight = $month['total_duration'];
                    $weightedDurationSum += $month['focused_percentage_duration'] * $weight;
                    $totalWeightDuration += $weight;
                }

                $overallFocusAccuracy = $totalWeightDuration > 0 ? $weightedDurationSum / $totalWeightDuration : 0;

                $focusParam        = $user->param('STATS_INVOICEITEM_FOCUS');
                $focusParam->value = round($overallFocusAccuracy, 2);
                $focusParam->save();

                $this->info("Stored focus accuracy {$overallFocusAccuracy}% for user {$user->name}");
            } else {
                $this->warn("No focus data found for user {$user->name}");
            }
        }

        $this->info('Starting company bias factor calculation...');

        $companyData = FocusStatisticsService::getCompanyPredictionAccuracy();

        foreach ($companyData as $data) {
            $company = Company::find($data['id']);
            if ($company && isset($data['bias_factor'])) {
                $param        = $company->param('STATS_PREDICTION_BIAS');
                $param->value = $data['bias_factor'];
                $param->save();

                $this->info("Stored company bias factor {$data['bias_factor']} for company {$company->name}");
            }
        }

        $this->info('Monthly stats calculation completed.');
        return Command::SUCCESS;
    }
}
