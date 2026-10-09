<?php

namespace App\Http\Controllers;

use App\Http\Requests\Debrief\CombinePositivesRequest;
use App\Http\Requests\Debrief\CombineProblemsRequest;
use App\Http\Requests\Debrief\DebriefProblemRequest;
use App\Http\Requests\Debrief\DebriefRequest;
use App\Http\Requests\Debrief\PositiveRequest;
use App\Http\Requests\Debrief\ProblemRequest;
use App\Http\Requests\Debrief\ProblemSolutionRequest;
use App\Http\Requests\Debrief\SolutionRequest;
use App\Models\DebriefPositive;
use App\Models\DebriefProblem;
use App\Models\DebriefProblemCategory;
use App\Models\DebriefProjectDebrief;
use App\Models\DebriefSolution;
use App\Models\Project;
use App\Services\DebriefStatisticsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DebriefController extends Controller {
    public function __construct(
        protected DebriefStatisticsService $statisticsService
    ) {}

    private function notifyDebrief(DebriefProjectDebrief $debrief): void {
        $debrief->touch();
    }

    // ############
    // CATEGORIES
    // ############

    public function indexCategories() {
        return DebriefProblemCategory::orderBy('position')->get();
    }

    // ############
    // PROBLEMS
    // ############

    public function indexProblems(Request $request) {
        $query = DebriefProblem::with('category')->orderByUsage();

        if ($request->has('q') && strlen($request->q) > 0) {
            $query->search($request->q);
        }

        if ($request->has('category_id')) {
            $query->byCategory($request->category_id);
        }

        if ($request->has('limit')) {
            return $query->limit((int)$request->limit)->get();
        }
        return $query->paginate(50)->withQueryString();
    }
    public function storeProblem(ProblemRequest $request) {
        $validated                       = $request->validated();
        $validated['created_by_user_id'] = $request->user()?->id;
        return DebriefProblem::create($validated)->load('category');
    }
    public function showProblem(DebriefProblem $problem) {
        return $problem->load(['category', 'solutions', 'createdBy']);
    }
    public function updateProblem(ProblemRequest $request, DebriefProblem $problem) {
        $problem->update($request->validated());
        return $problem->load('category');
    }
    public function destroyProblem(DebriefProblem $problem) {
        $problem->delete();
        return response(null, 204);
    }

    // ############
    // SOLUTIONS
    // ############

    public function indexSolutions(Request $request) {
        $query = DebriefSolution::orderByUsage();

        if ($request->has('q') && strlen($request->q) > 0) {
            $query->search($request->q);
        }

        if ($request->has('limit')) {
            return $query->limit((int)$request->limit)->get();
        }
        return $query->paginate(50)->withQueryString();
    }
    public function storeSolution(SolutionRequest $request) {
        $validated                       = $request->validated();
        $validated['created_by_user_id'] = $request->user()?->id;
        return DebriefSolution::create($validated);
    }
    public function updateSolution(SolutionRequest $request, DebriefSolution $solution) {
        $solution->update($request->validated());
        return $solution;
    }
    public function destroySolution(DebriefSolution $solution) {
        $solution->delete();
        return response(null, 204);
    }

    // #######################
    // PROBLEM-SOLUTION LINKS
    // #######################

    public function storeProblemSolution(ProblemSolutionRequest $request, DebriefProblem $problem) {
        $validated                      = $request->validated();
        $validated['linked_by_user_id'] = $request->user()?->id;

        $problem->solutions()->attach($validated['debrief_solution_id'], [
            'debrief_project_debrief_id' => $validated['debrief_project_debrief_id'] ?? null,
            'effectiveness_rating'       => $validated['effectiveness_rating'] ?? null,
            'notes'                      => $validated['notes'] ?? null,
            'linked_by_user_id'          => $validated['linked_by_user_id'],
        ]);

        $solution = DebriefSolution::find($validated['debrief_solution_id']);
        $solution->incrementUsageCount();
        return $problem->load('solutions');
    }
    public function updateProblemSolution(ProblemSolutionRequest $request, DebriefProblem $problem, DebriefSolution $solution) {
        $problem->solutions()->updateExistingPivot($solution->id, $request->validated());

        $solution->updateAverageEffectiveness();
        return $problem->load('solutions');
    }
    public function destroyProblemSolution(DebriefProblem $problem, DebriefSolution $solution) {
        $problem->solutions()->detach($solution->id);
        $solution->decrementUsageCount();
        $solution->updateAverageEffectiveness();
        return response(null, 204);
    }

    // ##################
    // PROJECT DEBRIEFS
    // ##################

    public function indexDebriefs(Request $request) {
        $query = DebriefProjectDebrief::with(['project.company', 'conductedBy']);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        return $query->latest()->paginate(50)->withQueryString();
    }
    public function indexProjectDebriefs(Project $project) {
        return $project->debriefs()->with(['conductedBy', 'debriefedUser', 'problems.category', 'positives.category'])->latest()->get();
    }
    public function storeDebrief(DebriefRequest $request, Project $project) {
        $validated = $request->validated();

        $debrief = DebriefProjectDebrief::create([
            'project_id'           => $project->id,
            'conducted_by_user_id' => $request->user()?->id,
            'debriefed_user_id'    => $validated['debriefed_user_id'] ?? null,
            'status'               => 'draft',
        ]);
        return $debrief->load(['project.company', 'conductedBy', 'debriefedUser', 'problems.category', 'positives.category']);
    }
    public function destroyDebrief(DebriefProjectDebrief $debrief) {
        $debrief->delete();
        return response(null, 204);
    }
    public function updateDebrief(DebriefRequest $request, DebriefProjectDebrief $debrief) {
        $validated = $request->validated();

        if (isset($validated['status']) && $validated['status'] === 'completed') {
            $debrief->markAsCompleted();
        } else {
            $debrief->update($validated);
        }
        return $debrief->load(['project.company', 'conductedBy', 'debriefedUser', 'problems.category', 'positives.category']);
    }

    // #####################
    // PROBLEM-DEBRIEF LINKS
    // #####################

    public function storeDebriefProblem(DebriefProblemRequest $request, DebriefProjectDebrief $debrief) {
        $validated = $request->validated();

        $exists = $debrief->problems()->where('debrief_problem_id', $validated['debrief_problem_id'])->exists();
        if ($exists) {
            return response(['error' => 'Problem already attached to this debrief'], 422);
        }

        $debrief->problems()->attach($validated['debrief_problem_id'], [
            'severity'            => $validated['severity'] ?? 'medium',
            'context_notes'       => $validated['context_notes'] ?? null,
            'reported_by_user_id' => $request->user()?->id,
        ]);

        $problem = DebriefProblem::find($validated['debrief_problem_id']);
        $problem->incrementUsageCount();
        $this->notifyDebrief($debrief);
        return $debrief->load(['problems.category', 'positives.category']);
    }
    public function updateDebriefProblem(DebriefProblemRequest $request, DebriefProjectDebrief $debrief, DebriefProblem $problem) {
        $debrief->problems()->updateExistingPivot($problem->id, $request->validated());
        $this->notifyDebrief($debrief);
        return $debrief->load(['problems.category', 'positives.category']);
    }
    public function destroyDebriefProblem(DebriefProjectDebrief $debrief, DebriefProblem $problem) {
        $debrief->problems()->detach($problem->id);
        $problem->decrementUsageCount();
        $this->notifyDebrief($debrief);
        return response(null, 204);
    }

    // ###########
    // POSITIVES
    // ###########

    public function storePositive(PositiveRequest $request, DebriefProjectDebrief $debrief) {
        if ($request->filled('existing_id')) {
            $positive = DebriefPositive::findOrFail($request->existing_id);
            if (! $debrief->positives()->where('debrief_positives.id', $positive->id)->exists()) {
                $debrief->positives()->attach($positive->id, ['reported_by_user_id' => $request->user()?->id]);
            }
        } else {
            $validated                        = $request->validated();
            $validated['reported_by_user_id'] = $request->user()?->id;
            $positive                         = DebriefPositive::create($validated);
            $debrief->positives()->attach($positive->id, ['reported_by_user_id' => $request->user()?->id]);
        }
        $this->notifyDebrief($debrief);
        return $positive->load('category');
    }
    public function searchPositives(Request $request) {
        $query = DebriefPositive::with('category')
            ->orderBy('created_at', 'desc')
            ->limit(20);

        if ($request->has('q') && strlen($request->q) > 0) {
            $query->search($request->q);
        }
        return $query->get();
    }
    public function updatePositive(PositiveRequest $request, DebriefPositive $positive) {
        $positive->update($request->validated());
        return $positive->load('category');
    }
    public function destroyDebriefPositive(DebriefProjectDebrief $debrief, DebriefPositive $positive) {
        $debrief->positives()->detach($positive->id);
        $this->notifyDebrief($debrief);
        return response(null, 204);
    }
    public function destroyPositive(DebriefPositive $positive) {
        $positive->delete();
        return response(null, 204);
    }

    // ###########
    // ANALYTICS
    // ###########

    public function showStats(Request $request) {
        $filters = $request->all();
        $limit   = $this->limit($request);
        $months  = $this->months($request);

        $sections = [
            'aggregated'           => fn () => $this->statisticsService->getAggregatedStats($filters),
            'categories'           => fn () => $this->statisticsService->getCategoryBreakdown($filters),
            'categories_positives' => fn () => $this->statisticsService->getCategoryBreakdownPositives($filters),
            'top_problems'         => fn () => $this->statisticsService->getTopProblems($limit, $filters),
            'top_solutions'        => fn () => $this->statisticsService->getTopSolutions($limit),
            'top_positives'        => fn () => $this->statisticsService->getTopPositives($limit, $filters),
            'trends'               => fn () => $this->statisticsService->getTrends($months),
            'top_customers_worst'  => fn () => $this->statisticsService->getTopCustomersByProblems($limit, $filters),
            'top_customers_best'   => fn () => $this->statisticsService->getTopCustomersByPositives($limit, $filters),
        ];

        $include  = array_filter(explode(',', $request->input('include', '')));
        $selected = $include ?: array_keys($sections);

        $result = [];
        foreach (array_intersect(array_keys($sections), $selected) as $key) {
            $result[$key] = $sections[$key]();
        }
        return $result;
    }
    public function showStatsAggregated(Request $request) {
        return $this->statisticsService->getAggregatedStats($request->all());
    }
    public function showStatsCategories(Request $request) {
        return $this->statisticsService->getCategoryBreakdown($request->all());
    }
    public function showStatsTopProblems(Request $request) {
        return $this->statisticsService->getTopProblems(
            $this->limit($request),
            $request->all()
        );
    }
    public function showStatsTopSolutions(Request $request) {
        return $this->statisticsService->getTopSolutions(
            $this->limit($request)
        );
    }
    public function showStatsTrends(Request $request) {
        return $this->statisticsService->getTrends(
            $this->months($request)
        );
    }
    public function showStatsTopPositives(Request $request) {
        return $this->statisticsService->getTopPositives(
            $this->limit($request),
            $request->all()
        );
    }
    public function showStatsCategoriesPositives(Request $request) {
        return $this->statisticsService->getCategoryBreakdownPositives($request->all());
    }
    public function combineProblems(CombineProblemsRequest $request) {
        $validated = $request->validated();

        $keepId   = $validated['keep_id'];
        $mergeIds = array_values(array_filter($validated['merge_ids'], fn ($id) => $id !== $keepId));
        return DB::transaction(function () use ($keepId, $mergeIds, $validated) {
            $keep = DebriefProblem::findOrFail($keepId);

            foreach (DebriefProblem::findMany($mergeIds) as $merge) {
                $keepDebriefIds = $keep->projectDebriefs()->pluck('debrief_project_debriefs.id');

                foreach ($merge->projectDebriefs()->whereNotIn('debrief_project_debriefs.id', $keepDebriefIds)->get() as $debrief) {
                    $keep->projectDebriefs()->attach($debrief->id, [
                        'severity'            => $debrief->pivot->severity,
                        'context_notes'       => $debrief->pivot->context_notes,
                        'reported_by_user_id' => $debrief->pivot->reported_by_user_id,
                    ]);
                }

                $merge->projectDebriefs()->detach();
                $merge->delete();
            }

            $keep->title       = $validated['title'];
            $keep->usage_count = $keep->projectDebriefs()->count();
            $keep->save();
            return $keep->load('category');
        });
    }
    public function combinePositives(CombinePositivesRequest $request) {
        $validated = $request->validated();
        return DB::transaction(function () use ($validated) {
            $keepId   = $validated['ids'][0];
            $mergeIds = array_slice($validated['ids'], 1);
            $keep     = DebriefPositive::findOrFail($keepId);

            $keepDebriefIds = $keep->projectDebriefs()->pluck('debrief_project_debriefs.id');

            foreach (DebriefPositive::findMany($mergeIds) as $merge) {
                foreach ($merge->projectDebriefs()->whereNotIn('debrief_project_debriefs.id', $keepDebriefIds)->get() as $debrief) {
                    $keep->projectDebriefs()->attach($debrief->id, [
                        'reported_by_user_id' => $debrief->pivot->reported_by_user_id,
                    ]);
                }
                $merge->projectDebriefs()->detach();
                $merge->delete();
            }

            $keep->title = $validated['title'];
            $keep->save();
            return $keep->load('category');
        });
    }
    public function showStatsTopCustomersWorst(Request $request) {
        return $this->statisticsService->getTopCustomersByProblems(
            $this->limit($request),
            $request->all()
        );
    }
    private function limit(Request $request): int {
        return $request->validate(['limit' => 'integer|min:1|max:100'])['limit'] ?? 10;
    }
    private function months(Request $request): int {
        return $request->validate(['months' => 'integer|min:1|max:120'])['months'] ?? 12;
    }
    public function showStatsTopCustomersBest(Request $request) {
        return $this->statisticsService->getTopCustomersByPositives(
            $this->limit($request),
            $request->all()
        );
    }
}
