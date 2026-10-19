<?php

namespace App\Http\Controllers;

use App\Models\Encryption;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EncryptionController extends Controller {
    public function encrypt() {
        $data = request()->validate([
            'key'  => 'required|string|max:255',
            'data' => 'required|string',
        ]);
        $enc = Encryption::create([
            'key'     => $data['key'],
            'value'   => $data['data'],
            'user_id' => request()->user()->id,
        ]);
        $enc->save();
        return $enc;
    }
    public function update(Request $request, Encryption $encryption) {
        if ($request->filled('my_id')) {
            $request->merge(['my_id' => $this->externalId($encryption->key, (string)$request->input('my_id'))]);
            $request->validate(['my_id' => ['string', 'max:64', Rule::unique('encryptions', 'my_id')->where('key', $encryption->key)->ignore($encryption->id)]]);
        }
        return $encryption->applyAndSave($request);
    }
    private function externalId(string $key, string $input): string {
        if ($key !== PluginMattermostController::getKey()) {
            return trim($input);
        }
        return app(PluginMattermostController::class)?->resolveUserId($input)
            ?? throw ValidationException::withMessages(['my_id' => 'No Mattermost user with this name or id.']);
    }
    public function destroy(Encryption $encryption) {
        return response()->json($encryption->delete());
    }
}
