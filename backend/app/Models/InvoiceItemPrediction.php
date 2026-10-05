<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class InvoiceItemPrediction extends BaseModel {
    use HasFactory;

    protected $touches  = ['invoiceItem'];
    protected $fillable = ['user_id', 'invoice_item_id', 'qty', 'flags'];

    public function user() {
        return $this->belongsTo(User::class);
    }
    public function invoiceItem() {
        return $this->belongsTo(InvoiceItem::class);
    }
    public static function _w($uid, $iid) {
        return ['user_id' => $uid, 'invoice_item_id' => $iid];
    }
    public static function find($uid, $iid) {
        return InvoiceItemPrediction::where(self::_w($uid, $iid));
    }
    public static function findOrCreate($uid, $iid) {
        $find = self::find($uid, $iid);
        return $find->exists() ? $find->first() : InvoiceItemPrediction::create(self::_w($uid, $iid));
    }
}
