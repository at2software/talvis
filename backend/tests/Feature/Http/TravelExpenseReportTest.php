<?php

namespace Tests\Feature\Http;

use App\Enums\FileType;
use App\Models\File;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Group;
use setasign\Fpdi\Fpdi;
use Tests\TestCase;

#[Group('database')]
class TravelExpenseReportTest extends TestCase {
    use DatabaseTransactions;

    protected function setUp(): void {
        parent::setUp();
        Storage::fake();
    }
    private static function data(): string {
        return json_encode([
            'purpose'  => 'Kickoff',
            'way'      => 'Kassel - Berlin',
            'start'    => '2026-11-16 08:00',
            'end'      => '2026-11-16 19:00',
            'days'     => [['name' => '2026-11-16', 'brunch' => false, 'lunch' => false, 'dinner' => false, 'sleep' => false, 'base' => 14, 'sum' => 14]],
            'expenses' => [['type' => 1, 'name' => 'train', 'value' => 120, 'suffix' => '€', 'sum' => 120]],
        ]);
    }
    private function submit(User $user, array $files = []) {
        return $this->actingAs($user)->post('/api/users/travel-expenses', ['data' => self::data(), 'file' => $files], ['Accept' => 'application/json']);
    }
    private static function pageCount(string $pdf): int {
        $path = tempnam(sys_get_temp_dir(), 'pdf');
        file_put_contents($path, $pdf);
        try {
            return (new Fpdi)->setSourceFile($path);
        } finally {
            unlink($path);
        }
    }
    private static function travelExpenseFiles(User $user) {
        return File::where('type', FileType::TypeTravelExpenses)->where($user->toPoly());
    }
    public function test_report_without_attachments_is_downloaded_and_stored(): void {
        $user = User::factory()->create();

        $response = $this->submit($user)->assertOk()->assertHeader('Content-Type', 'application/pdf');

        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->assertStringContainsString('attachment; filename=', $response->headers->get('Content-Disposition'));
        $file = self::travelExpenseFiles($user)->sole();
        Storage::assertExists($file->dir);
    }
    public function test_pdf_attachments_are_appended_to_the_report(): void {
        $user   = User::factory()->create();
        $single = self::pageCount($this->submit($user)->getContent());

        $attachment = UploadedFile::fake()->createWithContent('receipt.pdf', $this->submit($user)->getContent());
        $merged     = $this->submit($user, [$attachment])->assertOk()->getContent();

        $this->assertSame(2 * $single, self::pageCount($merged));
    }
    public function test_non_pdf_attachment_is_rejected_before_anything_is_stored(): void {
        $user = User::factory()->create();

        $this->submit($user, [UploadedFile::fake()->image('receipt.jpg')])->assertStatus(422);

        $this->assertSame(0, self::travelExpenseFiles($user)->count());
    }
}
