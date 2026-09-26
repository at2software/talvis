<?php

namespace Tests\Unit\Models;

use App\Models\Company;
use Tests\TestCase;

class CompanyInvoiceRecipientsTest extends TestCase {
    private function recipients(?string $invoiceEmail): array {
        $company = new Company;
        $company->invoice_email = $invoiceEmail;
        return $company->invoiceRecipients();
    }

    public function test_a_single_address_is_returned_as_is(): void {
        self::assertSame(['billing@example.com'], $this->recipients('billing@example.com'));
    }

    public function test_semicolon_and_comma_separated_addresses_are_split_and_trimmed(): void {
        self::assertSame(
            ['a@example.com', 'b@example.com', 'c@example.com'],
            $this->recipients(' a@example.com; b@example.com ,c@example.com ')
        );
    }

    public function test_invalid_and_duplicate_entries_are_dropped(): void {
        self::assertSame(['a@example.com'], $this->recipients('a@example.com; not-an-address; ; a@example.com'));
    }

    public function test_an_empty_field_yields_no_recipients(): void {
        self::assertSame([], $this->recipients(null));
        self::assertSame([], $this->recipients(''));
    }
}
