<?php

namespace App\Flow\Http\Controllers;

use App\Flow\Http\Requests\IndexAuditRequest;
use App\Flow\Models\Approval;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Machine;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class AuditController extends Controller {
    public function index(IndexAuditRequest $request) {
        $page = AuditEntry::query()
            ->when($request->validated('subject'), fn ($q, $subject) => $q->where('subject_type', 'like', '%\\\\'.$subject))
            ->when($request->validated('subject_id'), fn ($q, $id) => $q->where('subject_id', $id))
            ->when($request->validated('action'), fn ($q, $action) => $q->where('action', 'like', $action.'%'))
            ->when($request->validated('actor_type'), fn ($q, $type) => $q->where('actor_type', $type))
            ->latest('id')
            ->paginate(50);

        $users    = User::whereIn('id', $page->getCollection()->where('actor_type', 'user')->pluck('actor_id')->filter())->get()->keyBy('id');
        $machines = Machine::whereIn('id', $page->getCollection()->where('actor_type', 'machine')->pluck('actor_id')->filter())->pluck('name', 'id');
        $subjects = $this->subjects($page->getCollection());

        $page->getCollection()->transform(fn (AuditEntry $entry) => [
            'id'            => $entry->id,
            'created_at'    => $entry->created_at,
            'action'        => $entry->action,
            'actor_type'    => $entry->actor_type,
            'actor_id'      => $entry->actor_id,
            'actor_name'    => $entry->actor_type === 'machine' ? $machines->get($entry->actor_id) : $users->get($entry->actor_id)?->name,
            'subject_type'  => class_basename($entry->subject_type),
            'subject_id'    => $entry->subject_id,
            'subject_label' => $subjects[$entry->subject_type.'#'.$entry->subject_id] ?? class_basename($entry->subject_type).' #'.$entry->subject_id,
            'payload'       => $entry->payload,
        ]);
        return $page;
    }
    public function subjectTypes() {
        return AuditEntry::query()->distinct()->pluck('subject_type')->map(fn ($type) => class_basename($type))->unique()->sort()->values();
    }
    private function subjects(Collection $entries): array {
        $labels = [];
        foreach ($entries->groupBy('subject_type') as $type => $group) {
            if (! is_subclass_of($type, Model::class)) {
                continue;
            }
            foreach ($type::whereIn('id', $group->pluck('subject_id')->unique())->get() as $subject) {
                $labels[$type.'#'.$subject->getKey()] = match (true) {
                    $subject instanceof Approval            => trim(($subject->gate_key ? $subject->gate_key.' · ' : '').$subject->subject_label),
                    method_exists($subject, 'flowLabel')    => $subject->flowLabel(),
                    filled($subject->getAttribute('name'))  => $subject->getAttribute('name'),
                    filled($subject->getAttribute('key'))   => $subject->getAttribute('key'),
                    default                                 => class_basename($subject).' #'.$subject->getKey(),
                };
            }
        }
        return $labels;
    }
}
