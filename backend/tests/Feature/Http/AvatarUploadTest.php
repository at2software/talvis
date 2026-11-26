<?php

namespace Tests\Feature\Http;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class AvatarUploadTest extends TestCase {
    use DatabaseTransactions;

    protected function setUp(): void {
        parent::setUp();
        if (! function_exists('imagewebp') || ! function_exists('imagecreatefromwebp')) {
            $this->markTestSkipped('GD without WebP support');
        }
    }
    public static function targets(): array {
        return [
            'company' => ['companies'],
            'user'    => ['users'],
        ];
    }
    private function target(string $type): array {
        $user = User::factory()->create();
        $obj  = $type === 'companies' ? Company::factory()->create() : $user;
        return [$user, $obj];
    }
    private static function image(string $format): string {
        $img = imagecreatetruecolor(8, 8);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagefill($img, 0, 0, imagecolorallocatealpha($img, 0, 0, 0, 127));
        imagefilledrectangle($img, 2, 2, 5, 5, imagecolorallocatealpha($img, 255, 0, 0, 0));
        ob_start();
        match ($format) {
            'webp' => imagewebp($img, null, defined('IMG_WEBP_LOSSLESS') ? IMG_WEBP_LOSSLESS : 100),
            'png'  => imagepng($img),
            'jpg'  => imagejpeg($img),
        };
        return ob_get_clean();
    }
    private function upload(User $user, string $type, Model $obj, UploadedFile $file) {
        return $this->actingAs($user)->post("/api/$type/{$obj->id}/avatar", ['file' => $file], ['Accept' => 'application/json']);
    }
    private function photoRow(Model $obj) {
        $obj->refresh();
        foreach ($obj->vcard->getRows() as $row) {
            if ($row->getName() === 'PHOTO') {
                return $row;
            }
        }
        $this->fail('no PHOTO stored');
    }
    #[DataProvider('targets')]
    public function test_webp_is_stored_as_png_with_transparency(string $type): void {
        [$user, $obj] = $this->target($type);

        $this->upload($user, $type, $obj, UploadedFile::fake()->createWithContent('logo.webp', self::image('webp')))->assertOk();

        $row = $this->photoRow($obj);
        $this->assertTrue($row->hasParameter('TYPE', 'image/png'));
        $binary = base64_decode($obj->vcard->getPhoto());
        $this->assertSame('image/png', getimagesizefromstring($binary)['mime']);

        $png = imagecreatefromstring($binary);
        $this->assertSame(127, (imagecolorat($png, 0, 0) >> 24) & 0x7F, 'transparent corner');
        $this->assertSame(0, (imagecolorat($png, 3, 3) >> 24) & 0x7F, 'opaque center');

        $icon = $this->actingAs($user)->get("/api/$type/{$obj->id}/icon")->assertOk();
        $this->assertStringStartsWith("\x89PNG", $icon->getContent());
    }
    #[DataProvider('targets')]
    public function test_png_and_jpeg_are_stored_unchanged(string $type): void {
        [$user, $obj] = $this->target($type);

        foreach (['png' => 'image/png', 'jpg' => 'image/jpeg'] as $ext => $mime) {
            $content = self::image($ext);
            $this->upload($user, $type, $obj, UploadedFile::fake()->createWithContent("logo.$ext", $content))->assertOk();

            $this->assertTrue($this->photoRow($obj)->hasParameter('TYPE', $mime));
            $this->assertSame($content, base64_decode($obj->vcard->getPhoto()));
        }
    }
    #[DataProvider('targets')]
    public function test_text_disguised_as_webp_is_rejected(string $type): void {
        [$user, $obj] = $this->target($type);

        $this->upload($user, $type, $obj, UploadedFile::fake()->createWithContent('logo.webp', 'just some text, not an image'))->assertStatus(422);
    }
}
