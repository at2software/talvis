<?php

namespace App\Http\Controllers;

use App\Actions\User\MirrorToMicrosoft365Action;
use App\Models\User;
use App\Services\MicrosoftGraph;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

/**
 * @see https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
 */
class Microsoft365AccountController extends Controller {
    private const STATE_TTL_SECONDS = 600;

    public function connect(Request $request) {
        $graph = MicrosoftGraph::fromVault();
        abort_unless($graph, 409, 'The Microsoft 365 connector is not configured.');
        $state = Crypt::encrypt(['user' => $request->user()->id, 'expires' => now()->addSeconds(self::STATE_TTL_SECONDS)->timestamp, 'nonce' => Str::random(16)]);
        return ['url' => $graph->authorizeUrl(self::callbackUrl(), $state)];
    }
    public function callback(Request $request, MirrorToMicrosoft365Action $mirror) {
        try {
            $state = Crypt::decrypt((string)$request->query('state'));
        } catch (DecryptException $e) {
            return self::backToProfile('error', 'Invalid sign-in request.');
        }
        $user  = User::find($state['user'] ?? null);
        $graph = MicrosoftGraph::fromVault();
        if (! $user || ! $graph || ($state['expires'] ?? 0) < now()->timestamp) {
            return self::backToProfile('error', 'The sign-in request expired, please try again.');
        }
        if ($request->filled('error')) {
            return self::backToProfile('error', (string)$request->query('error_description', $request->query('error')));
        }

        $account = $graph->accountFromAuthorizationCode((string)$request->query('code'), self::callbackUrl());
        if (! $account) {
            return self::backToProfile('error', 'Microsoft did not confirm an account of your organisation.');
        }
        $this->link($user, $account, $graph, $mirror);
        return self::backToProfile('connected');
    }
    public function destroy(User $user, MirrorToMicrosoft365Action $mirror) {
        abort_unless(request()->user()->id === $user->id || request()->user()->hasRole('admin'), 403);
        $this->link($user, null, MicrosoftGraph::fromVault(), $mirror);
        return $user->only(['id', 'm365_object_id', 'm365_address']);
    }

    /** @param array{id: string, address: string}|null $account */
    private function link(User $user, ?array $account, ?MicrosoftGraph $graph, MirrorToMicrosoft365Action $mirror): void {
        if ($user->m365_object_id && $user->m365_object_id !== ($account['id'] ?? null)) {
            $mirror->detachAll($user, $graph, $user->m365_object_id);
            $scheduled        = $user->param('M365_AUTOREPLY_VACATION_ID');
            $scheduled->value = '';
            $scheduled->save();
        }
        $user->forceFill(['m365_object_id' => $account['id'] ?? null, 'm365_address' => $account['address'] ?? null])->save();
    }

    private static function callbackUrl(): string {
        return rtrim(config('app.api_url'), '/').'/microsoft365/callback';
    }
    private static function backToProfile(string $result, ?string $message = null) {
        return redirect(rtrim(config('app.url'), '/').'/profile/vcard?'.http_build_query(array_filter(['m365' => $result, 'message' => $message])));
    }
}
