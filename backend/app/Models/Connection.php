<?php

namespace App\Models;

use App\Casts\PrecomputedAuth;
use App\Enums\ConnectionSource;
use App\Enums\ConnectionType;
use App\Enums\InvoiceItemType;
use App\Traits\PrecomputedTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Connection extends BaseModel {
    use HasFactory;
    use PrecomputedTrait;

    protected $with     = ['company1', 'company2'];

    protected function casts(): array {
        return ['net' => PrecomputedAuth::class, 'type' => ConnectionType::class, 'source' => ConnectionSource::class, 'verified_at' => 'datetime'];
    }

    protected $fillable = ['company1_id', 'company2_id', 'type', 'source', 'source_url', 'verified_at'];

    public static function between(int $companyA, int $companyB): ?self {
        return self::where(fn ($_) => $_->where('company1_id', $companyA)->where('company2_id', $companyB))
            ->orWhere(fn ($_) => $_->where('company1_id', $companyB)->where('company2_id', $companyA))
            ->first();
    }
    public function reverse(): void {
        [$this->company1_id, $this->company2_id] = [$this->company2_id, $this->company1_id];
    }
    public static function networkPayload($connections) {
        $groups = Company::primaryProductGroups($connections->flatMap(fn ($_) => [$_->company1_id, $_->company2_id])->unique()->values()->all());
        return $connections->map(function ($conn) use ($groups) {
            $data = $conn->toArray();
            foreach (['company1', 'company2'] as $company) {
                if (isset($data[$company]['net'])) {
                    $net                   = $data[$company]['net'];
                    $data[$company]['net'] = $net > 0 ? round(log10($net), 2) : 0;
                }
                if (isset($data[$company])) {
                    $data[$company]['primary_group'] = $groups[$data[$company]['id']] ?? null;
                }
            }
            return $data;
        });
    }
    public function getOtherCompany($companyId) {
        return ($this->company1_id == $companyId) ? $this->company2 : $this->company1;
    }
    public function company1() {
        return $this->belongsTo(Company::class, 'company1_id');
    }
    public function company2() {
        return $this->belongsTo(Company::class, 'company2_id');
    }
    public function projects() {
        return $this->hasMany(ConnectionProject::class);
    }
    public function precomputeNetAttribute() {
        return 0;
        if ($this->has('projects') === null) {
            return 0;
        }
        return $this->invoiceItems()->whereIn('type', InvoiceItemType::Total)->sum('invoice_items.net');
    }
}
