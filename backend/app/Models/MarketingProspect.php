<?php

namespace App\Models;

use App\Traits\VcardGenderTrait;
use App\Traits\VcardTrait;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MarketingProspect extends BaseModel {
    use VcardGenderTrait;
    use VcardTrait;

    protected $table    = 'marketing_prospects';
    protected $fillable = [
        'marketing_initiative_id',
        'lead_source_id',
        'user_id',
        'company_id',
        'company_contact_id',
        'vcard',
        'status',
        'days_skipped',
        'added_via',
        'external_data',
        'notes',
        'color',
    ];

    protected function casts(): array {
        return [
            'external_data' => 'array',
        ];
    }

    protected $appends = ['icon', 'class', 'gender'];

    public function marketingInitiative(): BelongsTo {
        return $this->belongsTo(MarketingInitiative::class);
    }
    public function leadSource(): BelongsTo {
        return $this->belongsTo(LeadSource::class);
    }
    public function user(): BelongsTo {
        return $this->belongsTo(User::class);
    }
    public function company(): BelongsTo {
        return $this->belongsTo(Company::class);
    }
    public function companyContact(): BelongsTo {
        return $this->belongsTo(CompanyContact::class);
    }
    public function touchpoints(): HasMany {
        return $this->hasMany(MarketingTouchpoint::class);
    }
    public function logTouchpoint(User $user, array $data, ?MarketingProspectActivity $activity = null): MarketingTouchpoint {
        return DB::transaction(function () use ($user, $data, $activity) {
            $touchpoint = $this->touchpoints()->create([
                'user_id'                        => $user->id,
                'marketing_prospect_activity_id' => $activity?->id,
                'company_id'                     => $this->companyContact?->company_id ?? $this->company_id,
                'channel'                        => $data['channel'],
                'result'                         => $data['result'],
                'outcome'                        => $data['outcome'] ?? null,
                'notes'                          => $data['notes'] ?? null,
                'occurred_at'                    => now(),
            ]);

            $activity?->applyTouchpoint($touchpoint, isset($data['retry_at']) ? Carbon::parse($data['retry_at']) : null);

            $status = $touchpoint->outcome?->prospectStatus();
            if ($status && $this->refresh()->status !== 'converted') {
                $this->update(['status' => $status]);
            }
            return $touchpoint;
        });
    }
    public function activities(): HasMany {
        return $this->hasMany(MarketingProspectActivity::class, 'marketing_prospect_id');
    }
    public function pendingActivities(): HasMany {
        return $this->activities()->where('status', 'pending');
    }
    public function completedActivities(): HasMany {
        return $this->activities()->where('status', 'completed');
    }
    public function overdueActivities(): HasMany {
        return $this->activities()
            ->where('status', 'pending')
            ->where('scheduled_at', '<', now());
    }
    public function todayActivities(): HasMany {
        return $this->activities()
            ->where('status', 'pending')
            ->whereDate('scheduled_at', today());
    }
    public function scopeByStatus($query, string $status) {
        return $query->where('status', $status);
    }
    public function scopeByChannel($query, int $leadSourceId) {
        return $query->where('lead_source_id', $leadSourceId);
    }
    public function scopeAddedViaAddon($query) {
        return $query->where('added_via', 'addon');
    }
    public function scopeRecentlyAdded($query, int $days = 7) {
        return $query->where('created_at', '>=', now()->subDays($days));
    }
    public function getStatusLabel(): string {
        return match ($this->status) {
            'new'          => 'New',
            'engaged'      => 'Engaged',
            'converted'    => 'Converted',
            'unresponsive' => 'Unresponsive',
            'disqualified' => 'Disqualified',
            'on_hold'      => 'On Hold',
            default        => ucfirst($this->status)
        };
    }
    public function getNextActivity(): ?MarketingProspectActivity {
        return $this->pendingActivities()
            ->with('marketingInitiativeActivity')
            ->orderBy('scheduled_at')
            ->first();
    }
    public function getCompletionRate(): float {
        $total = $this->activities()->count();

        if ($total === 0) {
            return 0;
        }

        $completed = $this->completedActivities()->count();
        return ($completed / $total) * 100;
    }
    public function hasOverdueActivities(): bool {
        return $this->overdueActivities()->exists();
    }
    public function markActivityCompleted(int $activityId, ?string $notes = null, ?float $performanceValue = null): bool {
        $activity = $this->activities()->with('marketingInitiativeActivity')->find($activityId);

        if (! $activity || $activity->status !== 'pending') {
            return false;
        }

        $activity->update([
            'status'            => 'completed',
            'completed_at'      => now(),
            'notes'             => $notes,
            'performance_value' => $performanceValue,
        ]);

        if (! $this->pendingActivities()->exists()) {
            $this->update(['status' => 'engaged']);
        }
        return true;
    }
    public function initializeWorkflowActivities(): void {
        $initiativeActivities = $this->marketingInitiative->orderedInitiativeActivities;

        if ($initiativeActivities->isEmpty()) {
            return;
        }

        $baseDate = $this->created_at;

        $sortedActivities = $this->topologicalSort($initiativeActivities);

        $createdActivities = [];
        foreach ($sortedActivities as $activity) {
            if ($activity->parent_activity_id && isset($createdActivities[$activity->parent_activity_id])) {
                $parentScheduledAt = $createdActivities[$activity->parent_activity_id];
                $scheduledAt       = $parentScheduledAt->copy()->addDays($activity->day_offset);
            } else {
                $scheduledAt = $baseDate->copy()->addDays($activity->day_offset - 1);
            }

            $prospectActivity = MarketingProspectActivity::create([
                'marketing_prospect_id'            => $this->id,
                'marketing_initiative_activity_id' => $activity->id,
                'scheduled_at'                     => $scheduledAt,
                'status'                           => 'pending',
            ]);

            $createdActivities[$activity->id] = $scheduledAt;
        }
    }
    private function topologicalSort($activities): array {
        $sorted         = [];
        $visited        = [];
        $activitiesById = [];

        foreach ($activities as $activity) {
            $activitiesById[$activity->id] = $activity;
        }

        $visit = function ($activity) use (&$visit, &$sorted, &$visited, $activitiesById) {
            if (isset($visited[$activity->id])) {
                return;
            }

            $visited[$activity->id] = true;

            if ($activity->parent_activity_id && isset($activitiesById[$activity->parent_activity_id])) {
                $visit($activitiesById[$activity->parent_activity_id]);
            }

            $sorted[] = $activity;
        };

        foreach ($activities as $activity) {
            $visit($activity);
        }
        return $sorted;
    }
    public function getDaysInWorkflow(): int {
        return $this->created_at->diffInDays(now());
    }
    public function getLinkedinUrlAttribute(): ?string {
        return $this->vcard->getFirstValue('URL', null);
    }
    public function getPhoneAttribute(): ?string {
        return $this->vcard->getFirstValue('TEL');
    }
    public function getCompanyAttribute(): ?string {
        return $this->vcard->getFirstValue('ORG');
    }
    public function getPositionAttribute(): ?string {
        return $this->vcard->getFirstValue('TITLE');
    }
    public function getLinkedInProfileId(): ?string {
        $linkedinUrl = $this->linkedin_url;

        if (! $linkedinUrl) {
            return null;
        }

        preg_match('/\/in\/([^\/\?]+)/', $linkedinUrl, $matches);
        return $matches[1] ?? null;
    }
    public function postponeActivities(int $days): bool {
        $updated = $this->activities()
            ->where('status', 'pending')
            ->update([
                'scheduled_at' => DB::raw("DATE_ADD(scheduled_at, INTERVAL {$days} DAY)"),
            ]);

        $this->increment('days_skipped', $days);
        return $updated > 0;
    }
    public function getLastCompletedActivityAtAttribute(): ?string {
        $lastCompletedAt = $this->activities()
            ->where('status', 'completed')
            ->whereNotNull('completed_at')
            ->max('completed_at');
        return $lastCompletedAt;
    }
    public static function filteredQuery(Request $request) {
        $query = static::with(['marketingInitiative', 'leadSource', 'activities.marketingInitiativeActivity.i18n', 'company', 'companyContact.contact', 'companyContact.company', 'user'])
            ->withExists([
                'activities as has_overdue_activities' => fn ($q) => $q
                    ->where('status', 'pending')
                    ->where('scheduled_at', '<=', now()),
            ]);

        if ($request->has('marketing_initiative_id')) {
            $query->where('marketing_initiative_id', $request->marketing_initiative_id);
        }
        if ($request->has('lead_source_id')) {
            $query->where('lead_source_id', $request->lead_source_id);
        }
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        if ($request->has('added_via')) {
            $query->where('added_via', $request->added_via);
        }
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        if ($request->has('linkedin_url')) {
            $linkedinUrl = $request->linkedin_url;
            if (preg_match('#linkedin\.com(/in/[^/?]+)#i', $linkedinUrl, $matches)) {
                $query->where('vcard', 'like', "%{$matches[1]}%");
            } else {
                $query->where('vcard', 'like', "%{$linkedinUrl}%");
            }
        }
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('company', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }
        if ($request->has('company_id')) {
            $companyId = $request->company_id;
            $query->where(function ($q) use ($companyId) {
                $q->where('company_id', $companyId)
                    ->orWhereHas('companyContact', fn ($q2) => $q2->where('company_id', $companyId));
            });
        }

        return $query->latest()->get();
    }
    public static function getStats(): array {
        $statusCounts = static::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $byStatus = collect(['new', 'engaged', 'converted', 'unresponsive', 'disqualified', 'on_hold'])
            ->mapWithKeys(fn ($s) => [$s => (int)($statusCounts[$s] ?? 0)])
            ->all();

        $activityCounts = MarketingProspectActivity::where('status', 'pending')
            ->selectRaw('COUNT(*) as total, SUM(scheduled_at < NOW()) as overdue')
            ->first();

        return [
            'total'              => $statusCounts->sum(),
            'by_status'          => $byStatus,
            'activities_pending' => (int)$activityCounts->total,
            'activities_overdue' => (int)$activityCounts->overdue,
        ];
    }
    public static function searchByPhone(string $phoneNumber): ?static {
        $variants = static::normalizePhoneVariants($phoneNumber);
        foreach ($variants as $variant) {
            $regex    = static::buildPhoneRegex($variant);
            $prospect = static::where('vcard', 'REGEXP', $regex)->first();
            if ($prospect) {
                return $prospect;
            }
        }
        return null;
    }
    private static function normalizePhoneVariants(string $search): array {
        $search = preg_replace('/\(0\)/', '', $search);
        $search = preg_replace('/[\(\)]/', '', $search);
        $search = preg_replace('/[\s\-]/', '', $search);

        if (str_starts_with($search, '0')) {
            return ['0'.substr($search, 1), '+49'.substr($search, 1)];
        }
        if (str_starts_with($search, '+49')) {
            return str_starts_with(substr($search, 3), '0')
                ? ['+49'.substr($search, 4), '0'.substr($search, 4)]
                : ['+49'.substr($search, 3), '0'.substr($search, 3)];
        }
        return [$search];
    }
    private static function buildPhoneRegex(string $normalizedNumber): string {
        $pattern = '';
        foreach (str_split($normalizedNumber) as $char) {
            $pattern .= preg_quote($char, '/').'[\s\-\(\)]*';
        }
        return $pattern;
    }
    public static function identityKeys(Vcard $vcard): array {
        $keys = [];
        foreach ($vcard->getAttr('EMAIL') as $values) {
            $email = strtolower(trim($values[0] ?? ''));
            if (str_contains($email, '@')) {
                $keys[] = "email:$email";
            }
        }
        foreach ($vcard->getAttr('URL') as $values) {
            if (preg_match('#linkedin\.com/in/([^/?\s]+)#i', $values[0] ?? '', $matches)) {
                $keys[] = 'linkedin:'.strtolower(rawurldecode($matches[1]));
            }
        }
        foreach ($vcard->getAttr('TEL') as $values) {
            if ($national = static::nationalPhoneDigits($values[0] ?? '')) {
                $keys[] = "phone:$national";
            }
        }
        return array_values(array_unique($keys));
    }
    private static function nationalPhoneDigits(string $phone): ?string {
        $phone  = trim(str_replace('(0)', '', $phone));
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($phone, '+') || str_starts_with($digits, '00')) {
            $digits = preg_replace('/^(00)?49/', '', $digits);
        }
        $digits = ltrim($digits, '0');
        return strlen($digits) >= 6 ? $digits : null;
    }
    private static function matchedBy(array $keys, Vcard $vcard): array {
        return array_values(array_unique(array_map(
            fn ($_) => explode(':', $_, 2)[0],
            array_intersect($keys, static::identityKeys($vcard))
        )));
    }
    private static function whereVcardMatches(Builder $query, array $keys): Builder {
        return $query->where(function ($q) use ($keys) {
            foreach ($keys as $key) {
                [$type, $value] = explode(':', $key, 2);
                match ($type) {
                    'email'    => $q->orWhere('vcard', 'like', "%{$value}%"),
                    'linkedin' => $q->orWhere('vcard', 'like', "%/in/{$value}%"),
                    'phone'    => $q->orWhere('vcard', 'REGEXP', static::buildPhoneRegex($value)),
                };
            }
        });
    }
    public static function findByIdentity(Vcard $vcard, ?int $initiativeId = null, ?int $exceptId = null): Collection {
        $keys = static::identityKeys($vcard);
        if (! $keys) {
            return new Collection;
        }
        return static::whereVcardMatches(static::query(), $keys)
            ->when($initiativeId, fn ($q) => $q->where('marketing_initiative_id', $initiativeId))
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId))
            ->get()
            ->filter(fn ($_) => static::matchedBy($keys, $_->vcard))
            ->values();
    }
    public function findDuplicates(): array {
        $keys = static::identityKeys($this->vcard);
        if (! $keys) {
            return ['prospects' => [], 'company_contacts' => []];
        }
        $withMatch = fn ($vcardOf) => fn ($model) => $model->setAttribute('matched_by', static::matchedBy($keys, $vcardOf($model)));

        return [
            'prospects' => static::findByIdentity($this->vcard, null, $this->id)
                ->load(['marketingInitiative:id,name', 'user'])
                ->map($withMatch(fn ($_) => $_->vcard))
                ->values(),
            'company_contacts' => static::whereVcardMatches(CompanyContact::query(), $keys)
                ->when($this->company_contact_id, fn ($q) => $q->whereKeyNot($this->company_contact_id))
                ->with(['contact', 'company'])
                ->get()
                ->map($withMatch(fn ($_) => $_->vcard))
                ->filter(fn ($_) => $_->matched_by)
                ->values(),
        ];
    }
    public function mergeFrom(self $other): static {
        abort_if($other->is($this), 422, 'Cannot merge a prospect into itself');
        abort_if($other->marketing_initiative_id !== $this->marketing_initiative_id, 422, 'Only prospects of the same initiative can be merged');

        return DB::transaction(function () use ($other) {
            $vcard   = $this->vcard;
            $ownKeys = static::identityKeys($vcard);
            foreach ($other->vcard->getRows() as $row) {
                $name   = $row->getName();
                $values = $row->getValues();
                if (trim(implode('', $values)) === '') {
                    continue;
                }
                if (in_array($name, ['EMAIL', 'TEL', 'URL'])) {
                    $rowKeys = static::identityKeys((new Vcard)->addRow($row));
                    if ($rowKeys ? ! array_intersect($rowKeys, $ownKeys) : ! in_array($values, $vcard->getAttr($name))) {
                        $vcard->addRow($row);
                    }
                } elseif (in_array($name, ['ORG', 'TITLE', 'ROLE', 'ADR']) && trim(implode('', $vcard->getFirstAttr($name) ?? [])) === '') {
                    $vcard->remove($name)->addRow($row);
                }
            }

            $this->vcard = $vcard;
            $this->fill([
                'notes'              => implode('', array_filter([$this->notes, $other->notes])) ?: null,
                'company_id'         => $this->company_id ?? $other->company_id,
                'company_contact_id' => $this->company_contact_id ?? $other->company_contact_id,
                'status'             => $other->status === 'converted' ? 'converted' : $this->status,
            ])->save();

            $other->touchpoints()->update(['marketing_prospect_id' => $this->id, 'marketing_prospect_activity_id' => null]);
            $other->delete();

            return $this->fresh(['marketingInitiative', 'leadSource', 'user', 'activities.marketingInitiativeActivity', 'companyContact.contact', 'companyContact.company']);
        });
    }
    public static function createFromAddon(array $validated, $user): mixed {
        $vcard    = new Vcard($validated['vcard']);
        $existing = static::findByIdentity($vcard, $validated['marketing_initiative_id'])->first();
        if ($existing) {
            return ['error' => 'Prospect already exists', 'prospect' => $existing];
        }

        if (! $vcard->getFirstValue('FN')) {
            $nAttr = $vcard->getFirstAttr('N');
            if ($nAttr) {
                $nParts     = explode(';', $nAttr);
                $familyName = $nParts[0] ?? '';
                $givenName  = $nParts[1] ?? '';
                $fullName   = trim($givenName.' '.$familyName);
                if ($fullName) {
                    $vcard->setProperty('FN', $fullName);
                    $validated['vcard'] = $vcard->toVCardString();
                }
            }
        }

        $validated['added_via'] = 'addon';
        $validated['user_id']   = $user->id;
        $prospect               = static::create($validated);
        return ['prospect' => $prospect->load(['activities.marketingInitiativeActivity', 'user'])];
    }
    public function linkToCompany(int $companyId): static {
        $prospectVcard = new Vcard($this->attributes['vcard'] ?? '');

        $fn    = $prospectVcard->getFirstValue('FN');
        $nAttr = $prospectVcard->getFirstAttr('N');
        $url   = $prospectVcard->getFirstValue('URL');

        $contactVcard = new Vcard;
        if ($fn) {
            $contactVcard->setProperty('FN', $fn);
        }
        if ($nAttr) {
            $contactVcard->setProperty('N', $nAttr);
        }
        if ($url) {
            $contactVcard->setProperty('URL', $url);
        }

        $contact = Contact::create(['vcard' => $contactVcard->toVCardString()]);

        $companyContact = CompanyContact::create([
            'contact_id' => $contact->id,
            'company_id' => $companyId,
            'vcard'      => (new Vcard($this->attributes['vcard'] ?? ''))->toVCardString(),
        ]);

        $this->update([
            'company_contact_id' => $companyContact->id,
            'company_id'         => null,
        ]);
        return $this->load(['company', 'companyContact.company']);
    }
    public function convert(bool $createNew, ?int $companyId, ?string $companyName): mixed {
        if ($this->company_contact_id) {
            return ['error' => 'Prospect already converted'];
        }

        $prospectVcard       = $this->vcard;
        $prospectVcardString = $prospectVcard->toVCardString(false);

        $fn    = $prospectVcard->getFirstValue('FN');
        $nAttr = $prospectVcard->getFirstAttr('N');

        if (! $fn && ! $nAttr && empty($prospectVcardString)) {
            return ['error' => 'Prospect has no vcard data - cannot convert'];
        }

        $targetCompanyId = $createNew ? null : ($companyId ?: $this->company_id);
        if (! $createNew && ! $targetCompanyId) {
            return ['error' => 'Prospect has no company - select or create one'];
        }

        if (! $nAttr && $fn) {
            $nameParts  = explode(' ', $fn);
            $familyName = array_pop($nameParts);
            $givenName  = implode(' ', $nameParts);
            $nAttr      = [$familyName, $givenName, '', '', ''];
        }

        return DB::transaction(function () use ($prospectVcardString, $fn, $nAttr, $createNew, $companyName, $targetCompanyId) {
            $contactVcard = new Vcard($prospectVcardString);
            $contactVcard->remove(['ORG', 'TITLE', 'ADR', 'TEL', 'EMAIL']);
            if ($fn) {
                $contactVcard->setProperty('FN', $fn);
            }
            if ($nAttr) {
                $contactVcard->setProperty('N', $nAttr);
            }

            $contact = Contact::create(['vcard' => $contactVcard->toVCardString(), 'flags' => 0]);

            $companyContactVcard = new Vcard($prospectVcardString);
            $companyContactVcard->remove(['ORG', 'FN', 'N']);

            if ($createNew) {
                $companyVcard = new Vcard;
                $companyVcard->setProperty('FN', $companyName);
                $companyVcard->setProperty('ORG', $companyName);
                $targetCompanyId = Company::create(['vcard' => $companyVcard->toVCardString(), 'flags' => 0])->id;
            }

            $companyContact = CompanyContact::create([
                'contact_id' => $contact->id,
                'company_id' => $targetCompanyId,
                'vcard'      => $companyContactVcard->toVCardString(),
                'flags'      => 0,
            ]);

            $this->update([
                'company_contact_id' => $companyContact->id,
                'company_id'         => null,
                'status'             => 'converted',
            ]);

            return ['prospect' => $this->load(['companyContact.contact', 'companyContact.company'])];
        });
    }
}
