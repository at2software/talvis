<?php

namespace App\Http\Controllers;

use App\Models\File;
use App\Services\MicrosoftGraph;
use App\Services\TeamsAppPackage;
use App\Traits\HasVaultCredentials;

class PluginM365Controller extends Controller {
    use HasVaultCredentials;

    public function __construct(?array $credentials = null) {
        $this->credentials = $credentials;
    }
    public function vaultPrefix(): string {
        return MicrosoftGraph::VAULT;
    }
    public function downloadTeamsAppPackage() {
        $appId = MicrosoftGraph::fromVault()?->credentialValue('CLIENT_ID');
        abort_unless($appId, 409, 'Configure the Microsoft 365 connector first.');
        $path = TeamsAppPackage::build($appId, tempnam(sys_get_temp_dir(), 'teams'));
        return response()->download($path, TeamsAppPackage::FILENAME, File::headers(TeamsAppPackage::FILENAME, 'application/zip'))->deleteFileAfterSend();
    }
    public function checkCredentials(): bool {
        return $this->checkResponse(fn () => (new MicrosoftGraph($this->credentials ?? $this->getCredentials()))->canReadUsers());
    }
}
