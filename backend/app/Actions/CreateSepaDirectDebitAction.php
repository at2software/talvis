<?php

namespace App\Actions;

use App\Exceptions\InvoiceDataException;
use App\Models\Invoice;
use App\Models\Param;
use App\Support\Iban;
use Carbon\CarbonInterface;
use Digitick\Sepa\PaymentInformation;
use Digitick\Sepa\TransferFile\Factory\TransferFileFacadeFactory;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CreateSepaDirectDebitAction {
    public const PAIN_FORMAT = 'pain.008.001.08';
    private const PAYMENT    = 'collection';

    /** @param Collection<int, Invoice> $invoices */
    public function execute(Collection $invoices, CarbonInterface $collectionDate): string {
        $creditor  = $this->creditor();
        $messageId = 'TALVIS-'.now()->format('YmdHis');

        $file = TransferFileFacadeFactory::createDirectDebit($messageId, $creditor['name'], self::PAIN_FORMAT);
        $file->addPaymentInfo(self::PAYMENT, array_filter([
            'id'                  => $messageId,
            'creditorName'        => $creditor['name'],
            'creditorAccountIBAN' => $creditor['iban'],
            'creditorAgentBIC'    => $creditor['bic'],
            'creditorId'          => $creditor['id'],
            'seqType'             => PaymentInformation::S_RECURRING,
            'localInstrumentCode' => 'CORE',
            'dueDate'             => $collectionDate->toDateTimeImmutable(),
        ]));

        foreach ($invoices as $invoice) {
            $mandate = $invoice->company->directDebitMandate();
            $file->addTransfer(self::PAYMENT, array_filter([
                'amount'                => (int)round($invoice->unmaskedGrossRemaining() * 100),
                'debtorIban'            => $mandate['iban'],
                'debtorBic'             => $mandate['bic'],
                'debtorName'            => $mandate['holder'],
                'debtorMandate'         => $mandate['reference'],
                'debtorMandateSignDate' => date('d.m.Y', strtotime($mandate['signed_at'])),
                'remittanceInformation' => $invoice->name,
                'endToEndId'            => $invoice->name,
            ]));
        }

        $xml = $file->asXML();

        DB::transaction(function () use ($invoices) {
            Invoice::disablePropagation();
            try {
                foreach ($invoices as $invoice) {
                    $invoice->setFlag(Invoice::FLAG_SEPA_COLLECTED);
                    $invoice->save();
                }
            } finally {
                Invoice::enablePropagation();
            }
        });

        return $xml;
    }

    /** @return array{name: string, iban: string, bic: ?string, id: string} */
    private function creditor(): array {
        $creditor = [
            'name' => trim((string)Param::get('ME_NAME')->value),
            'iban' => Iban::normalize((string)Param::get('ME_IBAN')->value),
            'bic'  => trim((string)Param::get('ME_BIC')->value) ?: null,
            'id'   => trim((string)Param::get('ME_CREDITOR_ID')->value),
        ];
        $missing = array_keys(array_filter(['ME_NAME' => $creditor['name'], 'ME_IBAN' => $creditor['iban'], 'ME_CREDITOR_ID' => $creditor['id']], fn ($value) => $value === ''));
        if ($missing) {
            throw new InvoiceDataException('Missing creditor settings: '.implode(', ', $missing));
        }
        if (! Iban::isValid($creditor['iban'])) {
            throw new InvoiceDataException('Param ME_IBAN is not a valid IBAN.');
        }
        return $creditor;
    }
}
