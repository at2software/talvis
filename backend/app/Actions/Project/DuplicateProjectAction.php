<?php

namespace App\Actions\Project;

use App\Models\Assignment;
use App\Models\InvoiceItem;
use App\Models\Milestone;
use App\Models\PluginLink;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Facades\DB;

class DuplicateProjectAction {
    private const PROJECT_FIELDS = ['company_id', 'description', 'project_id', 'product_id', 'remind_at', 'due_at', 'deadline_at', 'lead_probability', 'project_manager_id', 'no_git_required', 'po_number', 'is_time_based', 'is_internal', 'individual_wage'];
    private const PLUGIN_LINK_FIELDS = ['name', 'url', 'type', 'framework_id', 'framework_version'];
    private const ASSIGNMENT_FIELDS = ['role_id', 'assignee_id', 'assignee_type', 'hours_planned', 'hours_weekly', 'flags'];
    private const TASK_FIELDS = ['name', 'description', 'link', 'status', 'due_date'];
    private const MILESTONE_FIELDS = ['name', 'comments', 'due_at', 'started_at', 'duration', 'progress', 'state', 'flags', 'position', 'user_id', 'workload_hours', 'ext_issue_plugin_link_id', 'ext_issue_id'];
    private const INVOICE_ITEM_FIELDS = ['company_id', 'discount', 'flags', 'is_discountable', 'next_recurrence_at', 'position', 'price', 'product_id', 'product_source_id', 'qty', 'text', 'stage', 'type', 'unit_name', 'vat_calculation', 'vat_rate', 'vat_reason', 'ext_issue_plugin_link_id', 'ext_issue_id'];

    public function execute(Project $project, string $name): Project {
        return DB::transaction(function () use ($project, $name) {
            $new       = Project::create([...$project->only(self::PROJECT_FIELDS), 'name' => $name]);
            $milestoneIdMap  = $this->duplicateMilestones($project, $new);
            $itemIdMap       = $this->duplicateInvoiceItems($project, $new);

            $this->duplicatePluginLinks($project, $new);
            $this->duplicateAssignees($project, $new);
            $this->duplicateTasks($project, $new);
            $this->relinkMilestoneInvoiceItems($project, $milestoneIdMap, $itemIdMap);

            return $new;
        });
    }

    private function duplicatePluginLinks(Project $project, Project $new): void {
        foreach ($project->pluginLinks()->get() as $link) {
            PluginLink::create([...$link->only(self::PLUGIN_LINK_FIELDS), ...$new->toPoly()]);
        }
    }

    private function duplicateAssignees(Project $project, Project $new): void {
        foreach ($project->assignees()->get() as $assignment) {
            Assignment::create([...$assignment->only(self::ASSIGNMENT_FIELDS), ...$new->toPoly()]);
        }
    }

    private function duplicateTasks(Project $project, Project $new): void {
        foreach ($project->tasks()->get() as $task) {
            Task::create([...$task->only(self::TASK_FIELDS), ...$new->toPoly()]);
        }
    }

    private function duplicateMilestones(Project $project, Project $new): array {
        $idMap = [];
        foreach ($project->milestones()->get() as $milestone) {
            $copy                     = Milestone::create([...$milestone->only(self::MILESTONE_FIELDS), 'project_id' => $new->id]);
            $idMap[$milestone->id]    = $copy->id;
        }
        return $idMap;
    }

    private function duplicateInvoiceItems(Project $project, Project $new): array {
        $idMap = [];
        foreach ($project->invoiceItemsRaw()->whereNull('invoice_id')->get() as $item) {
            $copy               = InvoiceItem::create([...$item->only(self::INVOICE_ITEM_FIELDS), 'project_id' => $new->id]);
            $idMap[$item->id]   = $copy->id;
        }
        return $idMap;
    }

    private function relinkMilestoneInvoiceItems(Project $project, array $milestoneIdMap, array $itemIdMap): void {
        foreach ($project->milestones()->with('invoiceItems')->get() as $milestone) {
            $newMilestoneId = $milestoneIdMap[$milestone->id];
            $newItemIds     = collect($milestone->invoiceItems)
                ->pluck('id')
                ->map(fn ($oldItemId) => $itemIdMap[$oldItemId] ?? null)
                ->filter()
                ->values();

            if ($newItemIds->isNotEmpty()) {
                Milestone::find($newMilestoneId)->invoiceItems()->attach($newItemIds);
            }
        }
    }
}
