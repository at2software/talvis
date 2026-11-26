<?php

namespace Tests\Support;

use App\Http\Controllers\PluginMattermostController;

class FakeMattermostChannel extends PluginMattermostController {
    public string $header = '';
    public array $writes  = [];

    public function __construct() {}
    protected function get($path, $payload = []): mixed {
        return ['header' => $this->header, 'display_name' => 'Kleeblatt - Bauinfo'];
    }
    protected function put($path, $payload = []): mixed {
        $this->writes[] = [$path, $payload];
        $this->header   = $payload['header'] ?? $this->header;
        return [];
    }
}
