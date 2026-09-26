<?php

namespace Tests\Unit\Services;

use App\Enums\InvoiceItemType;
use App\Exceptions\InvoiceDataException;
use App\Services\ZugferdInvoiceBuilder;
use ReflectionClass;
use Tests\TestCase;

class ZugferdInvoiceBuilderTest extends TestCase {
    private function invokePrivate(string $method, ...$args) {
        $m = (new ReflectionClass(ZugferdInvoiceBuilder::class))->getMethod($method);
        $m->setAccessible(true);

        return $m->invokeArgs(null, $args);
    }

    private function item(InvoiceItemType $type, float $net = 0.0, float $gross = 0.0, float $vat = 0.0, float $vatRate = 19.0): object {
        return new class($type, $net, $gross, $vat, $vatRate) implements \ArrayAccess {
            public function __construct(
                public InvoiceItemType $type,
                public float $net,
                public float $gross,
                public float $vat,
                public float $vat_rate,
            ) {}

            public function offsetExists(mixed $offset): bool {
                return property_exists($this, $offset);
            }

            public function offsetGet(mixed $offset): mixed {
                return $this->{$offset};
            }

            public function offsetSet(mixed $offset, mixed $value): void {
                $this->{$offset} = $value;
            }

            public function offsetUnset(mixed $offset): void {}
        };
    }

    public function test_a_domestic_sale_is_not_reverse_charge_even_with_a_vat_id(): void {
        self::assertFalse($this->invokePrivate('isReverseCharge', 'DE', 'DE', true, 'DE123456789'));
    }

    public function test_the_same_holds_for_an_installation_in_another_member_state(): void {
        self::assertFalse($this->invokePrivate('isReverseCharge', 'AT', 'AT', true, 'ATU12345678'));
        self::assertTrue($this->invokePrivate('isReverseCharge', 'AT', 'DE', true, 'DE123456789'));
    }

    public function test_a_cross_border_eu_sale_with_a_vat_id_is_reverse_charge(): void {
        self::assertTrue($this->invokePrivate('isReverseCharge', 'DE', 'FR', true, 'FR12345678901'));
    }

    public function test_a_cross_border_eu_sale_without_a_vat_id_is_taxed_normally(): void {
        self::assertFalse($this->invokePrivate('isReverseCharge', 'DE', 'FR', true, null));
        self::assertFalse($this->invokePrivate('isReverseCharge', 'DE', 'FR', true, '   '));
    }

    public function test_a_buyer_outside_the_eu_is_never_reverse_charge(): void {
        self::assertFalse($this->invokePrivate('isReverseCharge', 'DE', 'CH', false, 'CHE123456789'));
    }

    public function test_an_unknown_buyer_country_falls_back_to_charging_vat(): void {
        self::assertFalse($this->invokePrivate('isReverseCharge', 'DE', '', true, 'DE123456789'));
    }

    public function test_billable_items_keeps_only_types_that_add_to_the_invoice(): void {
        $items = [
            $this->item(InvoiceItemType::Header),
            $this->item(InvoiceItemType::Default, 100.0),
            $this->item(InvoiceItemType::Optional, 999.0),
            $this->item(InvoiceItemType::Discount, -10.0),
            $this->item(InvoiceItemType::Inactive, 500.0),
            $this->item(InvoiceItemType::Paydown, -20.0),
            $this->item(InvoiceItemType::Instalment, 777.0),
        ];

        $billable = $this->invokePrivate('billableItems', $items);

        self::assertSame([
            InvoiceItemType::Default,
            InvoiceItemType::Discount,
            InvoiceItemType::Paydown,
        ], $billable->map(fn ($i) => $i->type)->all());
    }

    public function test_billable_items_is_reindexed_so_line_ids_are_contiguous(): void {
        $items = [
            $this->item(InvoiceItemType::Header),
            $this->item(InvoiceItemType::Default, 100.0),
            $this->item(InvoiceItemType::Optional, 999.0),
            $this->item(InvoiceItemType::Default, 50.0),
        ];

        self::assertSame([0, 1], $this->invokePrivate('billableItems', $items)->keys()->all());
    }

    public function test_billable_items_excludes_optional_lines_from_the_totals(): void {
        $items = [
            $this->item(InvoiceItemType::Default, 100.0, 119.0, 19.0),
            $this->item(InvoiceItemType::Optional, 999.0, 1188.81, 189.81),
        ];

        $billable = $this->invokePrivate('billableItems', $items);

        self::assertSame(100.0, $billable->sum('net'));
        self::assertSame(119.0, $billable->sum('gross'));
    }

    public function test_vat_breakdown_from_items_groups_by_rate(): void {
        $items = [
            ['net' => 100.0, 'vat' => 19.0, 'vat_rate' => 19.0],
            ['net' => 200.0, 'vat' => 38.0, 'vat_rate' => 19.0],
            ['net' => 50.0,  'vat' => 3.5,  'vat_rate' => 7.0],
        ];

        $breakdown = $this->invokePrivate('vatBreakdownFromItems', $items);

        self::assertCount(2, $breakdown);
        self::assertSame(['rate' => 19.0, 'taxable_amount' => 300.0, 'tax_amount' => 57.0, 'category' => 'S'], $breakdown[0]);
        self::assertSame(['rate' => 7.0, 'taxable_amount' => 50.0, 'tax_amount' => 3.5, 'category' => 'S'], $breakdown[1]);
    }

    public function test_vat_breakdown_merges_net_priced_and_gross_priced_items_at_the_same_rate(): void {
        $items = [
            ['net' => 100.0, 'vat' => 19.0, 'vat_rate' => 19.0],
            ['net' => 200.0, 'vat' => 38.0, 'vat_rate' => 19.0],
        ];

        $breakdown = $this->invokePrivate('vatBreakdownFromItems', $items);

        self::assertCount(1, $breakdown);
        self::assertSame(300.0, $breakdown[0]['taxable_amount']);
    }

    public function test_taxable_amount_is_summed_from_the_lines_not_back_computed_from_the_tax(): void {
        $items = [['net' => 33.33, 'vat' => 6.33, 'vat_rate' => 19.0]];

        $breakdown = $this->invokePrivate('vatBreakdownFromItems', $items);

        self::assertSame(33.33, $breakdown[0]['taxable_amount']);
        self::assertNotSame(round(6.33 / 19 * 100, 2), $breakdown[0]['taxable_amount']);
    }

    public function test_totals_that_add_up_are_accepted(): void {
        $this->invokePrivate('assertTotalsAddUp', 100.0, 19.0, 119.0);
        $this->expectNotToPerformAssertions();
    }

    public function test_totals_off_by_half_a_cent_are_still_accepted(): void {
        $this->invokePrivate('assertTotalsAddUp', 100.0, 19.0, 119.005);
        $this->expectNotToPerformAssertions();
    }

    public function test_reverse_charge_totals_without_vat_are_accepted(): void {
        $this->invokePrivate('assertTotalsAddUp', 100.0, 0.0, 100.0);
        $this->expectNotToPerformAssertions();
    }

    public function test_totals_that_do_not_add_up_are_rejected(): void {
        $this->expectException(InvoiceDataException::class);
        $this->expectExceptionMessageMatches('/BR-CO-15/');

        $this->invokePrivate('assertTotalsAddUp', 100.0, 19.0, 130.0);
    }

    public function test_a_missing_vat_breakdown_is_rejected_rather_than_silently_shipped(): void {
        $this->expectException(InvoiceDataException::class);

        $this->invokePrivate('assertTotalsAddUp', 100.0, 0.0, 119.0);
    }
}
