<?php

namespace Tests\Unit\Cache;

use Illuminate\Cache\FileStore;
use Illuminate\Filesystem\Filesystem;
use Tests\TestCase;

class FileCacheStoreTest extends TestCase {
    private string $directory;

    protected function setUp(): void {
        parent::setUp();
        $this->directory = sys_get_temp_dir().'/talvis-file-cache-'.uniqid();
    }

    protected function tearDown(): void {
        (new Filesystem)->deleteDirectory($this->directory);
        parent::tearDown();
    }

    private function configuredStore(): FileStore {
        return new FileStore(
            new Filesystem,
            $this->directory,
            config('cache.stores.file.permission'),
        );
    }

    public function test_the_configured_permission_allows_a_write_and_read_back(): void {
        $store = $this->configuredStore();

        $store->put('probe', 'value', 60);

        $this->assertSame('value', $store->get('probe'));
    }

    public function test_a_configured_permission_keeps_the_execute_bit(): void {
        $permission = config('cache.stores.file.permission');

        $this->assertTrue(
            $permission === null || ($permission & 0100) !== 0,
            sprintf(
                'cache.stores.file.permission is %o. FileStore applies it to the two directory levels it creates, '
                .'not just to the cache file, so a value without the execute bit makes them untraversable.',
                $permission ?? 0
            )
        );
    }
}
