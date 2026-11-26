<?php

namespace App\Console\Commands\Cronjobs;

use App\Helpers\NLog;
use App\Http\Controllers\WidgetController;
use App\Models\Company;
use App\Models\Expense;
use App\Models\FloatParam;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Project;
use Illuminate\Console\Command;
use Symfony\Component\Console\Output\ConsoleOutput;

class Cashflow extends Command {
    protected $saveToDb = true;
    protected $output;
    protected $signature   = 'cron:cashflow {--no-save : Whether the computed data should be saved to database}';
    protected $description = 'Compute cashflow statistics (daily)';

    public function handle() {
        $this->output   = new ConsoleOutput;
        $this->saveToDb = ! $this->option('no-save');

        try {
            $baseWage = Param::get('HR_HOURLY_WAGE')->value;

            $widgetController          = new WidgetController;
            $CASHFLOW_CUSTOMER_SUPPORT = $widgetController->GET_CASHFLOW_CUSTOMER_SUPPORT($baseWage)->getSum;

            $CASHFLOW_CUSTOMER_UNPAID = Company::whereHas('foci_unpaid_last_month')
                ->withSum('foci_unpaid_last_month', 'duration')
                ->whereNotMe()
                ->get()
                ->sum('foci_unpaid_last_month_sum_duration');

            $CASHFLOW_PROJECTS              = $widgetController->GET_CASHFLOW_PROJECTS($baseWage)->getSum;
            $CASHFLOW_PROJECTS_TIMEBASED    = $widgetController->GET_CASHFLOW_PROJECTS_TIMEBASED($baseWage)->getSum;
            $CASHFLOW_PROJECTS_ACQUISITIONS = $widgetController->GET_CASHFLOW_PROJECTS_ACQUISITIONS($baseWage)->getSum;

            $CASHFLOW_PROJECTS_LINREG = Param::get('STATS_LINREG_FORECAST_12M')->value;

            // *********** INVOICES ************* //
            $CASHFLOW_INVOICES_REPAYMENTS         = 0;
            $CASHFLOW_INVOICES_REPAYMENTS_OVERDUE = 0;
            $CASHFLOW_INVOICES                    = $widgetController->GET_CASHFLOW_INVOICES()->getSum;
            $CASHFLOW_INVOICES_RECURRING          = $widgetController->GET_CASHFLOW_INVOICES_RECURRING()->getSum;
            $CASHFLOW_INVOICES_PREPARED           = 0;

            $CASHFLOW_INVOICES_PREPARED = Company::getAllWithSupportItems()->sum('net_remaining');
            $CASHFLOW_INVOICES_PREPARED += Project::getAllWithSupportItems()->sum('net_remaining');
            $CASHFLOW_INVOICES_PREPARED += InvoiceItem::whereStage(1)->whereNull('invoice_id')->sum('net');

            $CASHFLOW_COMPANIES_TIMEBASED = 0;  // new directive: foci on customers w/o projects is unpaid

            $CASHFLOW_ANNUAL_EXPENSES = 0;
            Expense::chunk(100, function ($expenses) use (&$CASHFLOW_ANNUAL_EXPENSES) {
                foreach ($expenses as $expense) {
                    $CASHFLOW_ANNUAL_EXPENSES += $expense->yearlySum();
                }
            });

            $cashflowMetrics = [
                'CASHFLOW_PROJECTS'                    => $CASHFLOW_PROJECTS,
                'CASHFLOW_PROJECTS_ACQUISITIONS'       => $CASHFLOW_PROJECTS_ACQUISITIONS,
                'CASHFLOW_PROJECTS_TIMEBASED'          => $CASHFLOW_PROJECTS_TIMEBASED,
                'CASHFLOW_PROJECTS_LINREG'             => $CASHFLOW_PROJECTS_LINREG,
                'CASHFLOW_CUSTOMER_SUPPORT'            => $CASHFLOW_CUSTOMER_SUPPORT,
                'CASHFLOW_CUSTOMER_UNPAID'             => $CASHFLOW_CUSTOMER_UNPAID,
                'CASHFLOW_INVOICES'                    => $CASHFLOW_INVOICES,
                'CASHFLOW_INVOICES_REPAYMENTS'         => $CASHFLOW_INVOICES_REPAYMENTS,
                'CASHFLOW_INVOICES_REPAYMENTS_OVERDUE' => $CASHFLOW_INVOICES_REPAYMENTS_OVERDUE,
                'CASHFLOW_INVOICES_RECURRING'          => $CASHFLOW_INVOICES_RECURRING,
                'CASHFLOW_INVOICES_PREPARED'           => $CASHFLOW_INVOICES_PREPARED,
                'CASHFLOW_COMPANIES_TIMEBASED'         => $CASHFLOW_COMPANIES_TIMEBASED,
                'CASHFLOW_ANNUAL_EXPENSES'             => $CASHFLOW_ANNUAL_EXPENSES,
            ];

            $table = [];
            foreach ($cashflowMetrics as $key => $value) {
                $table[] = $this->compareMetric($key, $value);
            }
            $this->table(['key', 'computed', 'original', 'diff'], $table);
        } catch (\Exception $e) {
            NLog::error('Cashflow calculation failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            $this->error('Cashflow calculation failed: '.$e->getMessage());
            return 1;
        }
        return 0;
    }
    private function compareMetric($key, $value) {
        $orig = Param::get($key, ['type' => FloatParam::class])->value ?? 0;
        $diff = $orig == 0 ? '0%' : round(100 * ($value - $orig) / $orig, 0).'%';

        if ($this->saveToDb) {
            $param        = Param::get($key);
            $param->value = $value;
            $param->save();
        }
        return [$key, $value, $orig, $diff];
    }
}
