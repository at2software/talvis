<?php

namespace App\Services\Project;

use App\Models\Connection;
use App\Models\InvoiceItem;
use App\Models\Project;
use App\Models\ProjectState;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

class ProjectDetailsService {
    public function build(Project $project): Project {
        $project->load([
            'assignees.assignee',
            'company.employees',
            'connectionProjects.connection.company1.employees',
            'connectionProjects.connection.company2.employees',
            'pluginLinks',
            'hoursInvestedSum',
            'files',
            'projectManager',
            'product.invoiceItems',
            'companysActiveProjects:projects.id,name,company_id,is_time_based,is_internal,projects.net',
            'companysBaseProjects:projects.id,name,company_id,is_time_based,is_internal,projects.net',
            'parentProject',
            'states' => fn ($q) => $q->latest('pivot_id')->limit(1),
        ]);

        $project->setRelation('invoiceItems', $project->indexedItems()
            ->with([
                'predictions',
                'fociUserSums',
                'milestones' => fn ($q) => $q->select('milestones.id', 'invoice_item_id', 'name', 'progress', 'state', 'flags', 'user_id')->without('invoiceItem'),
                'milestones.user:id,name,color',
            ])
            ->withCount('billedFoci')
            ->withSum('billedFoci', 'duration')
            ->withSum('foci', 'duration')
            ->get()
        );

        EloquentCollection::make($project->invoiceItems->pluck('milestones')->collapse()->all())
            ->load(['invoiceItems' => fn ($q) => $q->withSum('foci', 'duration')]);

        $project->connectionProjects->each(function ($cp) use ($project) {
            $cp->setAttribute('other_company', $cp->connection->getOtherCompany($project->company_id));
        });

        $connections = Connection::where('company1_id', $project->company_id)
            ->orWhere('company2_id', $project->company_id)
            ->with(['company1', 'company2'])
            ->get();

        $availableConnections = $connections->map(function ($connection) use ($project) {
            return [
                'connection_id' => $connection->id,
                'company'       => $connection->company1_id === $project->company_id
                    ? $connection->company2
                    : $connection->company1,
            ];
        });

        $project->setAttribute('available_connections', $availableConnections);
        $project->companysActiveProjects->each(fn ($_) => $_->append('state'));

        $milestoneStateCounts = $project->milestones()
            ->selectRaw('state, COUNT(*) as count')
            ->groupBy('state')
            ->pluck('count', 'state')
            ->toArray();

        $project->setAttribute('no_invoice_focus', $project->foci()->whereNull('invoice_item_id')->sum('duration'));
        $project->setAttribute('milestone_state_counts', [
            'todo'        => $milestoneStateCounts[0] ?? 0,
            'in_progress' => $milestoneStateCounts[1] ?? 0,
            'done'        => $milestoneStateCounts[2] ?? 0,
            'total'       => array_sum($milestoneStateCounts),
        ]);
        $project->setAttribute('quote_descriptions', $project->getQuoteDescriptions());

        $project->append(['net', 'hours_invested', 'personalized', 'params', 'uninvoiced_hours', 'started_at', 'finished_at', 'warranty_until', 'timeline_chart']);
        $project->setAttribute('oldest_unbilled_focus_at', $project->foci_unbilled()->oldest('started_at')->value('started_at'));
        $project->setAttribute('invoiced_downpayments', (float)$project->invoiceItems()->where('stage', 2)->whereNotNull('invoice_id')->sum('net'));

        $appends = ['foci_by_user', 'my_prediction', 'progress'];
        if (! $project->is_time_based) {
            $appends[] = 'fociSum';
        }
        $project->invoiceItems->each(fn ($item) => $item->append($appends));

        $project->company->setAttribute('params', $project->company->params);

        $totalDecided    = $project->company->projects()->whereBudgetBased()
            ->whereHas('latestState', fn ($q) => $q->where('progress', '>=', ProjectState::Running)->where('is_in_stats', true))
            ->count();
        $totalSuccessful = $project->company->projects()->whereBudgetBased()
            ->whereHas('latestState', fn ($q) => $q->where('progress', ProjectState::Finished)->where('is_successful', true)->where('is_in_stats', true))
            ->count();
        $project->company->setAttribute(
            'quote_acceptance_rate',
            $totalDecided > 0 ? round($totalSuccessful / $totalDecided, 3) : null
        );
        $avgPaymentDays = $project->company->invoices()
            ->whereNotNull('paid_at')
            ->selectRaw('AVG(DATEDIFF(paid_at, created_at)) as avg_days')
            ->value('avg_days');
        $project->company->setAttribute('avg_payment_days', $avgPaymentDays !== null ? (int)round($avgPaymentDays) : null);

        if ($project->is_time_based) {
            $d = InvoiceItem::whereProjectId($project->id)
                ->whereHas('invoice', fn ($q) => $q->where('created_at', '>', now()->subYear()))
                ->sum('net');
            $project->setAttribute('revenue_last_12', floatval($d));
        }

        return $project;
    }
}
