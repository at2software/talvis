import { Service } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TalvisHttpService } from '@models/http/http.talvis';
import { Dictionary } from '@constants/constants';
import { DebriefProblemCategory } from './debrief-problem-category.model';
import { DebriefProblem } from './debrief-problem.model';
import { DebriefSolution } from './debrief-solution.model';
import { DebriefProjectDebrief } from './debrief-project-debrief.model';
import { DebriefPositive } from './debrief-positive.model';
import { Company } from '@models/company/company.model';
import { DebriefStatsDto, CategoryBreakdownDto, CategoryBreakdownPositivesDto, TrendDataDto, DebriefStatsResponseDto } from '@models/_core/api-response';

export type DebriefStatsResult = DebriefStatsResponseDto<DebriefProblem, DebriefSolution, DebriefPositive, Company>;

@Service()
export class DebriefService extends TalvisHttpService<DebriefProjectDebrief> {
    public apiPath = 'debriefs';
    override readonly model = DebriefProjectDebrief;

    indexCategories = () => this.aget('debriefs/categories', {}, DebriefProblemCategory);

    indexProblems = (filters?: Dictionary) => this.paginate('debriefs/problems', filters, DebriefProblem);
    searchProblems = (q: string, categoryId?: string) => this.aget('debriefs/problems', categoryId ? { q, category_id: categoryId, limit: 20 } : { q, limit: 20 }, DebriefProblem);
    storeProblem = (data: Partial<DebriefProblem>) => this.post('debriefs/problems', data, DebriefProblem);
    showProblem = (id: string) => this.get(`debriefs/problems/${id}`, {});
    updateProblem = (id: string, data: Partial<DebriefProblem>) => this.put(`debriefs/problems/${id}`, data, DebriefProblem);
    destroyProblem = (id: string) => this.delete(`debriefs/problems/${id}`);

    indexSolutions = (filters?: Dictionary) => this.paginate('debriefs/solutions', filters, DebriefSolution);
    searchSolutions = (q: string) => this.aget('debriefs/solutions', { q, limit: 20 }, DebriefSolution);
    storeSolution = (data: Partial<DebriefSolution>) => this.post('debriefs/solutions', data, DebriefSolution);
    updateSolution = (id: string, data: Partial<DebriefSolution>) => this.put(`debriefs/solutions/${id}`, data, DebriefSolution);
    destroySolution = (id: string) => this.delete(`debriefs/solutions/${id}`);

    linkSolution = (problemId: string, solutionId: string, debriefId?: string, rating?: number) =>
        this.post(
            `debriefs/problems/${problemId}/solutions`,
            {
                debrief_solution_id: solutionId,
                debrief_project_debrief_id: debriefId,
                effectiveness_rating: rating,
            },
            DebriefProblem,
        );

    rateSolution = (problemId: string, solutionId: string, rating: number, notes?: string) => this.put(
            `debriefs/problems/${problemId}/solutions/${solutionId}`,
            {
                effectiveness_rating: rating,
                notes,
            },
            DebriefProblem,
        );

    unlinkSolution = (problemId: string, solutionId: string) => this.delete(`debriefs/problems/${problemId}/solutions/${solutionId}`);

    indexDebriefs = (filters?: Dictionary) => this.paginate('debriefs', filters);
    indexProjectDebriefs = (projectId: string) => this.aget(`projects/${projectId}/debriefs`, {}, DebriefProjectDebrief);
    createProjectDebrief = (projectId: string) => this.post(`projects/${projectId}/debriefs`, {}, DebriefProjectDebrief);
    updateDebrief = (id: string, data: Partial<DebriefProjectDebrief>) => this.put(`debriefs/${id}`, data, DebriefProjectDebrief);
    deleteDebrief = (id: string) => this.delete(`debriefs/${id}`);

    attachProblem = (debriefId: string, problemId: string, severity?: string, contextNotes?: string) =>
        this.post(
            `debriefs/${debriefId}/problems`,
            {
                debrief_problem_id: problemId,
                severity,
                context_notes: contextNotes,
            },
            DebriefProjectDebrief,
        );

    updateProblemSeverity = (debriefId: string, problemId: string, severity: string, contextNotes?: string) =>
        this.put(
            `debriefs/${debriefId}/problems/${problemId}`,
            {
                severity,
                context_notes: contextNotes,
            },
            DebriefProjectDebrief,
        );

    detachProblem = (debriefId: string, problemId: string) => this.delete(`debriefs/${debriefId}/problems/${problemId}`);
    detachPositive = (debriefId: string, positiveId: string) => this.delete(`debriefs/${debriefId}/positives/${positiveId}`);

    searchPositives = (q: string) => this.aget('debriefs/positives/search', { q }, DebriefPositive);
    storePositive = (debriefId: string, data: Partial<DebriefPositive>) => this.post(`debriefs/${debriefId}/positives`, data, DebriefPositive);
    updatePositive = (id: string, data: Partial<DebriefPositive>) => this.put(`debriefs/positives/${id}`, data, DebriefPositive);
    destroyPositive = (id: string) => this.delete(`debriefs/positives/${id}`);

    getStatsAggregated = (filters?: Dictionary) => this.get<DebriefStatsDto>('debriefs/stats/aggregated', filters);
    getStatsCategories = (filters?: Dictionary) => this.aget<CategoryBreakdownDto>('debriefs/stats/categories', filters);
    getStatsTopProblems = (limit?: number, filters?: Dictionary) => this.aget<DebriefProblem>('debriefs/stats/top-problems', { limit, ...filters });

    getStatsTopSolutions = (limit?: number) => this.aget<DebriefSolution>('debriefs/stats/top-solutions', { limit });

    getStatsTopPositives = (limit?: number, filters?: Dictionary) => this.aget<DebriefPositive>('debriefs/stats/top-positives', { limit, ...filters });

    getStatsCategoriesPositives = (filters?: Dictionary) => this.aget<CategoryBreakdownPositivesDto>('debriefs/stats/categories-positives', filters);
    getStatsTrends = (months?: number) => this.aget<TrendDataDto>('debriefs/stats/trends', { months });
    combineProblems = (keepId: string, mergeIds: string[], title: string) => this.post('debriefs/problems/combine', { keep_id: keepId, merge_ids: mergeIds, title });
    combinePositives = (ids: string[], title: string) => this.post('debriefs/positives/combine', { ids, title });
    getStatsTopCustomers = (type: 'worst' | 'best', limit?: number, filters?: Dictionary) => this.aget<Company>(`debriefs/stats/top-customers-${type}`, { limit, ...filters }, Company);

    getStats = (include?: string[], filters?: Dictionary, limit?: number, months?: number): Observable<DebriefStatsResult> =>
        (this.get<DebriefStatsResponseDto>('debriefs/stats', { include: include?.join(','), limit, months, ...filters })).pipe(
            map((raw) => ({
                aggregated: raw.aggregated,
                categories: raw.categories,
                categories_positives: raw.categories_positives,
                trends: raw.trends,
                top_problems: raw.top_problems?.map((item) => DebriefProblem.fromJson(item)),
                top_solutions: raw.top_solutions?.map((item) => DebriefSolution.fromJson(item)),
                top_positives: raw.top_positives?.map((item) => DebriefPositive.fromJson(item)),
                top_customers_worst: raw.top_customers_worst?.map((item) => Company.fromJson(item)),
                top_customers_best: raw.top_customers_best?.map((item) => Company.fromJson(item)),
            })),
        );
}
