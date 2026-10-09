<?php

namespace Tests\Feature\Http;

use App\Models\Company;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\Group;
use ReflectionProperty;
use Tests\TestCase;

#[Group('database')]
class SepaDirectDebitTest extends TestCase {
    use DatabaseTransactions;

    private const DEBTOR_IBAN = 'DE02120300000000202051';

    protected function setUp(): void {
        parent::setUp();
        (new ReflectionProperty(Param::class, 'paramCache'))->setValue(null, []);
        foreach (['ME_NAME' => 'at2 GmbH', 'ME_IBAN' => 'DE89 3704 0044 0532 0130 00', 'ME_BIC' => 'COBADEFFXXX', 'ME_CREDITOR_ID' => 'DE98ZZZ09999999999'] as $key => $value) {
            Param::put($key, $value);
        }
        $clerk = User::factory()->create();
        $clerk->assignRole('invoicing');
        $this->actingAs($clerk);
    }
    private function setParam(Param $param, string $value): void {
        $param->value = $value;
        $param->save();
    }
    private function debtor(array $mandate = []): Company {
        $company = Company::factory()->create();
        $mandate = [...['INVOICE_DD_IBAN' => self::DEBTOR_IBAN, 'INVOICE_DD_MANDATE' => 'M-0042', 'INVOICE_DD_MANDATE_DATE' => '2024-01-15'], ...$mandate];
        foreach (array_filter($mandate) as $key => $value) {
            $this->setParam($company->param($key), $value);
        }
        return $company;
    }
    private function invoiceFor(Company $company, float $net = 100): Invoice {
        $invoice = Invoice::factory()->for($company)->create(['paid_at' => null, 'is_cancelled' => false]);
        InvoiceItem::factory()->net($net)->create(['invoice_id' => $invoice->id, 'company_id' => $company->id, 'vat_rate' => 19]);
        return $invoice->refresh();
    }
    public function test_candidates_list_unpaid_invoices_of_mandated_customers_with_unmasked_amounts(): void {
        $collectable = $this->invoiceFor($this->debtor());
        $withoutDate = $this->invoiceFor($this->debtor(['INVOICE_DD_MANDATE_DATE' => '']));
        $transfer    = $this->invoiceFor(Company::factory()->create());

        $rows = collect($this->getJson('/api/invoices/sepa-direct-debits')->assertOk()->json())->keyBy('id');

        $this->assertSame([], $rows[$collectable->id]['sepa']['issues']);
        $this->assertEqualsWithDelta(119.0, $rows[$collectable->id]['sepa']['amount'], 0.001);
        $this->assertFalse($rows[$collectable->id]['sepa']['collected']);
        $this->assertSame(['mandate_date_missing'], $rows[$withoutDate->id]['sepa']['issues']);
        $this->assertArrayNotHasKey($transfer->id, $rows->all());
    }
    public function test_invoices_tell_whether_the_customer_pays_by_direct_debit(): void {
        $debit    = $this->invoiceFor($this->debtor());
        $transfer = $this->invoiceFor(Company::factory()->create());

        $this->assertTrue($this->getJson("/api/invoices/{$debit->id}")->assertOk()->json('company.has_direct_debit'));
        $this->assertFalse($this->getJson("/api/invoices/{$transfer->id}")->assertOk()->json('company.has_direct_debit'));
    }
    public function test_export_builds_a_pain_008_file_and_flags_the_invoices(): void {
        $invoice = $this->invoiceFor($this->debtor());

        $response = $this->post('/api/invoices/sepa-direct-debits', ['invoice_ids' => [$invoice->id], 'collection_date' => now()->addDays(3)->format('Y-m-d')]);

        $response->assertOk();
        $this->assertStringContainsString('attachment; filename="SEPA-Lastschrift-', $response->headers->get('Content-Disposition'));
        $xml = $response->getContent();
        $this->assertStringContainsString('urn:iso:std:iso:20022:tech:xsd:pain.008.001.08', $xml);
        $this->assertStringContainsString('<MndtId>M-0042</MndtId>', $xml);
        $this->assertStringContainsString('<DtOfSgntr>2024-01-15</DtOfSgntr>', $xml);
        $this->assertStringContainsString('<InstdAmt Ccy="EUR">119.00</InstdAmt>', $xml);
        $this->assertStringContainsString('<IBAN>'.self::DEBTOR_IBAN.'</IBAN>', $xml);
        $this->assertStringContainsString('<SeqTp>RCUR</SeqTp>', $xml);
        $this->assertStringContainsString('<Id>DE98ZZZ09999999999</Id>', $xml);
        $this->assertTrue($invoice->refresh()->getFlag(Invoice::FLAG_SEPA_COLLECTED));
        $this->assertNull($invoice->paid_at);
    }
    public function test_export_rejects_invoices_that_cannot_be_collected(): void {
        $invoice = $this->invoiceFor($this->debtor(['INVOICE_DD_IBAN' => 'DE00123456789012345678']));

        $this->postJson('/api/invoices/sepa-direct-debits', ['invoice_ids' => [$invoice->id], 'collection_date' => now()->addDays(3)->format('Y-m-d')])
            ->assertStatus(422)
            ->assertJsonPath('errors.'.$invoice->name, ['iban_invalid']);
        $this->assertFalse($invoice->refresh()->getFlag(Invoice::FLAG_SEPA_COLLECTED));
    }
    public function test_collection_date_must_lie_in_the_future(): void {
        $invoice = $this->invoiceFor($this->debtor());

        $this->postJson('/api/invoices/sepa-direct-debits', ['invoice_ids' => [$invoice->id], 'collection_date' => now()->format('Y-m-d')])
            ->assertJsonValidationErrors('collection_date');
    }
}
