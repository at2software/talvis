<?php

namespace Tests\Unit\Support;

use App\Support\SlackMrkdwn;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class SlackMrkdwnTest extends TestCase {
    public static function conversions(): array {
        return [
            'bold'                    => ['**Invoice Paid**', '*Invoice Paid*'],
            'link'                    => ['[#12](https://git/x/-/issues/12)', '<https://git/x/-/issues/12|#12>'],
            'heading'                 => ['#### Bestellte Features:', '*Bestellte Features:*'],
            'task list'               => ['* [ ] Login (2 h)', '☐ Login (2 h)'],
            'bullet'                  => ['* item', '• item'],
            'strike'                  => ['~~old~~', '~old~'],
            'html is escaped'         => ['a < b & c > d', 'a &lt; b &amp; c &gt; d'],
            'inline image uses title' => ['done ![x](https://i/a.png =16x16 "success") `unit`', 'done success `unit`'],
            'inline image uses alt'   => ['by ![Jane](https://i/j.png =16)', 'by Jane'],
            'image alone on its line' => ['![projekt](https://t/p.png)', '<https://t/p.png|projekt>'],
            'badge inside link'       => ['[![lint](https://i/b.png =44x22 "lint (failed)") `x`](U/-/jobs/1)', '<U/-/jobs/1|lint (failed) `x`>'],
            'emoji untouched'         => [':star: :slack:', ':star: :slack:'],
        ];
    }

    #[DataProvider('conversions')]
    public function test_markdown_is_converted_to_mrkdwn(string $markdown, string $expected): void {
        $this->assertSame($expected, SlackMrkdwn::from($markdown));
    }
}
