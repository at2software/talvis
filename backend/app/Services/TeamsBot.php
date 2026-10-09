<?php

namespace App\Services;

use App\Models\Param;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * @see https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-api-reference
 * @see https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication
 */
class TeamsBot {
    public const SERVICE_URL_PARAM     = 'TEAMS_SERVICE_URL';
    private const DEFAULT_SERVICE_URL  = 'https://smba.trafficmanager.net/teams/';
    private const OPENID_CONFIGURATION = 'https://login.botframework.com/v1/.well-known/openidconfiguration';
    private const ISSUER               = 'https://api.botframework.com';

    public function __construct(private MicrosoftGraph $graph) {}

    private function appId(): string {
        return $this->graph->credentialValue('CLIENT_ID');
    }
    private function accessToken(): string {
        $tenant = $this->graph->credentialValue('TENANT_ID');
        return Cache::remember('teams_bot_token_'.hash('sha256', $tenant.$this->appId()), now()->addMinutes(50), fn () => Http::asForm()
            ->post('https://login.microsoftonline.com/'.rawurlencode($tenant).'/oauth2/v2.0/token', [
                'client_id'     => $this->appId(),
                'client_secret' => $this->graph->credentialValue('CLIENT_SECRET'),
                'scope'         => 'https://api.botframework.com/.default',
                'grant_type'    => 'client_credentials',
            ])
            ->throw()
            ->json('access_token'));
    }
    private function connector(): PendingRequest {
        $serviceUrl = rtrim(Param::get(self::SERVICE_URL_PARAM)->value ?: self::DEFAULT_SERVICE_URL, '/').'/';
        return Http::baseUrl($serviceUrl.'v3/')->withToken($this->accessToken())->acceptJson()->timeout(15);
    }
    private static function activity(string $markdown): array {
        return ['type' => 'message', 'textFormat' => 'markdown', 'text' => $markdown];
    }

    /** @return array{conversation: string, activity: string}|null */
    public function startChannelThread(string $channelId, string $markdown): ?array {
        $data = $this->connector()->post('conversations', [
            'isGroup'     => true,
            'channelData' => ['channel' => ['id' => $channelId]],
            'activity'    => self::activity($markdown),
        ])->throw()->json();
        return isset($data['id']) ? ['conversation' => $data['id'], 'activity' => $data['activityId'] ?? $data['id']] : null;
    }

    public function updateActivity(string $conversationId, string $activityId, string $markdown): void {
        $this->connector()->put('conversations/'.rawurlencode($conversationId).'/activities/'.rawurlencode($activityId), [
            ...self::activity($markdown),
            'id' => $activityId,
        ])->throw();
    }
    public function sendToConversation(string $conversationId, string $markdown): ?string {
        return $this->connector()->post('conversations/'.rawurlencode($conversationId).'/activities', self::activity($markdown))->throw()->json('id');
    }
    public function personalConversation(string $userObjectId): ?string {
        $tenant = $this->graph->credentialValue('TENANT_ID');
        return Cache::remember('teams_personal_'.$userObjectId, now()->addDays(30), fn () => $this->connector()->post('conversations', [
            'bot'         => ['id' => '28:'.$this->appId()],
            'members'     => [['id' => '29:'.$userObjectId, 'aadObjectId' => $userObjectId]],
            'isGroup'     => false,
            'tenantId'    => $tenant,
            'channelData' => ['tenant' => ['id' => $tenant]],
        ])->throw()->json('id'));
    }
    public function verifyInboundToken(?string $authorization): bool {
        if (! $authorization || ! str_starts_with($authorization, 'Bearer ')) {
            return false;
        }
        try {
            $keys = Cache::remember('teams_bot_jwks', now()->addHours(12), function () {
                $jwksUri = Http::get(self::OPENID_CONFIGURATION)->throw()->json('jwks_uri');
                return Http::get($jwksUri)->throw()->json();
            });
            $claims = JWT::decode(substr($authorization, 7), JWK::parseKeySet($keys, 'RS256'));
            return ($claims->iss ?? null) === self::ISSUER && ($claims->aud ?? null) === $this->appId();
        } catch (\Throwable $e) {
            return false;
        }
    }
}
