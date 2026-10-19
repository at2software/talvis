<?php

namespace App\Services;

use App\Models\Vault;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class MicrosoftGraph {
    public const VAULT       = 'M365';
    private const API        = 'https://graph.microsoft.com/v1.0/';
    private const TIME_ZONE  = 'Europe/Berlin';

    /** @param array<string, ?string> $credentials */
    public function __construct(private array $credentials) {}

    public static function fromVault(): ?self {
        return Vault::isActive(self::VAULT) ? new self(Vault::getCredentials(self::VAULT)) : null;
    }
    private function credential(string $key): string {
        return (string)($this->credentials[self::VAULT.'_'.$key] ?? '');
    }
    public function accessToken(): string {
        $cacheKey = 'm365_token_'.hash('sha256', $this->credential('TENANT_ID').$this->credential('CLIENT_ID').$this->credential('CLIENT_SECRET'));
        return Cache::remember($cacheKey, now()->addMinutes(50), fn () => Http::asForm()
            ->post('https://login.microsoftonline.com/'.rawurlencode($this->credential('TENANT_ID')).'/oauth2/v2.0/token', [
                'client_id'     => $this->credential('CLIENT_ID'),
                'client_secret' => $this->credential('CLIENT_SECRET'),
                'scope'         => 'https://graph.microsoft.com/.default',
                'grant_type'    => 'client_credentials',
            ])
            ->throw()
            ->json('access_token'));
    }
    private function request(): PendingRequest {
        return Http::baseUrl(self::API)->withToken($this->accessToken())->acceptJson()->timeout(15);
    }
    public function canReadUsers(): bool {
        try {
            return $this->request()->get('users', ['$top' => 1, '$select' => 'id'])->successful();
        } catch (RequestException $e) {
            return false;
        }
    }

    /** @return array{start: array{dateTime: string, timeZone: string}, end: array{dateTime: string, timeZone: string}} */
    public static function allDayRange(\DateTimeInterface $firstDay, \DateTimeInterface $endExclusive): array {
        return [
            'start' => ['dateTime' => $firstDay->format('Y-m-d').'T00:00:00', 'timeZone' => self::TIME_ZONE],
            'end'   => ['dateTime' => $endExclusive->format('Y-m-d').'T00:00:00', 'timeZone' => self::TIME_ZONE],
        ];
    }

    public const CALENDAR = 'calendar';
    public const CONTACTS = 'contacts';
    private const FOLDERS = [
        self::CALENDAR => ['collection' => 'calendars', 'items' => 'events', 'name' => 'name'],
        self::CONTACTS => ['collection' => 'contactFolders', 'items' => 'contacts', 'name' => 'displayName'],
    ];

    public function ensureFolder(string $mailbox, string $kind, ?string $folderId, string $name): string {
        $folder = self::FOLDERS[$kind];
        $base   = 'users/'.rawurlencode($mailbox).'/'.$folder['collection'];
        if ($folderId && $this->request()->get($base.'/'.rawurlencode($folderId), ['$select' => 'id'])->successful()) {
            return $folderId;
        }
        $existing = $this->request()->get($base, ['$filter' => $folder['name']." eq '".str_replace("'", "''", $name)."'", '$select' => 'id'])->throw()->json('value.0.id');
        return $existing ?? $this->request()->post($base, [$folder['name'] => $name])->throw()->json('id');
    }
    public function deleteFolder(string $mailbox, string $kind, string $folderId): void {
        $response = $this->request()->delete('users/'.rawurlencode($mailbox).'/'.self::FOLDERS[$kind]['collection'].'/'.rawurlencode($folderId));
        if ($response->status() !== 404) {
            $response->throw();
        }
    }
    public function upsertItem(string $mailbox, string $kind, string $folderId, ?string $itemId, array $payload): string {
        $folder = self::FOLDERS[$kind];
        $user   = 'users/'.rawurlencode($mailbox).'/';
        if ($itemId) {
            $response = $this->request()->patch($user.$folder['items'].'/'.rawurlencode($itemId), $payload);
            if ($response->status() !== 404) {
                return $response->throw()->json('id');
            }
        }
        return $this->request()->post($user.$folder['collection'].'/'.rawurlencode($folderId).'/'.$folder['items'], $payload)->throw()->json('id');
    }
    public function deleteItem(string $mailbox, string $kind, string $itemId): void {
        $response = $this->request()->delete('users/'.rawurlencode($mailbox).'/'.self::FOLDERS[$kind]['items'].'/'.rawurlencode($itemId));
        if ($response->status() !== 404) {
            $response->throw();
        }
    }
    public function credentialValue(string $key): string {
        return $this->credential($key);
    }
    private function authority(): string {
        return 'https://login.microsoftonline.com/'.rawurlencode($this->credential('TENANT_ID')).'/oauth2/v2.0/';
    }
    public function authorizeUrl(string $redirectUri, string $state): string {
        return $this->authority().'authorize?'.http_build_query([
            'client_id'     => $this->credential('CLIENT_ID'),
            'response_type' => 'code',
            'redirect_uri'  => $redirectUri,
            'response_mode' => 'query',
            'scope'         => 'openid profile',
            'state'         => $state,
            'prompt'        => 'select_account',
        ]);
    }

    /**
     * The ID token comes straight from the token endpoint over TLS, which OpenID Connect Core 3.1.3.7 accepts in place of a signature check.
     *
     * @return array{id: string, address: string}|null
     */
    public function accountFromAuthorizationCode(string $code, string $redirectUri): ?array {
        $response = Http::asForm()->post($this->authority().'token', [
            'client_id'     => $this->credential('CLIENT_ID'),
            'client_secret' => $this->credential('CLIENT_SECRET'),
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'redirect_uri'  => $redirectUri,
            'scope'         => 'openid profile',
        ]);
        $parts  = explode('.', (string)$response->json('id_token'));
        $claims = count($parts) === 3 ? json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true) : null;
        if (! $response->successful() || ! is_array($claims) || ($claims['tid'] ?? null) !== $this->credential('TENANT_ID') || ($claims['aud'] ?? null) !== $this->credential('CLIENT_ID') || empty($claims['oid'])) {
            return null;
        }
        return ['id' => $claims['oid'], 'address' => $claims['preferred_username'] ?? $claims['email'] ?? $claims['oid']];
    }

    /** @return list<array{id: string, displayName: string, description: ?string}> */
    public function channels(string $teamId): array {
        return $this->request()->get('teams/'.rawurlencode($teamId).'/channels', ['$select' => 'id,displayName,description'])->throw()->json('value') ?? [];
    }

    public function createChannel(string $teamId, string $displayName, string $description): ?string {
        return $this->request()->post('teams/'.rawurlencode($teamId).'/channels', [
            'displayName'    => $displayName,
            'description'    => $description,
            'membershipType' => 'standard',
        ])->throw()->json('id');
    }
    public function updateChannel(string $teamId, string $channelId, array $changes): void {
        $this->request()->patch('teams/'.rawurlencode($teamId).'/channels/'.rawurlencode($channelId), $changes)->throw();
    }
    public function addTeamMember(string $teamId, string $userId): void {
        $response = $this->request()->post('teams/'.rawurlencode($teamId).'/members', [
            '@odata.type'     => '#microsoft.graph.aadUserConversationMember',
            'roles'           => [],
            'user@odata.bind' => self::API.'users(\''.$userId.'\')',
        ]);
        if ($response->status() !== 409) {
            $response->throw();
        }
    }
    public function setPreferredPresence(string $userId, ?string $availability): void {
        $path = 'users/'.rawurlencode($userId).'/presence/';
        $availability
            ? $this->request()->post($path.'setUserPreferredPresence', ['availability' => $availability, 'activity' => $availability === 'Offline' ? 'OffWork' : $availability])->throw()
            : $this->request()->post($path.'clearUserPreferredPresence')->throw();
    }

    /** @return list<array<string, mixed>> */
    public function calendarView(string $mailbox, \DateTimeInterface $from, \DateTimeInterface $until): array {
        $request = $this->request()->withHeaders(['Prefer' => 'outlook.timezone="'.self::TIME_ZONE.'"']);
        $events  = [];
        $url     = 'users/'.rawurlencode($mailbox).'/calendar/calendarView';
        $query   = [
            'startDateTime' => $from->format(DATE_ATOM),
            'endDateTime'   => $until->format(DATE_ATOM),
            '$select'       => 'id,subject,start,end,isAllDay,isCancelled,showAs',
            '$top'          => 200,
        ];
        while ($url) {
            $page   = $request->get($url, $query)->throw();
            $events = [...$events, ...$page->json('value', [])];
            $url    = $page->json('@odata.nextLink');
            $query  = [];
        }
        return $events;
    }

    public function scheduleAutomaticReplies(string $mailbox, \DateTimeInterface $from, \DateTimeInterface $until, string $message): void {
        $range = self::allDayRange($from, $until);
        $this->request()->patch('users/'.rawurlencode($mailbox).'/mailboxSettings', [
            'automaticRepliesSetting' => [
                'status'                 => 'scheduled',
                'externalAudience'       => 'all',
                'scheduledStartDateTime' => $range['start'],
                'scheduledEndDateTime'   => $range['end'],
                'internalReplyMessage'   => $message,
                'externalReplyMessage'   => $message,
            ],
        ])->throw();
    }
}
