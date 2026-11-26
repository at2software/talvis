<?php

use App\Models\Invoice;
use App\Models\InvoiceReminder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void {
        DB::table('files')->whereNull('permissions')
            ->where(fn ($q) => $q->whereIn('parent_type', [Invoice::class, InvoiceReminder::class])->orWhere('dir', 'like', 'invoices/%')->orWhere('dir', 'like', 'quotes/%'))
            ->update(['permissions' => 'invoices.values']);
        DB::table('files')->whereNull('permissions')->where('dir', 'like', 'travel-expenses/%')
            ->update(['permissions' => 'hr.module']);
    }
    public function down(): void {
        // noop
    }
};
