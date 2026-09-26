<?php

namespace App\Console\Commands\Cronjobs;

use App\Helpers\NLog;
use App\Http\Controllers\PluginFintsController;
use App\Jobs\ChatSendMessageJob;
use App\Models\Invoice;
use App\Models\Param;
use App\Models\User;
use App\Models\Vault;
use App\Services\FinTs\FinTsTransaction as Transaction;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

class FetchBankBalance extends Command {
    protected $signature   = 'cron:fetch-bank-balance {--since= : Override the start date for payment matching (any strtotime-compatible string, e.g. "3 weeks ago" or "2026-04-01")}';
    protected $description = 'Fetch bank balance, match incoming payments to invoices, and notify on discrepancies (daily)';

    public function handle() {
        if (! Vault::isActive('FINTS')) {
            $this->warn('FinTS vault not configured, skipping.');
            return 0;
        }

        $this->updateBalance();
        $this->matchPayments();

        return 0;
    }

    // ── Balance ───────────────────────────────────────────────────────────────

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

    // ── Payment matching ──────────────────────────────────────────────────────

    private function matchPayments(): void {
        $lastCheckParam = Param::get('CASHFLOW_LAST_PAYMENT_CHECK');
        $sinceOption    = $this->option('since');
        if ($sinceOption) {
            $ts = strtotime($sinceOption);
            if ($ts === false) {
                $this->error("Invalid --since value: \"{$sinceOption}\"");
                return;
            }
            $since = new \DateTime('@'.$ts);
        } else {
            $since = $lastCheckParam->value
                ? new \DateTime($lastCheckParam->value)
                : new \DateTime('-30 days');
        }

        $this->line('Checking payments since '.$since->format('Y-m-d').'…');

        $controller = new PluginFintsController;
        try {
            $transactions = $controller->fetchTransactionsSince($since);
        } catch (\Exception $e) {
            $this->error('Statement fetch failed: '.$e->getMessage());
            return;
        }

        $credits = array_filter(
            $transactions,
            fn (Transaction $t) => $t->getCreditDebit() === Transaction::CD_CREDIT && ! $t->isStorno()
        );

        $this->line('Fetched '.count($transactions).' transactions ('.count($credits).' incoming credits).');

        if (empty($credits)) {
            $this->line('No new incoming payments.');
            $this->saveLastCheck($lastCheckParam);
            return;
        }

        $unpaid     = Invoice::whereNull('paid_at')->where('is_cancelled', 0)->get();

        $defaultMmId = Vault::getCredentials('MATTERMOST')['MATTERMOST_DEFAULT_USER_ID'] ?? null;
        $notifyUser  = $defaultMmId ? User::find($defaultMmId) : null;
        if (! $notifyUser) {
            $this->warn('No notification recipient found — MATTERMOST_DEFAULT_USER_ID not set or not linked to a TALVIS user.');
        }

        $matched       = 0;
        $discrepancies = 0;

        foreach ($credits as $tx) {
            $amount    = $tx->getAmount();
            $reference = $tx->getMainDescription();
            $sender    = $tx->getName();
            $date      = $tx->getBookingDate()?->format('Y-m-d') ?? '?';

            $byName = $this->extractInvoiceRef($reference, $unpaid);

            if ($byName) {
                if (abs($byName->gross_remaining - $amount) < 0.02) {
                    $byName->paid_at = now();
                    $byName->save();
                    $matched++;
                    $this->line("✓ {$byName->name} matched by ref, marked paid");
                    ChatSendMessageJob::dispatch(
                        "**Invoice Paid ✓**\n\n"
                        ."📅 **Date:** {$date}\n"
                        ."👤 **Sender:** {$sender}\n"
                        ."📄 **Invoice:** {$byName->name}\n"
                        .'💰 **Amount:** €'.number_format($amount, 2),
                        user: $notifyUser,
                    );
                } else {
                    $discrepancies++;
                    $this->warn('     ⚠ discrepancy: expected €'.number_format($byName->gross_remaining, 2).', got €'.number_format($amount, 2));
                    ChatSendMessageJob::dispatch(
                        "**Payment Discrepancy – Action Required**\n\n"
                        ."📅 **Date:** {$date}\n"
                        ."👤 **Sender:** {$sender}\n"
                        ."📝 **Reference:** {$reference}\n"
                        .'💰 **Received:** €'.number_format($amount, 2)."\n"
                        ."📄 **Invoice:** {$byName->name} (expected €".number_format($byName->gross_remaining, 2).")\n\n"
                        .'Please reconcile manually.',
                        user: $notifyUser,
                    );
                }
                continue;
            }

            $byAmount = $unpaid->filter(fn (Invoice $inv) => abs($inv->gross_remaining - $amount) < 0.02);

            if ($byAmount->count() === 1) {
                $invoice          = $byAmount->first();
                $invoice->paid_at = now();
                $invoice->save();
                $matched++;
                $this->line("✓ {$invoice->name} matched by amount €".number_format($amount, 2).', marked paid');
                ChatSendMessageJob::dispatch(
                    "**Invoice Paid ✓**\n\n"
                    ."📅 **Date:** {$date}\n"
                    ."👤 **Sender:** {$sender}\n"
                    ."📄 **Invoice:** {$invoice->name}\n"
                    .'💰 **Amount:** €'.number_format($amount, 2),
                    user: $notifyUser,
                );
            } elseif ($byAmount->count() > 1) {
                $discrepancies++;
                $list = $byAmount->map(fn ($inv) => "- {$inv->name} (€".number_format($inv->gross_remaining, 2).')')
                    ->join("\n");
                $this->warn('⚠ Ambiguous match €'.number_format($amount, 2).': '.$byAmount->count().' invoices');
                ChatSendMessageJob::dispatch(
                    "**Ambiguous Payment – Action Required**\n\n"
                    ."📅 **Date:** {$date}\n"
                    ."👤 **Sender:** {$sender}\n"
                    ."📝 **Reference:** {$reference}\n"
                    .'💰 **Amount:** €'.number_format($amount, 2)."\n\n"
                    ."Matches multiple invoices:\n{$list}\n\n"
                    .'Please reconcile manually.',
                    user: $notifyUser,
                );
            }
        }

        $this->info("Payment matching done: {$matched} paid, {$discrepancies} discrepancies.");
        if (! $sinceOption) {
            $this->saveLastCheck($lastCheckParam);
        }
    }
    private function extractInvoiceRef(string $reference, Collection $unpaid): ?Invoice {
        // Derive prefix from first unpaid invoice name (e.g. "AT2-" from "AT2-0058-26")
        $prefix = null;
        foreach ($unpaid as $inv) {
            if (preg_match('/^([A-Za-z][\w]*-)/i', $inv->name, $m)) {
                $prefix = $m[1];
                break;
            }
        }
        if (! $prefix) {
            return null;
        }

        $pattern = '/'.preg_quote($prefix, '/').'\d+-\d+/i';
        if (! preg_match_all($pattern, $reference, $matches)) {
            return null;
        }

        foreach ($matches[0] as $candidate) {
            $found = $unpaid->first(fn (Invoice $inv) => strcasecmp($inv->name, $candidate) === 0);
            if ($found) {
                return $found;
            }
        }

        return null;
    }
    private function saveLastCheck(Param $param): void {
        $param->value = now()->toIso8601String();
        $param->save();
    }
}
