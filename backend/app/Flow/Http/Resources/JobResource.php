<?php

namespace App\Flow\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class JobResource extends JsonResource {
    public static $wrap = null;

    public function toArray($request): array {
        return [
            'id'         => $this->id,
            'class'      => 'Job',
            'project'    => $this->whenLoaded('project', fn () => ['id' => $this->project->id, 'name' => $this->project->name]),
            'project_id' => $this->project_id,
            'type'       => $this->type,
            'state'      => $this->state,
            'input'      => $this->input,
            'output'     => $this->output,
            'claimed_by' => $this->claimed_by,
            'claimed_at' => $this->claimed_at,
            'metrics'    => $this->metrics,
            'knowledge'  => $this->knowledge,
            'approvals'  => $this->whenLoaded('approvals', fn () => $this->approvals->map(fn ($approval) => [
                'id'              => $approval->id,
                'gate_key'        => $approval->gate_key,
                'decision'        => $approval->decision,
                'selected_option' => $approval->selected_option,
                'reason'          => $approval->reason,
                'decided_at'      => $approval->decided_at,
            ])),
            'last_event' => $this->when($this->resource->relationLoaded('lastEvent'), fn () => $this->lastEvent ? [
                'action'     => $this->lastEvent->action,
                'actor_type' => $this->lastEvent->actor_type,
                'created_at' => $this->lastEvent->created_at,
            ] : null),
            'created_by_id' => $this->created_by_id,
            'created_at'    => $this->created_at,
            'updated_at'    => $this->updated_at,
        ];
    }
}
