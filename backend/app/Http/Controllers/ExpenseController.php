<?php

namespace App\Http\Controllers;

use App\Http\Requests\Expense\ValidatePayloadRequest;
use App\Models\Expense;
use App\Models\Vault;
use App\Services\FinTs\FinTsTransaction as Transaction;

class ExpenseController extends Controller {
    public function index() {
        return Expense::all();
    }
    public function show(Expense $expense) {
        return $expense;
    }
    public function store(ValidatePayloadRequest $request) {
        $request->validate(['name' => 'required|string']);
        $expense = (new Expense)->forceFill(['starts_at' => now()->toDateString(), 'flags' => 0]);
        return $expense->applyAndSave($request);
    }
    public function update(ValidatePayloadRequest $request, Expense $expense) {
        return $expense->applyAndSave($request);
    }
    public function destroy(Expense $expense) {
        $expense->delete();
        return response()->noContent();
    }
    public function bankTransactions() {
        if (! Vault::isActive('FINTS')) {
            return response()->json(['error' => 'FinTS not configured'], 422);
        }

        $fints = new PluginFintsController;
        try {
            $all = $fints->fetchTransactionsSince(new \DateTime('-90 days'));
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 401);
        }

        $debits = array_values(array_filter(
            $all,
            fn (Transaction $t) => $t->getCreditDebit() === Transaction::CD_DEBIT && ! $t->isStorno()
        ));

        $expenses    = Expense::whereNotNull('matching_string')->where('matching_string', '!=', '')->get();
        $matched     = [];
        $matchedKeys = [];

        foreach ($expenses as $expense) {
            $pattern = strtolower($expense->matching_string);
            $txs     = str_contains($pattern, '*')
                ? array_filter($debits, function (Transaction $t) use ($pattern) {
                    $haystack = strtolower($t->getName().' '.$t->getMainDescription());
                    $regex    = '/^.*'.implode('.*', array_map('preg_quote', explode('*', $pattern))).'.*$/i';
                    return (bool)preg_match($regex, $haystack);
                })
                : array_filter($debits, fn (Transaction $t) => str_contains(strtolower($t->getName().' '.$t->getMainDescription()), $pattern));

            if (empty($txs)) {
                continue;
            }

            $rows = array_values(array_map(fn (Transaction $t) => [
                'date'      => $t->getBookingDate()?->format('Y-m-d') ?? '?',
                'amount'    => (float)$t->getAmount(),
                'sender'    => $t->getName(),
                'reference' => $t->getMainDescription(),
            ], $txs));

            usort($rows, fn ($a, $b) => strcmp($b['date'], $a['date']));
            $latestAmount = $rows[0]['amount'];

            $matched[] = [
                'expense'            => $expense,
                'transactions'       => $rows,
                'is_amount_mismatch' => abs($latestAmount - $expense->price) > 0.02,
                'latest_amount'      => $latestAmount,
            ];

            foreach ($txs as $t) {
                $matchedKeys[] = ($t->getBookingDate()?->format('Y-m-d') ?? '?').'|'.$t->getAmount().'|'.$t->getMainDescription();
            }
        }

        $unmatched = array_values(array_map(
            fn (Transaction $t) => [
                'date'      => $t->getBookingDate()?->format('Y-m-d') ?? '?',
                'amount'    => (float)$t->getAmount(),
                'sender'    => $t->getName(),
                'reference' => $t->getMainDescription(),
            ],
            array_filter($debits, function (Transaction $t) use ($matchedKeys) {
                $key = ($t->getBookingDate()?->format('Y-m-d') ?? '?').'|'.$t->getAmount().'|'.$t->getMainDescription();
                return ! in_array($key, $matchedKeys);
            })
        ));

        return compact('matched', 'unmatched');
    }
}
