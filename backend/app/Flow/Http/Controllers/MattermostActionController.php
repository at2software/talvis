<?php

namespace App\Flow\Http\Controllers;

use App\Flow\Chat\ApprovalChat;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class MattermostActionController extends Controller {
    public function __construct(private readonly ApprovalChat $chat) {}

    public function action(Request $request) {
        abort_unless(ApprovalChat::isValidToken($request->input('context.token')), 403);
        return response()->json((object)$this->chat->onAction($request->all()));
    }
    public function dialog(Request $request) {
        $state = json_decode((string)$request->input('state'), true) ?: [];
        abort_unless(ApprovalChat::isValidToken($state['token'] ?? null), 403);
        return response()->json((object)$this->chat->onDialog($request->all(), $state));
    }
}
