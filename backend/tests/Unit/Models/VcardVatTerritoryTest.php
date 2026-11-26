<?php

namespace Tests\Unit\Models;

use App\Models\Vcard;
use Tests\TestCase;

class VcardVatTerritoryTest extends TestCase {
    private function vcard(string $zip, string $country): Vcard {
        return new Vcard("BEGIN:VCARD\nVERSION:3.0\nADR;TYPE=work:;;Street 1;City;;$zip;$country\nEND:VCARD");
    }
    public function test_a_mainland_member_state_address_needs_vat_handling(): void {
        self::assertTrue($this->vcard('87435', 'DE')->needsVatHandling());
        self::assertTrue($this->vcard('28001', 'ES')->needsVatHandling());
    }
    public function test_an_address_outside_the_eu_needs_no_vat_handling(): void {
        self::assertFalse($this->vcard('8001', 'CH')->needsVatHandling());
    }
    public function test_german_territories_outside_the_vat_area_need_no_vat_handling(): void {
        self::assertFalse($this->vcard('27498', 'DE')->needsVatHandling());
        self::assertFalse($this->vcard('78266', 'DE')->needsVatHandling());
    }
    public function test_territories_are_matched_by_postal_code_prefix_ignoring_formatting(): void {
        self::assertFalse($this->vcard('38001', 'ES')->needsVatHandling());
        self::assertFalse($this->vcard('AX-22100', 'FI')->needsVatHandling());
        self::assertFalse($this->vcard('630 86', 'GR')->needsVatHandling());
        self::assertFalse($this->vcard('97400', 'FR')->needsVatHandling());
        self::assertFalse($this->vcard('97150', 'FR')->needsVatHandling());
        self::assertFalse($this->vcard('98800', 'FR')->needsVatHandling());
        self::assertFalse($this->vcard('23041', 'IT')->needsVatHandling());
    }
    public function test_neighbouring_postal_codes_stay_in_the_vat_area(): void {
        self::assertTrue($this->vcard('75001', 'FR')->needsVatHandling());
        self::assertTrue($this->vcard('23030', 'IT')->needsVatHandling());
        self::assertTrue($this->vcard('27499', 'DE')->needsVatHandling());
    }
    public function test_monaco_belongs_to_the_french_vat_area(): void {
        self::assertTrue($this->vcard('98000', 'MC')->needsVatHandling());
    }
    public function test_a_prefix_only_applies_within_its_own_country(): void {
        self::assertTrue($this->vcard('22100', 'DE')->needsVatHandling());
    }
    public function test_an_address_without_country_falls_back_to_vat_handling(): void {
        self::assertTrue(new Vcard("BEGIN:VCARD\nVERSION:3.0\nFN:Test\nEND:VCARD")->needsVatHandling());
    }
}
