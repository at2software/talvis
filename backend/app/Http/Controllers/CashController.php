<?php

namespace App\Http\Controllers;

use App\Models\Cash;
use App\Models\CashRegister;
use Illuminate\Http\Request;

class CashController extends Controller {
    public function indexRegisters() {
        return CashRegister::get();
    }
    public function indexEntries(CashRegister $_) {
        return $_->entries->sortByDesc('occured_at')->values()->toArray();
    }
    public function storeEntry(CashRegister $_) {
        $body = (array)$this->getBody();
        $_->entries()->create($body);
        return response()->noContent();
    }
    public function updateEntry(Request $request, Cash $_) {
        return $_->applyAndSave($request);
    }
    public function destroyEntry(Cash $_) {
        $_->delete();
        return response()->noContent();
    }
}
