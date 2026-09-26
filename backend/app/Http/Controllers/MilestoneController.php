<?php

namespace App\Http\Controllers;

use App\Enums\InvoiceItemType;
use App\Enums\MilestoneState;
use App\Http\Requests\MilestoneRequest;
use App\Jobs\ChatSendMessageJob;
use App\Models\InvoiceItem;
use App\Models\Milestone;
use App\Models\Param;
use App\Models\Project;
use Illuminate\Http\Request;

class MilestoneController extends Controller {
    public function show(Milestone $milestone) {
        return $milestone->load('project');
    }
    public function indexOverview(Request $request) {
        $unassigned = Milestone::whereNull('user_id')
            ->where('state', '!=', MilestoneState::DONE)
            ->whereHas('project', fn ($q) => $q->whereRunning())
            ->with(['project:id,name,company_id', 'project.company', 'project.assignees'])
            ->orderBy('due_at')
            ->get();

        $overdue = Milestone::where('state', MilestoneState::TODO)
            ->where('started_at', '<', now()->startOfDay())
            ->whereHas('project', fn ($q) => $q->whereRunning())
            ->with(['project:id,name,company_id', 'project.company', 'user'])
            ->orderBy('started_at')
            ->get();

        $noWorkload = Milestone::where('state', '!=', MilestoneState::DONE)
            ->where(function ($q) {
                $q->whereNull('workload_hours')->orWhere('workload_hours', 0);
            })
            ->whereDoesntHave('invoiceItems')
            ->whereHas('project', fn ($q) => $q->whereRunning())
            ->with(['project:id,name,company_id', 'project.company', 'user'])
            ->orderBy('due_at')
            ->get();

        $projects = Project::whereRunning()
            ->where('is_time_based', false)
            ->where('company_id', '!=', Param::get('ME_ID')->value)
            ->with([
                'company',
                'milestones' => fn ($q) => $q->with('invoiceItems'),
            ])
            ->get()
            ->map(function ($project) {
                $estimatedHours = $project->work_estimated ?? 0;

                $milestoneHours = $project->milestones->sum(function ($milestone) {
                    if ($milestone->workload_hours !== null && $milestone->workload_hours > 0) {
                        return $milestone->workload_hours;
                    }
                    return $milestone->invoiceItems->sum(fn ($item) => $item->assumedWorkload());
                });

                $deviation = $estimatedHours > 0
                    ? round((($milestoneHours - $estimatedHours) / $estimatedHours) * 100, 1)
                    : ($milestoneHours > 0 ? 100 : 0);
                return [
                    'id'               => $project->id,
                    'icon'             => $project->icon,
                    'name'             => $project->name,
                    'company_id'       => $project->company_id,
                    'company_name'     => $project->company->name ?? '',
                    'estimated_hours'  => round($estimatedHours, 1),
                    'milestone_hours'  => round($milestoneHours, 1),
                    'deviation'        => $deviation,
                    'milestone_count'  => $project->milestones->count(),
                    'missing_coverage' => $estimatedHours > 0 && $milestoneHours == 0,
                ];
            })
            ->sortByDesc(fn ($p) => abs($p['deviation']))
            ->values();

        $invoiceItemsWithoutMilestone = InvoiceItem::where('type', InvoiceItemType::Default)
            ->whereNotNull('project_id')
            ->whereHas('project', fn ($q) => $q->whereRunning()->where('is_time_based', false))
            ->whereDoesntHave('milestones')
            ->with(['project:id,name,company_id', 'project.company'])
            ->orderBy('text')
            ->get();
        return [
            'unassigned'                   => $unassigned,
            'overdue'                      => $overdue,
            'no_workload'                  => $noWorkload,
            'projects'                     => $projects,
            'invoiceItemsWithoutMilestone' => $invoiceItemsWithoutMilestone,
        ];
    }
    public function index(Request $request) {
        $userId   = $request->user()->id;
        $response = [
            'overdue'     => Milestone::where('user_id', $userId)->whereState(1)->with('project')->whereBefore(now(), 'due_at')->get(),
            'needs_start' => Milestone::where('user_id', $userId)->whereState(0)->with('project')->whereBefore(now(), 'started_at')->get(),
            'running'     => Milestone::where('user_id', $userId)->whereState(1)->with('project')->whereAfter(now(), 'due_at')->get(),
        ];
        return $response;
    }
    public function linkInvoiceItem(Request $request, Milestone $milestone, InvoiceItem $invoiceItem) {
        if ($invoiceItem->milestones()->exists()) {
            return response()->json([
                'error'   => 'Invoice item is already tracked by another milestone',
                'message' => 'This invoice item is already linked to milestone(s): '.$invoiceItem->milestones->pluck('name')->join(', '),
            ], 422);
        }

        $estimatedHours = $invoiceItem->assumedWorkload();
        $hoursPerDay    = Param::get('INVOICE_HPD')->value;

        $duration = $estimatedHours;

        $estimatedDays = ceil($estimatedHours / $hoursPerDay);

        $updateData = [];
        if (! $milestone->duration || $milestone->duration < $duration) {
            $updateData['duration'] = $duration;
        }

        if (! $milestone->due_at && $milestone->started_at) {
            $startDate            = $milestone->started_at->copy();
            $updateData['due_at'] = $startDate->addDays($estimatedDays)->toDateString();
        }

        if (! empty($updateData)) {
            $milestone->update($updateData);
        }

        $milestone->invoiceItems()->attach($invoiceItem->id);
        return response()->json([
            'message'            => 'Invoice item linked to milestone successfully',
            'milestone_id'       => $milestone->id,
            'invoice_item_id'    => $invoiceItem->id,
            'estimated_hours'    => $estimatedHours,
            'estimated_days'     => $estimatedDays,
            'hours_per_day_used' => $hoursPerDay,
            'milestone'          => $milestone->fresh(),
        ]);
    }
    public function unlinkInvoiceItem(Request $request, Milestone $milestone, InvoiceItem $invoiceItem) {
        $milestone->invoiceItems()->detach($invoiceItem->id);
        return response()->json([
            'message'         => 'Invoice item unlinked from milestone successfully',
            'milestone_id'    => $milestone->id,
            'invoice_item_id' => $invoiceItem->id,
        ]);
    }
    public function update(MilestoneRequest $request, Milestone $milestone) {
        $data = $request->validated();

        if ($request->has('depends_on')) {
            if ($request->depends_on === null) {
                $milestone->dependees()->detach();
            } else {
                $milestone->dependees()->sync([$request->depends_on]);
            }
            unset($data['depends_on']);
        }

        $oldState = $milestone->state;
        $milestone->update($data);

        if (array_key_exists('state', $data) && $oldState !== $milestone->state) {
            $this->notifyStateChange($milestone, $request->user());
        }
        return $milestone->fresh(['dependees', 'dependants']);
    }
    public function resolve(Request $request, Milestone $milestone) {
        $oldState = $milestone->state;
        $milestone->update(['state' => MilestoneState::DONE->value]);

        if ($oldState !== $milestone->state) {
            $this->notifyStateChange($milestone, $request->user());
        }
        return $milestone->fresh();
    }
    private function notifyStateChange(Milestone $milestone, $actingUser): void {
        $pm = $milestone->project->projectManager;
        if ($pm && $pm->id !== $actingUser->id) {
            $props = [
                'from_webhook'         => 'true',
                'webhook_display_name' => $milestone->user->name ?? 'TALVIS',
                'override_username'    => $milestone->user->name ?? 'TALVIS',
                'override_icon_url'    => config('app.api_url').($milestone->user->icon ?? ''),
            ];
            $state         = MilestoneState::from($milestone->state);
            $stateName     = $state->getName();
            $utf8StateIcon = match ($state) {
                MilestoneState::TODO        => '⏳',
                MilestoneState::IN_PROGRESS => '⚒️',
                MilestoneState::DONE        => '✅',
            };
            $message = "{$utf8StateIcon} **{$actingUser->name}** changed milestone **{$milestone->name}** to **{$stateName}** (Project: {$milestone->project->name})";
            ChatSendMessageJob::dispatch($message, user: $pm, props: $props);
        }
    }
    public function reorder(Request $request) {
        $data = $request->validate([
            'milestones'            => 'required|array',
            'milestones.*.id'       => 'required|integer|exists:milestones,id',
            'milestones.*.position' => 'required|integer',
        ]);

        foreach ($data['milestones'] as $milestoneData) {
            Milestone::where('id', $milestoneData['id'])
                ->update(['position' => $milestoneData['position']]);
        }
        return response()->json([
            'message'       => 'Milestones reordered successfully',
            'updated_count' => count($data['milestones']),
        ]);
    }
    public function addDependency(Request $request, Milestone $milestone) {
        $data = $request->validate([
            'depends_on' => 'required|integer|exists:milestones,id',
        ]);

        $dependsOnMilestone = Milestone::findOrFail($data['depends_on']);

        $milestone->dependees()->attach($dependsOnMilestone->id);
        return response()->json([
            'message'    => 'Dependency added successfully',
            'milestone'  => $milestone->load('dependees'),
            'depends_on' => $dependsOnMilestone,
        ]);
    }
    public function removeDependency(Request $request, Milestone $milestone) {
        $data = $request->validate([
            'depends_on' => 'required|integer|exists:milestones,id',
        ]);

        $milestone->dependees()->detach($data['depends_on']);
        return response()->json([
            'message'   => 'Dependency removed successfully',
            'milestone' => $milestone->load('dependees'),
        ]);
    }
    public function removeDependencies(Request $request, Milestone $milestone) {
        $data = $request->validate([
            'depends_on_ids'   => 'required|array',
            'depends_on_ids.*' => 'integer|exists:milestones,id',
        ]);

        $milestone->dependees()->detach($data['depends_on_ids']);
        return response()->json([
            'message'       => 'Dependencies removed successfully',
            'milestone'     => $milestone->load('dependees'),
            'removed_count' => count($data['depends_on_ids']),
        ]);
    }
    public function destroy(Milestone $milestone) {
        $milestone->dependees()->detach();
        $milestone->dependants()->detach();

        $milestone->invoiceItems()->detach();

        $milestone->delete();
        return response()->json([
            'message'    => 'Milestone deleted successfully',
            'deleted_id' => $milestone->id,
        ]);
    }
    public function destroyAllForProject(Request $request, $projectId) {
        $project = Project::findOrFail($projectId);

        $milestones     = $project->milestones;
        $milestoneCount = $milestones->count();

        if ($milestoneCount === 0) {
            return response()->json([
                'message'       => 'No milestones found for this project',
                'deleted_count' => 0,
            ]);
        }

        foreach ($milestones as $milestone) {
            $milestone->dependees()->detach();
            $milestone->dependants()->detach();

            $milestone->invoiceItems()->detach();
        }

        $project->milestones()->delete();
        return response()->json([
            'message'       => 'All milestones deleted successfully',
            'project_id'    => $project->id,
            'deleted_count' => $milestoneCount,
        ]);
    }
}
