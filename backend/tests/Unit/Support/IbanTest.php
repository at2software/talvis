<?php

namespace Tests\Unit\Support;

use App\Support\Iban;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class IbanTest extends TestCase {
    public static function ibans(): array {
        return [
            ['DE89370400440532013000', true],
            ['de89 3704 0044 0532 0130 00', true],
            ['GB82WEST12345698765432', true],
            ['AT611904300234573201', true],
            ['DE89370400440532013001', false],
            ['DE8937040044', false],
            ['', false],
        ];
    }

    #[DataProvider('ibans')]
    public function test_checksum_validation(string $iban, bool $valid): void {
        $this->assertSame($valid, Iban::isValid($iban));
    }
}
