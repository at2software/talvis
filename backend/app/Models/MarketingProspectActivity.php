<?php

namespace App\Models;

use App\Enums\TouchpointChannel;
use App\Enums\TouchpointOutcome;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class MarketingProspectActivity extends BaseModel {
    protected $table    = 'marketing_prospect_activities';
    protected $fillable = [
        'marketing_prospect_id',
        'marketing_initiative_activity_id',
        'scheduled_at',
        'completed_at',
        'status',
        'notes',
        'performance_value',
        'bumps',
    ];

    protected function casts(): array {
        return [
            'scheduled_at'      => 'datetime',
            'completed_at'      => 'datetime',
            'performance_value' => 'decimal:2',
        ];
    }
    public function marketingProspect(): BelongsTo {
        return $this->belongsTo(MarketingProspect::class, 'marketing_prospect_id');
    }
    public function marketingInitiativeActivity(): BelongsTo {
        return $this->belongsTo(MarketingInitiativeActivity::class, 'marketing_initiative_activity_id');
    }
    public function marketingActivity(): BelongsTo {
        return $this->marketingInitiativeActivity();
    }
    public function touchpoints(): HasMany {
        return $this->hasMany(MarketingTouchpoint::class, 'marketing_prospect_activity_id');
    }
    public function scopePending($query) {
        return $query->where('status', 'pending');
    }
    public function scopeCurrent($query) {
        return $query->whereNotExists(fn ($q) => $q
            ->selectRaw('1')
            ->from('marketing_prospect_activities as parent_step')
            ->join('marketing_initiative_activities as step', 'step.parent_activity_id', '=', 'parent_step.marketing_initiative_activity_id')
            ->whereColumn('step.id', 'marketing_prospect_activities.marketing_initiative_activity_id')
            ->whereColumn('parent_step.marketing_prospect_id', 'marketing_prospect_activities.marketing_prospect_id')
            ->where('parent_step.status', 'pending'));
    }
    public function scopeCompleted($query) {
        return $query->where('status', 'completed');
    }
    public function scopeOverdue($query) {
        return $query->where('status', 'pending')
            ->where('scheduled_at', '<', now());
    }
    public function scopeDueToday($query) {
        return $query->where('status', 'pending')
            ->whereDate('scheduled_at', today());
    }
    public function scopeDueTomorrow($query) {
        return $query->where('status', 'pending')
            ->whereDate('scheduled_at', tomorrow());
    }
    public function getStatusLabel(): string {
        return match ($this->status) {
            'pending'   => 'Pending',
            'completed' => 'Completed',
            'skipped'   => 'Skipped',
            'overdue'   => 'Overdue',
            'failed'    => 'Failed',
            default     => ucfirst($this->status)
        };
    }
    public function isOverdue(): bool {
        return $this->status === 'pending' && $this->scheduled_at < now();
    }
    public function isDueToday(): bool {
        return $this->status === 'pending' && $this->scheduled_at->isToday();
    }
    public function isDueTomorrow(): bool {
        return $this->status === 'pending' && $this->scheduled_at->isTomorrow();
    }
    public function canBeCompleted(): bool {
        return in_array($this->status, ['pending', 'overdue']);
    }
    public function markCompleted(?string $notes = null, ?float $performanceValue = null): bool {
        if (! $this->canBeCompleted()) {
            return false;
        }
        return $this->update([
            'status'            => 'completed',
            'completed_at'      => now(),
            'notes'             => $notes,
            'performance_value' => $performanceValue,
        ]);
    }
    public function markSkipped(?string $reason = null): bool {
        if (! $this->canBeCompleted()) {
            return false;
        }
        return $this->update([
            'status' => 'skipped',
            'notes'  => $reason,
        ]);
    }
    public function bump(): void {
        $this->increment('bumps');
    }
    public function reschedule(Carbon $newDate): bool {
        if ($this->status !== 'pending') {
            return false;
        }
        return $this->update(['scheduled_at' => $newDate]);
    }
    public function shiftSucceedingActivities(): void {
        $now        = now();
        $daysOffset = $now->startOfDay()->diffInDays($this->scheduled_at->startOfDay());

        $daysDifference = $now->startOfDay() > $this->scheduled_at->startOfDay()
            ? -$daysOffset
            : $daysOffset;

        if ($daysDifference != 0) {
            static::where('marketing_prospect_id', $this->marketing_prospect_id)
                ->where('status', 'pending')
                ->where('scheduled_at', '>', $this->scheduled_at)
                ->update(['scheduled_at' => DB::raw("DATE_ADD(scheduled_at, INTERVAL {$daysDifference} DAY)")]);
        }
    }
    public function rescheduleWithSuccessors(Carbon $newDate): void {
        $days = (int)$this->scheduled_at->copy()->startOfDay()->diffInDays($newDate->copy()->startOfDay(), false);
        if ($days === 0) {
            return;
        }
        static::where('marketing_prospect_id', $this->marketing_prospect_id)
            ->where('status', 'pending')
            ->where('scheduled_at', '>=', $this->scheduled_at)
            ->update(['scheduled_at' => DB::raw("DATE_ADD(scheduled_at, INTERVAL {$days} DAY)")]);
        $this->refresh();
    }
    public function applyTouchpoint(MarketingTouchpoint $touchpoint, ?Carbon $retryAt = null): void {
        if ($this->status !== 'pending') {
            return;
        }
        if ($touchpoint->result->isInvalidContact()) {
            $this->update(['status' => 'failed', 'notes' => $touchpoint->notes]);
        } elseif ($touchpoint->result->isAttempt() || $touchpoint->outcome === TouchpointOutcome::Callback) {
            $this->bump();
            $this->rescheduleWithSuccessors($retryAt ?? today()->nextWeekday());
        } else {
            $this->marketingProspect->markActivityCompleted($this->id, $touchpoint->notes);
            $this->refresh()->shiftSucceedingActivities();
        }
    }
    public static function outreachQueue(TouchpointChannel $channel, ?int $userId, ?int $initiativeId): Collection {
        $due = static::query()
            ->where('status', 'pending')
            ->where('scheduled_at', '<=', today()->endOfDay())
            ->current()
            ->whereHas('marketingInitiativeActivity', fn ($q) => $q->whereIn('quick_action', $channel->quickActions()))
            ->whereHas('marketingProspect', fn ($q) => $q
                ->whereNotIn('status', ['unresponsive', 'disqualified', 'converted'])
                ->when($userId, fn ($q) => $q->where('user_id', $userId))
                ->when($initiativeId, fn ($q) => $q->where('marketing_initiative_id', $initiativeId)))
            ->orderBy('scheduled_at')
            ->get(['id', 'marketing_prospect_id']);

        return static::with([
            'marketingInitiativeActivity.i18n',
            'marketingProspect.marketingInitiative:id,name',
            'marketingProspect.companyContact.contact',
            'marketingProspect.companyContact.company',
            'marketingProspect.touchpoints' => fn ($q) => $q->with('user')->latest('occurred_at'),
        ])
            ->whereIn('id', $due->unique('marketing_prospect_id')->pluck('id'))
            ->orderBy('scheduled_at')
            ->get();
    }
    public static function rescheduleOverdue(Carbon $date, ?int $userId, ?int $initiativeId, ?TouchpointChannel $channel): int {
        $overdue = static::query()
            ->where('status', 'pending')
            ->where('scheduled_at', '<', today())
            ->when($channel, fn ($q) => $q->whereHas('marketingInitiativeActivity', fn ($q) => $q->whereIn('quick_action', $channel->quickActions())))
            ->whereHas('marketingProspect', fn ($q) => $q
                ->when($userId, fn ($q) => $q->where('user_id', $userId))
                ->when($initiativeId, fn ($q) => $q->where('marketing_initiative_id', $initiativeId)))
            ->orderBy('scheduled_at')
            ->get()
            ->unique('marketing_prospect_id');

        DB::transaction(fn () => $overdue->each(fn ($activity) => $activity->rescheduleWithSuccessors($date)));
        return $overdue->count();
    }
    public function getDaysUntilDue(): int {
        return now()->diffInDays($this->scheduled_at, false);
    }
    public function getTimeUntilDue(): string {
        if ($this->isOverdue()) {
            return 'Overdue by '.$this->scheduled_at->diffForHumans(now(), true);
        }

        if ($this->isDueToday()) {
            return 'Due today';
        }

        if ($this->isDueTomorrow()) {
            return 'Due tomorrow';
        }
        return 'Due '.$this->scheduled_at->diffForHumans();
    }
}
