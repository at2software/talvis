<?php

namespace App\Models;

use App\Builders\CompanyBuilder;
use App\Casts\Precomputed;
use App\Casts\PrecomputedAuth;
use App\Collections\CompanyCollection;
use App\Enums\InvoiceItemType;
use App\Enums\Recurrence;
use App\Helpers\NLog;
use App\Queries\FociTimelineQuery;
use App\Traits\CanMakeInvoiceTrait;
use App\Traits\HasAssignmentsTrait;
use App\Traits\HasAvatarProjection;
use App\Traits\HasFilesTrait;
use App\Traits\HasFociTrait;
use App\Traits\HasI18nTrait;
use App\Traits\HasInvoiceItemsTrait;
use App\Traits\HasParams;
use App\Traits\LogsDeletionTrait;
use App\Traits\PrecomputedTrait;
use App\Traits\VcardTrait;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class Company extends BaseModel {
    use CanMakeInvoiceTrait;
    use HasAssignmentsTrait;
    use HasAvatarProjection;
    use HasFilesTrait;
    use HasFociTrait;
    use HasI18nTrait;
    use HasInvoiceItemsTrait;
    use HasParams;
    use LogsDeletionTrait;
    use PrecomputedTrait;
    use SoftDeletes;
    use VcardTrait;

    public const FLAG_DRAFT = 0x01;

    protected $fillable = ['vcard', 'created_at', 'updated_at', 'customer_number', 'company_id', 'contact_id', 'net', 'flags', 'vat_id', 'commercial_register', 'invoice_email', 'is_deprecated', 'requires_po', 'has_nda', 'accepts_support', 'remarketing_interval', 'default_product_id', 'source_id', 'source_type'];
    protected $appends  = ['icon', 'class', 'path', 'name', 'needs_vat_handling', 'address', 'has_time_budget'];
    protected $hidden   = ['deleted_at'];

    protected function casts(): array {
        return [
            'net'                  => PrecomputedAuth::class,
            'net_remaining'        => 'float',
            'total_time'           => Precomputed::class,
            'remarketing_interval' => Recurrence::class,
            'discount'             => 'double',
            'has_direct_debit'     => 'boolean',
            'requires_po'          => 'boolean',
            'has_nda'              => 'boolean',
            'is_deprecated'        => 'boolean',
            'accepts_support'      => 'boolean',
            'needs_vat_handling'   => 'boolean',
            'has_time_budget'      => 'boolean',
        ];
    }
    public static function me(): ?self {
        return self::find(Param::get('ME_ID')->value);
    }
    public static function myName(): string {
        return trim((string)(Param::get('ME_NAME')->value ?? '')) ?: trim((string)(self::me()?->name ?? ''));
    }
    public function newCollection(array $models = []) {
        return new CompanyCollection($models);
    }
    public function getIconAttribute() {
        return 'companies/'.$this->id.'/icon?'.($this->updated_at ? $this->updated_at->timestamp : '');
    }
    public function getRevenueAttribute() {
        return $this->invoicedInvoiceItems()->sum('invoice_items.net');
    }
    public function getProjectCountAttribute() {
        return $this->projects()->count();
    }
    public function getRunningProjectCountAttribute() {
        return $this->projectsUnfinished()->count();
    }
    public function getRunningProjectValueAttribute() {
        return $this->projectsUnfinished->sum('net');
    }
    public function getInvoiceCountAttribute() {
        return $this->invoices()->count();
    }
    public function getUnpaidInvoiceCountAttribute() {
        return $this->invoicesUnpaid()->count();
    }
    public function getUnpaidInvoiceValueAttribute() {
        return $this->invoicesUnpaid()->count();
    }

    public function getMlPredictedRevenue12mAttribute(): ?float {
        return $this->getFloatParam('ML_PREDICTED_REVENUE_12M');
    }

    public function getMlPredictedIntervalDaysAttribute(): ?float {
        return $this->getFloatParam('ML_PREDICTED_INTERVAL_DAYS');
    }

    public function getMlChurnProbability12mAttribute(): ?float {
        return $this->getFloatParam('ML_CHURN_PROBABILITY_12M');
    }

    public function getMlPredictedSupportHoursAttribute(): ?float {
        return $this->getFloatParam('ML_PREDICTED_SUPPORT_HOURS');
    }

    public function getMlPredictedNextPurchaseAtAttribute(): ?Carbon {
        $intervalDays = $this->ml_predicted_interval_days;
        if ($intervalDays === null) {
            return null;
        }

        $lastInvoiceAt = $this->last_invoice_at;
        if (! $lastInvoiceAt) {
            return null;
        }

        return $lastInvoiceAt->copy()->addDays((int)round($intervalDays));
    }

    public function getLastInvoiceAtAttribute(): ?Carbon {
        return $this->latestInvoice?->created_at;
    }

    public function getAvgPaymentDelayDaysAttribute(): ?float {
        $avg = $this->invoices()->whereNotNull('paid_at')->avg(DB::raw('DATEDIFF(paid_at, due_at)'));
        return $avg === null ? null : (float)$avg;
    }

    public function getMlOverdueForContactAttribute(): bool {
        $predicted = $this->ml_predicted_next_purchase_at;
        return $predicted !== null && $predicted->isPast();
    }

    public function getMlPredictedNextPurchaseDateAttribute(): ?string {
        return $this->ml_predicted_next_purchase_at?->toDateString();
    }

    public function getFloatParam(string $key): ?float {
        $value = $this->param($key)->value;
        return $value === null ? null : (float)$value;
    }
    public function getAddressAttribute() {
        $din = Document::getDin5008Address($this, false);
        return is_array($din) ? implode('<br>', $din) : '';
    }
    public function getDesicionDurationAttribute() {
        $projects = $this->projects()->whereHasDesicion()->get()->filter(fn ($_) => $_->desicionAt !== null);
        return count($projects) ? $projects->reduce(fn ($a, $b) => $a - $b->desicionAt->diffInDays($b->created_at)) / count($projects) : 0;
    }
    public function getNeedsVatHandlingAttribute(): bool {
        return $this->vcard->needsVatHandling();
    }
    public function invoiceRecipients(): array {
        $addresses = preg_split('/[;,]/', (string)$this->invoice_email) ?: [];
        $addresses = array_map('trim', $addresses);
        return array_values(array_unique(array_filter($addresses, fn ($_) => filter_var($_, FILTER_VALIDATE_EMAIL))));
    }
    protected function hasTimeBudget(): Attribute {
        return Attribute::make(
            get: function () {
                if ($this->id == Param::get('ME_ID')->value) {
                    return false;
                }
                return true;
            }
        );
    }
    public function getBillingConsiderationsAttribute(): array {
        $considerations = [];

        $upcomingRepeating = $this->invoiceItems()
            ->whereIn('type', InvoiceItemType::Repeating)
            ->whereBefore(now()->addWeeks(4), 'next_recurrence_at')
            ->get();

        foreach ($upcomingRepeating as $item) {
            $considerations[] = [
                'type'    => 'warning',
                'label'   => $item->text,
                'tooltip' => 'recurring item triggers on '.$item->next_recurrence_at->format('Y-m-d'),
            ];
        }

        $timeBasedProjects = $this->projects()
            ->where('is_time_based', true)
            ->wherePreparedOrRunning()
            ->get();

        foreach ($timeBasedProjects as $project) {
            $uninvoicedHours = $project->uninvoiced_hours;

            if ($uninvoicedHours > 0) {
                $considerations[] = [
                    'type'             => 'warning',
                    'label'            => $project->name,
                    'tooltip'          => 'project has '.round($uninvoicedHours, 2).' hours of uninvoiced time',
                    'project_id'       => $project->id,
                    'uninvoiced_hours' => round($uninvoicedHours, 2),
                ];
            }
        }
        return $considerations;
    }
    public function precomputeNetAttribute() {
        return $this->invoices()->sum('net');
    }
    public function precomputeTotalTimeAttribute() {
        $total = $this->foci()->sum('duration');
        foreach ($this->projects as $p) {
            $total += $p->foci()->sum('duration');
        }
        return $total;
    }
    public function comments() {
        return $this->hasManyMorph(Comment::class, 'parent');
    }
    public function companyContacts() {
        return $this->hasMany(CompanyContact::class);
    }
    public function connections() {
        return $this->hasMany(Connection::class, 'company1_id')->union($this->hasMany(Connection::class, 'company2_id'));
    }
    public function employees() {
        return $this->companyContacts()->where('is_retired', false)->with('contact');
    }
    public function invoicedInvoiceItems() {
        return $this->hasManyThrough(InvoiceItem::class, Invoice::class);
    }
    public function upcomingRepeatingInvoiceItems() {
        return $this->invoiceItems()->whereIn('type', InvoiceItemType::Repeating)->whereBefore(now()->addMonths(1), 'next_recurrence_at')->oldest('next_recurrence_at');
    }
    public function invoiceItems() {
        return $this->hasMany(InvoiceItem::class)->whereNull('invoice_id');
    }
    public function earliestInvoice() {
        return $this->hasOne(Invoice::class)->orderBy('created_at', 'asc');
    }
    public function latestInvoice() {
        return $this->hasOne(Invoice::class)->orderBy('created_at', 'desc');
    }
    public function invoices() {
        return $this->hasMany(Invoice::class);
    }
    public function invoicesUnpaid() {
        return $this->hasMany(Invoice::class)->where('paid_at', null);
    }
    public function invoicesLast12m() {
        return $this->invoices()->whereAfter(now()->subYear());
    }
    public function projectInvoiceItems() {
        return $this->hasManyThrough(InvoiceItem::class, Project::class);
    }
    public function projects() {
        return $this->hasMany(Project::class);
    }
    public function baseProjects() {
        return $this->projects()->wherePreparedOrRunning();
    }
    public function defaultContact() {
        return $this->hasOne(CompanyContact::class, 'id', 'default_contact_id');
    }
    public function projectsUnfinished() {
        return $this->hasMany(Project::class)->wherePreparedOrRunning();
    }
    public function source() {
        return $this->morphTo();
    }
    public function timeBasedFoci() {
        return $this->hasManyThrough(Focus::class, Project::class, 'company_id', 'parent_id')->where('parent_type', Project::class)->where('is_time_based', true);
    }
    public function timeBasedProjects() {
        return $this->hasMany(Project::class)->where('is_time_based', true);
    }
    public function projectFoci() {
        return $this->hasManyThrough(Focus::class, Project::class, 'company_id', 'parent_id')->where('parent_type', Project::class);
    }
    public function getTimelineChartAttribute() {
        return (new FociTimelineQuery(fn () => $this->projectFoci()))->get();
    }

    public function isDraft(): bool {
        return ((int)$this->flags & self::FLAG_DRAFT) !== 0;
    }

    public function purgeDraft(): void {
        if (! $this->isDraft()) {
            return;
        }
        $this->comments()->get()->each->delete();
        $this->projects()->get()->each->delete();
        foreach ($this->companyContacts()->with('contact')->get() as $cc) {
            $contact = $cc->contact;
            $cc->delete();
            if ($contact && $contact->companyContacts()->doesntExist()) {
                $contact->delete();
            }
        }
        $this->delete();
    }

    public function createEmployee() {
        $contact = Contact::create(['vcard' => "FN:New Employee\nN:Employee;New;;;"]);
        return CompanyContact::create(['vcard' => "EMAIL:\nTEL;type=voice,work:\nTEL;type=cell,work:", 'company_id' => $this->id, 'contact_id' => $contact->id])->load('contact.companies');
    }
    public function createProject(string $name = 'New project', ?int $parentProjectId = null, ?int $userId = null) {
        $payload = [
            'company_id'  => $this->id,
            'name'        => $name,
            'description' => '',
            'remind_at'   => now()->addDays(14),
        ];
        if ($parentProjectId) {
            $payload['project_id'] = $parentProjectId;
        }
        if ($this->default_product_id) {
            $payload['product_id'] = $this->default_product_id;
        }
        $payload['project_manager_id'] = $userId ?? Auth::id();

        $p          = Project::create($payload);
        $assignment = $p->addAssignee(Auth::user(), 2);

        if ($assignment) {
            $autoBudget = Param::get('PROJECT_CREATE_AUTO_BUDGET')->value;
            if ($autoBudget) {
                $assignment->hours_planned = $autoBudget;
                $assignment->save();
            }
        }

        if ($this->defaultContact) {
            $p->addAssignee($this->defaultContact);
        }
        $p->company->company_contacts;
        $this->update(['is_deprecated' => false]);
        return $p;
    }
    public function indexedItems() {
        return $this->invoiceItems()
            ->where(function ($query) {
                $query
                    ->whereNotIn('type', InvoiceItemType::Repeating)
                    ->orWhere(fn ($_) => $_->whereIn('type', InvoiceItemType::Repeating)->whereNull('next_recurrence_at'));
            })
            ->with('productSource');
    }
    public function preparedInvoiceItems() {
        return $this->invoiceItems()->whereStage(0)->whereIn('type', [...Invoice::ITEMS_ADDING_TO_INVOICE, InvoiceItemType::Header])->whereInvoiceId(null)->oldest('position');
    }

    public function supportItems() {
        return $this->invoiceItems()->whereIn('stage', [0, 1])->whereIn('type', InvoiceItemType::TotalRemaining)->whereInvoiceId(null);
    }

    public static function scrapeWebpage(string $url, ?Company $original = null): string {
        NLog::info('ScrapeWebpage: Starting', ['url' => $url]);

        $initialVcard = $original ? $original->vcard : '';

        $initialVcard = preg_replace('/\\n(ORG|FN|PHOTO).*?\\n/is', "\n", $initialVcard);
        $initialVcard = preg_replace('/\\n(ORG|FN|PHOTO).*?$/is', "\n", $initialVcard);
        $initialVcard = preg_replace('/^(ORG|FN|PHOTO).*?\\n/is', "\n", $initialVcard);

        preg_match('/https?:\\/\\//is', $url) || $url = 'https://'.$url;

        try {
            Artisan::call('app:analyzeUrlImprint', ['url' => $url]);
            $artisanOutput = Artisan::output();

            $info = json_decode($artisanOutput);
            if (! $info) {
                NLog::error('ScrapeWebpage: Failed to decode JSON', ['output_length' => strlen($artisanOutput)]);
                throw new \Exception('Failed to decode JSON from imprint analyzer');
            }

            NLog::info('ScrapeWebpage: Extracted data', [
                'company'      => $info->FN ?? $info->ORG ?? 'N/A',
                'addresses'    => count($info->ADR ?? []),
                'phones'       => count($info->TEL ?? []),
                'emails'       => count($info->EMAIL ?? []),
                'social_media' => count($info->SOCIAL_MEDIA ?? []),
                'photo'        => ! empty($info->PHOTO) ? round(strlen($info->PHOTO) / 1024, 1).'KB' : 'none',
                'register'     => $info->BUSINESS_REGISTER ?? 'none',
            ]);
        } catch (\Exception $e) {
            NLog::error('ScrapeWebpage: Error calling analyzeUrlImprint command', ['error' => $e->getMessage()]);
            throw $e;
        }

        $vcard = $initialVcard.PHP_EOL;
        $vcard .= 'FN:'.($info->FN ?: @$original?->vcard->getFirstValue('FN')).PHP_EOL;
        $vcard .= 'ORG:'.($info->ORG ?: @$original?->vcard->getFirstValue('ORG')).PHP_EOL;

        foreach ($info->ADR as $_) {
            $vcard .= 'ADR;type=work:'.implode(';', $_).PHP_EOL;
        }

        foreach ($info->TEL as $tel) {
            $number    = is_object($tel) ? $tel->number : (is_array($tel) ? $tel['number'] : $tel);
            $type      = is_object($tel) ? $tel->type : (is_array($tel) ? $tel['type'] : 'phone');
            $vcardType = match ($type) {
                'mobile' => 'cell,voice',
                'fax'    => 'fax',
                default  => 'voice,work'
            };
            $vcard .= "TEL;type=\"{$vcardType}\":".$number.PHP_EOL;
        }

        foreach ($info->EMAIL as $_) {
            $vcard .= 'EMAIL;type=work:'.$_.PHP_EOL;
        }

        if (! empty($info->SOCIAL_MEDIA)) {
            foreach ($info->SOCIAL_MEDIA as $socialUrl) {
                $type = 'social';
                if (stripos($socialUrl, 'linkedin.com') !== false) {
                    $type = 'linkedin';
                } elseif (stripos($socialUrl, 'facebook.com') !== false) {
                    $type = 'facebook';
                } elseif (stripos($socialUrl, 'instagram.com') !== false) {
                    $type = 'instagram';
                } elseif (stripos($socialUrl, 'twitter.com') !== false || stripos($socialUrl, 'x.com') !== false) {
                    $type = 'twitter';
                } elseif (stripos($socialUrl, 'youtube.com') !== false) {
                    $type = 'youtube';
                } elseif (stripos($socialUrl, 'xing.com') !== false) {
                    $type = 'xing';
                }
                $vcard .= 'URL;TYPE='.$type.':'.$socialUrl.PHP_EOL;
            }
        }

        if (! $original) {
            $vcard .= 'URL;type=work:'.$url.PHP_EOL;
        }

        if (! empty($info->PHOTO)) {
            NLog::info('ScrapeWebpage: Adding photo to vcard', ['photo_size_kb' => round(strlen($info->PHOTO) / 1024, 2)]);
            $vcard .= 'PHOTO;encoding=b;type=image/png:,'.$info->PHOTO.PHP_EOL;
        }

        $vcard = self::optimizeVcard($vcard);

        if ($original) {
            if (! empty($info->VAT_ID) && empty($original->vat_id)) {
                $original->vat_id = $info->VAT_ID;
                $original->save();
            }
            if (! empty($info->MANAGING_DIRECTOR) && empty($original->managing_director)) {
                $original->managing_director = $info->MANAGING_DIRECTOR;
                $original->save();
            }
        }

        NLog::info('ScrapeWebpage: Final vcard generated', ['length' => strlen($vcard)]);
        return $vcard;
    }

    private static function optimizeVcard(string $vcard): string {
        $lines     = explode("\n", $vcard);
        $optimized = [];
        $seen      = [
            'TEL'   => [],
            'EMAIL' => [],
            'ADR'   => [],
        ];

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) {
                continue;
            }

            if (preg_match('/^TEL[^:]*:(.+)$/i', $line, $matches)) {
                $phoneNumber = trim($matches[1]);
                $normalized  = VcardTrait::normalizePhoneNumber($phoneNumber);

                $key = preg_replace('/[^\d]/', '', $normalized);
                if (isset($seen['TEL'][$key])) {
                    continue; // Skip duplicate
                }
                $seen['TEL'][$key] = true;

                $line = preg_replace('/:(.+)$/', ':'.$normalized, $line);
            }

            if (preg_match('/^EMAIL[^:]*:(.+)$/i', $line, $matches)) {
                $email = strtolower(trim($matches[1]));
                if (isset($seen['EMAIL'][$email])) {
                    continue; // Skip duplicate
                }
                $seen['EMAIL'][$email] = true;
            }

            if (preg_match('/^ADR[^:]*:(.+)$/i', $line, $matches)) {
                $address = strtolower(trim($matches[1]));
                if (isset($seen['ADR'][$address])) {
                    continue; // Skip duplicate
                }
                $seen['ADR'][$address] = true;
            }

            $optimized[] = $line;
        }

        $result = implode(PHP_EOL, $optimized);
        $result = preg_replace('/\n[\s\n]*\n/is', "\n", $result);
        return $result;
    }

    public function getWage($baseWage = null) {
        $baseWage || $baseWage = Param::get('HR_HOURLY_WAGE')->value;
        $discount              = $this->param('INVOICE_DISCOUNT')->value;
        $discount              = $discount ? 1 - (.01 * $discount) : 1;
        return $baseWage * $discount;
    }
    public function newEloquentBuilder($query) {
        return new CompanyBuilder($query);
    }
}
