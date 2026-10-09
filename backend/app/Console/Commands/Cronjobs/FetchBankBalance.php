<?php

namespace App\Console\Commands\Cronjobs;

use App\Helpers\NLog;
use App\Http\Controllers\PluginFintsController;
use App\Models\Param;
use App\Models\Vault;
use Illuminate\Console\Command;

class FetchBankBalance extends Command {
    protected $signature   = 'cron:fetch-bank-balance';
    protected $description = 'Fetch and record the bank balance (daily)';

    public function handle() {
        if (! Vault::isActive('FINTS')) {
            $this->warn('FinTS vault not configured, skipping.');
            return 0;
        }

        $this->updateBalance();

        return 0;
    }
    private function updateBalance(): void {
        try {
            $controller = new PluginFintsController;
            $balance    = $controller->fetchBalance();

            if ($balance === null) {
                $this->error('Balance fetch returned null.');
                return;
            }

            $param    = Param::get('CASHFLOW_BANK_BALANCE');
            $previous = $param->value ?? 0;
            $diff     = $previous == 0 ? '0%' : round(100 * ($balance - $previous) / $previous, 0).'%';

            $history = $param ? $param->history() : null;
            if ($history && $history->whereDate('created_at', today())->exists()) {
                $this->line('CASHFLOW_BANK_BALANCE already recorded today, skipping.');
            } else {
                $param->value = $balance;
                $param->save();
            }

            $this->table(
                ['key', 'balance', 'previous', 'diff'],
                [['CASHFLOW_BANK_BALANCE', number_format($balance, 2), number_format($previous, 2), $diff]]
            );
        } catch (\Exception $e) {
            NLog::error('Bank balance fetch failed', ['error' => $e->getMessage()]);
            $this->error('Balance fetch failed: '.$e->getMessage());
        }
    }
}
