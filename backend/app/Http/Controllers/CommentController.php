<?php

namespace App\Http\Controllers;

use App\Enums\CommentType;
use App\Models\Comment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CommentController extends Controller {
    public function store(Request $request) {
        $new     = new Comment;
        $parent  = Comment::fromPath($request->path);
        $payload = [
            ...$new->getValidFields($request->all()),
            ...$parent?->toPoly() ?? [],
            'user_id' => Auth::Id(),
        ];
        if (empty($payload['type'])) {
            $payload['type'] = CommentType::Default;
        }
        $new->fill($payload);
        $new->save();
        return $new->fresh();
    }
    public function update(Request $request, Comment $comment) {
        return $comment->applyAndSave($request);
    }
    public function destroy(Comment $comment) {
        return response()->json($comment->delete());
    }
}
