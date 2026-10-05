<?php

namespace App\Console\Commands\Cronjobs;

use App\ML\CustomerChurnModel;
use App\ML\CustomerIntervalModel;
use App\ML\CustomerRevenueModel;
use App\ML\CustomerSnapshots;
use App\ML\SupportLoadModel;
use App\Models\Company;
use Illuminate\Console\Command;

/**
 * Refreshes Model A / B / C / support-load predictions for all eligible
 * customers, stored as per-company FloatParams (ML_PREDICTED_REVENUE_12M,
 * ML_PREDICTED_INTERVAL_DAYS, ML_CHURN_PROBABILITY_12M, ML_PREDICTED_SUPPORT_HOURS) —
 * the exact same persistence mechanism already used
 * for STATS_LINREG_FORECAST_12M / INVOICE_REVENUE_12M (see
 * App\Services\ForecastService::generateCompanyForecasts()), so every figure
 * rides the same Param admin UI / history / frontend getParam() plumbing.
 *
 * Strictly ADDITIVE: does not read, write, or replace STATS_LINREG_FORECAST_12M
 * or INVOICE_REVENUE_12M. The predicted next-purchase date and "overdue" flag
 * are NOT stored — they're derived on read from ML_PREDICTED_INTERVAL_DAYS +
 * the company's latest invoice date (see Company::getMlPredictedNextPurchaseAtAttribute()).
 *
 * Modeled on cron:check-project-overrun-predictions (CheckProjectOverrunPredictions) —
 * same "guard when the .rbx model is missing, refresh a value per entity" shape.
 */
class RefreshCustomerPredictions extends Command {
    protected $signature   = 'cron:refresh-customer-predictions';
    protected $description = 'Refresh Model A (12m revenue), B (re-purchase interval) and C (churn probability) predictions for eligible customers, stored as per-company FloatParams';

    public function handle(): int {
        $revenueTrained     = CustomerRevenueModel::load() !== null;
        $intervalTrained    = CustomerIntervalModel::load() !== null;
        $churnTrained       = CustomerChurnModel::load() !== null;
        $supportLoadTrained = SupportLoadModel::load() !== null;

        if (! $revenueTrained && ! $intervalTrained && ! $churnTrained && ! $supportLoadTrained) {
            $this->warn('No trained customer models found (run ml:train-customer-* / ml:train-support-load first) — nothing to refresh. Skipping.');
            return 0;
        }
        foreach ([
            'ml:train-customer-revenue'  => $revenueTrained,
            'ml:train-customer-interval' => $intervalTrained,
            'ml:train-customer-churn'    => $churnTrained,
            'ml:train-support-load'      => $supportLoadTrained,
        ] as $command => $trained) {
            if (! $trained) {
                $this->warn("No trained model for {$command} — skipping that prediction.");
            }
        }

        $companies = CustomerSnapshots::eligibleCompaniesQuery()->get();
        $this->info("Refreshing predictions for {$companies->count()} eligible customers...");

        $revenueUpdated     = 0;
        $intervalUpdated    = 0;
        $churnUpdated       = 0;
        $supportLoadUpdated = 0;

        foreach ($companies as $company) {
            if ($revenueTrained) {
                $revenueUpdated += $this->storeIfPredicted($company, 'ML_PREDICTED_REVENUE_12M', CustomerRevenueModel::predict($company));
            }
            if ($intervalTrained) {
                $intervalUpdated += $this->storeIfPredicted($company, 'ML_PREDICTED_INTERVAL_DAYS', CustomerIntervalModel::predictIntervalDays($company));
            }
            if ($churnTrained) {
                $churnUpdated += $this->storeIfPredicted($company, 'ML_CHURN_PROBABILITY_12M', CustomerChurnModel::predict($company));
            }
            if ($supportLoadTrained) {
                $supportLoadUpdated += $this->storeIfPredicted($company, 'ML_PREDICTED_SUPPORT_HOURS', SupportLoadModel::predict($company));
            }
        }

        $this->info("Updated ML_PREDICTED_REVENUE_12M for {$revenueUpdated}, ML_PREDICTED_INTERVAL_DAYS for {$intervalUpdated}, ML_CHURN_PROBABILITY_12M for {$churnUpdated}, ML_PREDICTED_SUPPORT_HOURS for {$supportLoadUpdated} customers.");
        return 0;
    }
    private function storeIfPredicted(Company $company, string $key, ?float $value): int {
        if ($value === null) {
            return 0;
        }
        $param        = $company->param($key);
        $param->value = $value;
        $param->save();

        return 1;
    }
}
