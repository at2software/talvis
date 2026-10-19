<?php

namespace App\Models;

use App\Enums\TouchpointChannel;
use App\Enums\TouchpointOutcome;
use App\Enums\TouchpointResult;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

class MarketingTouchpoint extends BaseModel {
    protected $table    = 'marketing_touchpoints';
    protected $fillable = [
        'user_id',
        'marketing_prospect_id',
        'marketing_prospect_activity_id',
        'company_id',
        'channel',
        'result',
        'outcome',
        'notes',
        'occurred_at',
    ];

    protected function casts(): array {
        return [
            'channel'     => TouchpointChannel::class,
            'result'      => TouchpointResult::class,
            'outcome'     => TouchpointOutcome::class,
            'occurred_at' => 'datetime',
        ];
    }
    public function user(): BelongsTo {
        return $this->belongsTo(User::class);
    }
    public function marketingProspect(): BelongsTo {
        return $this->belongsTo(MarketingProspect::class);
    }
    public function marketingProspectActivity(): BelongsTo {
        return $this->belongsTo(MarketingProspectActivity::class);
    }
    public function company(): BelongsTo {
        return $this->belongsTo(Company::class);
    }
    public static function stats(Carbon $from, Carbon $to, ?int $userId = null): array {
        $base = fn () => static::query()
            ->whereBetween('occurred_at', [$from, $to])
            ->when($userId, fn ($q) => $q->where('user_id', $userId));

        $counts = $base()
            ->selectRaw('user_id, channel, result, COUNT(*) as n')
            ->groupBy('user_id', 'channel', 'result')
            ->get();
        $meetings = $base()
            ->where('outcome', TouchpointOutcome::MeetingBooked)
            ->selectRaw('user_id, COUNT(*) as n')
            ->groupBy('user_id')
            ->pluck('n', 'user_id');

        $summarize = function ($rows, int $meetings) {
            $count = fn (TouchpointChannel $channel, ?TouchpointResult $result = null) => (int)$rows
                ->filter(fn ($_) => $_->channel === $channel && (! $result || $_->result === $result))
                ->sum('n');
            $dials    = $count(TouchpointChannel::Call);
            $connects = $count(TouchpointChannel::Call, TouchpointResult::Connected);
            return [
                'dials'          => $dials,
                'connects'       => $connects,
                'connect_rate'   => $dials ? round($connects / $dials * 100, 1) : 0,
                'emails_sent'    => $count(TouchpointChannel::Email, TouchpointResult::Sent),
                'emails_replied' => $count(TouchpointChannel::Email, TouchpointResult::Replied),
                'emails_bounced' => $count(TouchpointChannel::Email, TouchpointResult::Bounced),
                'linkedin'       => $count(TouchpointChannel::LinkedIn),
                'meetings'       => $meetings,
            ];
        };

        return [
            'total'   => $summarize($counts, (int)$meetings->sum()),
            'by_user' => $counts->groupBy('user_id')
                ->map(fn ($rows, $id) => ['user_id' => $id ?: null, ...$summarize($rows, (int)($meetings[$id] ?? 0))])
                ->values(),
            'by_hour' => $base()
                ->where('channel', TouchpointChannel::Call)
                ->selectRaw('WEEKDAY(occurred_at) as weekday, HOUR(occurred_at) as hour, COUNT(*) as dials')
                ->selectRaw('SUM(result = ?) as connects', [TouchpointResult::Connected->value])
                ->groupBy(DB::raw('WEEKDAY(occurred_at)'), DB::raw('HOUR(occurred_at)'))
                ->get()
                ->map(fn ($_) => ['weekday' => (int)$_->weekday, 'hour' => (int)$_->hour, 'dials' => (int)$_->dials, 'connects' => (int)$_->connects])
                ->values(),
        ];
    }
}
