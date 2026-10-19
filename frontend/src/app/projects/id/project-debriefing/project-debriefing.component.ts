import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal, computed } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbTooltipModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { DebriefService } from '@models/project/debrief.service';
import { CategoryBreakdownDto } from '@models/_core/api-response';
import { DebriefProjectDebrief } from '@models/project/debrief-project-debrief.model';
import { DebriefProblem } from '@models/project/debrief-problem.model';
import { DebriefPositive } from '@models/project/debrief-positive.model';
import { User } from '@models/user/user.model';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { DebriefProblemAutocompleteComponent } from '@app/projects/_shards/debrief-problem-autocomplete/debrief-problem-autocomplete.component';
import { DebriefPositiveAutocompleteComponent } from '@app/projects/_shards/debrief-positive-autocomplete/debrief-positive-autocomplete.component';
import { DebriefSolutionInlineComponent } from '@app/projects/_shards/debrief-solution-inline/debrief-solution-inline.component';
import { DebriefRadarChartComponent } from '@app/projects/_shards/debrief-radar-chart/debrief-radar-chart.component';
import { ProjectFeaturesListComponent } from '@app/projects/_shards/project-features-list/project-features-list.component';
import { Nx } from '@app/nx/nx.directive';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Toast } from '@shards/toast/toast';
import { AutosaveDirective } from '@directives/autosave.directive';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { LocalAIPlugin } from '@models/http/plugins/plugin.localai';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Dictionary } from '@constants/constants';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AISuggestion {
    type: 'problem' | 'positive';
    title: string;
    category?: string;
    severity?: Severity;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-debriefing',
    imports: [DatePipe, FormsModule, NgbTooltipModule, NgbDropdownModule, Nx, ToolbarComponent, DebriefProblemAutocompleteComponent, DebriefPositiveAutocompleteComponent, DebriefSolutionInlineComponent, DebriefRadarChartComponent, ProjectFeaturesListComponent, AutosaveDirective, EmptyStateComponent, SpinnerComponent],
    templateUrl: './project-debriefing.component.html',
    styleUrls: ['./project-debriefing.component.scss'],
})
export class ProjectDebriefingComponent {
    creating = signal(false);
    expandedProblemId = signal<string | null>(null);

    severityMap = signal<Dictionary<Severity>>({});
    aiLoadingMap = signal<Dictionary<boolean>>({});
    aiSuggestionsMap = signal<Dictionary<AISuggestion[]>>({});

    #service = inject(DebriefService);
    #guard = inject(ProjectDetailGuard);
    #pluginFactory = inject(PluginInstanceFactory);

    project = computed(() => this.#guard.object());
    projectId = computed(() => this.#guard.object()?.id || '');
    projectUsers = computed(() => this.#guard.object()?.assignedUsers().map(a => a.assignee as User) || []);
    #categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c])));

    readonly #categories = modelListResource(() => this.#service.indexCategories());
    readonly categories = this.#categories.value;

    readonly #debriefs = modelListResource(
        () => this.projectId() || undefined,
        (projectId) => this.#service.indexProjectDebriefs(projectId),
    );
    readonly debriefs = linkedSignal(this.#debriefs.value);
    readonly loading = computed(() => this.#categories.isLoading() || this.#debriefs.isLoading() || this.#debriefs.status() === 'idle');

    get localAiPlugin(): LocalAIPlugin | null {
        const encs = this.#pluginFactory.getPluginEncryptionsOfType('local_ai');
        if (!encs.length) return null;
        const plugin = this.#pluginFactory.instanceFor(encs[0]) as LocalAIPlugin;
        return plugin?.state === 'connected' ? plugin : null;
    }

    createDebrief() {
        this.creating.set(true);
        this.#service.createProjectDebrief(this.projectId()).subscribe({
            next: (debrief) => {
                this.debriefs.update(list => [debrief, ...list]);
                this.creating.set(false);
                Toast.success($localize`:@@i18n.debrief.created:New debrief created`);
            },
            error: () => this.creating.set(false),
        });
    }

    getCategoryBreakdown(debrief: DebriefProjectDebrief): CategoryBreakdownDto[] {
        const weights: Dictionary<number> = { low: 1, medium: 2, high: 3, critical: 4 };
        return this.categories().map(cat => {
            const problems = debrief.problems.filter(p => p.debrief_problem_category_id === cat.id);
            const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
            problems.forEach(p => { severityCounts[p.severity || 'medium']++; });
            return {
                category_id: cat.id,
                category_name: cat.name,
                category_color: cat.color,
                category_icon: cat.categoryIcon || '',
                total_problems: problems.length,
                severity_counts: severityCounts,
                weighted_score: Object.entries(severityCounts).reduce((sum, [sev, count]) => sum + count * weights[sev], 0),
                problems: problems.map(p => ({ id: p.id, title: p.title, severity: p.severity || undefined, usage_count: p.usage_count })),
            };
        });
    }

    getSelectedSeverity(debriefId: string): Severity {
        return this.severityMap()[debriefId] || 'medium';
    }

    setSelectedSeverity(debriefId: string, severity: Severity) {
        this.severityMap.update(m => ({ ...m, [debriefId]: severity }));
    }

    getExcludedProblemIds(debrief: DebriefProjectDebrief): string[] {
        return debrief.problems.map(p => p.id);
    }

    reloadDebrief(_debriefId: string) {
        this.#debriefs.reload();
    }

    onProblemSelected(debrief: DebriefProjectDebrief, problem: DebriefProblem) {
        this.#service.attachProblem(debrief.id, problem.id, this.getSelectedSeverity(debrief.id)).subscribe(() => {
            this.reloadDebrief(debrief.id);
            Toast.success($localize`:@@i18n.debrief.problemAdded:Problem added`);
        });
    }

    onCreateProblem(debrief: DebriefProjectDebrief, event: { title: string; categoryId: string }) {
        this.#service
            .storeProblem({ title: event.title, debrief_problem_category_id: event.categoryId })
            .subscribe(problem => {
                this.#service.attachProblem(debrief.id, problem.id, this.getSelectedSeverity(debrief.id)).subscribe(() => {
                    this.reloadDebrief(debrief.id);
                    Toast.success($localize`:@@i18n.debrief.problemCreated:Problem created and added`);
                });
            });
    }

    toggleProblem(problem: DebriefProblem) {
        this.expandedProblemId.set(this.expandedProblemId() === problem.id ? null : problem.id);
    }

    updateProblemSeverity(debrief: DebriefProjectDebrief, problem: DebriefProblem, severity: Severity) {
        this.#service.updateProblemSeverity(debrief.id, problem.id, severity).subscribe(() => {
            this.reloadDebrief(debrief.id);
        });
    }

    updateProblemCategory(debrief: DebriefProjectDebrief, problem: DebriefProblem, categoryId: string) {
        this.#service.updateProblem(problem.id, { debrief_problem_category_id: categoryId }).subscribe(() => {
            this.reloadDebrief(debrief.id);
        });
    }

    removeProblem(debrief: DebriefProjectDebrief, problem: DebriefProblem) {
        this.#service.detachProblem(debrief.id, problem.id).subscribe(() => {
            if (this.expandedProblemId() === problem.id) this.expandedProblemId.set(null);
            this.reloadDebrief(debrief.id);
        });
    }

    onAddPositive(debrief: DebriefProjectDebrief, event: { title: string; categoryId?: string; existingId?: string }) {
        this.#service
            .storePositive(debrief.id, {
                title: event.title,
                debrief_problem_category_id: event.categoryId || undefined,
                ...(event.existingId ? { existing_id: event.existingId } : {}),
            } as any)
            .subscribe(() => {
                this.reloadDebrief(debrief.id);
                Toast.success($localize`:@@i18n.debrief.positiveAdded:Positive added`);
            });
    }

    removePositive(debrief: DebriefProjectDebrief, positive: DebriefPositive) {
        this.#service.destroyPositive(positive.id).subscribe(() => {
            this.reloadDebrief(debrief.id);
        });
    }

    setDebriefedUser(debrief: DebriefProjectDebrief, user: User | null) {
        debrief.debriefed_user = user || undefined;
        debrief.debriefed_user_id = user?.id;
        this.#service.updateDebrief(debrief.id, { debriefed_user_id: user?.id ?? undefined }).subscribe();
    }

    setRating(debrief: DebriefProjectDebrief, rating: number) {
        const newRating = debrief.rating === rating ? undefined : rating;
        this.#service.updateDebrief(debrief.id, { rating: newRating }).subscribe(updated => {
            this.debriefs.update(list => list.map(d => d.id === updated.id ? updated : d));
        });
    }

    markAsCompleted(debrief: DebriefProjectDebrief) {
        this.#service.updateDebrief(debrief.id, { status: 'completed' }).subscribe(updated => {
            this.debriefs.update(list => list.map(d => d.id === updated.id ? updated : d));
            Toast.success($localize`:@@i18n.common.debriefCompleted:debrief completed`);
        });
    }

    deleteDebrief(debrief: DebriefProjectDebrief) {
        debrief.modalConfirm().then(() => {
            this.#service.deleteDebrief(debrief.id).subscribe(() => {
                this.debriefs.update(list => list.filter(d => d.id !== debrief.id));
            });
        });
    }

    reopenDebrief(debrief: DebriefProjectDebrief) {
        this.#service.updateDebrief(debrief.id, { status: 'draft' }).subscribe(updated => {
            this.debriefs.update(list => list.map(d => d.id === updated.id ? updated : d));
            Toast.info($localize`:@@i18n.common.debriefReopened:debrief reopened`);
        });
    }

    getCategoryColor(categoryId: string): string {
        return this.#categoryMap().get(categoryId)?.color || '#888888';
    }

    getCategoryName(categoryId: string): string {
        return this.#categoryMap().get(categoryId)?.name || '';
    }

    getSeverityClass(severity: string): string {
        const map: Dictionary<string> = { critical: 'bg-red', high: 'bg-orange', medium: 'bg-cyan', low: 'bg-grey' };
        return map[severity] ?? 'bg-grey';
    }

    runLocalAI(debrief: DebriefProjectDebrief) {
        const plugin = this.localAiPlugin;
        if (!plugin) return;

        const localAiEnc = this.#pluginFactory.getPluginEncryptionsOfType('local_ai')[0];
        const configuredModel = localAiEnc?.value?.model?.trim();
        const selectedModel = configuredModel || plugin.getDefaultModel()?.id;

        this.aiLoadingMap.update(m => ({ ...m, [debrief.id]: true }));
        this.aiSuggestionsMap.update(m => ({ ...m, [debrief.id]: [] }));

        const categoryNames = this.categories().map(c => c.name).join(', ');
        const problemLines = debrief.problems.map(p => `- ${p.title} (category: ${this.getCategoryName(p.debrief_problem_category_id)}, severity: ${p.severity || 'medium'})`).join('\n');
        const positiveLines = debrief.positives.map(p => `- ${p.title}${p.category ? ` (category: ${p.category.name})` : ''}`).join('\n');

        const prompt = `You are analyzing a project debrief. Based on the existing data, suggest additional problems and positives that could be added.

Available categories: ${categoryNames}

Summary notes: ${debrief.summary_notes || '(none)'}

Existing problems:
${problemLines || '(none)'}

Existing positives (what went well):
${positiveLines || '(none)'}

Respond with ONLY a JSON array of suggestions. Each item must have:
- "type": "problem" or "positive"
- "title": short descriptive title
- "category": one of the available categories (or omit if unsure)
- "severity": "low", "medium", "high", or "critical" (only for problems)

Do not output reasoning, analysis, XML tags, markdown, code fences, or any text before/after JSON.

Suggest 4-8 items that are NOT already listed. Return raw JSON only, no explanation.

Example format:
[{"type":"problem","title":"Unclear requirements","category":"Process","severity":"high"},{"type":"positive","title":"Good team communication","category":"Process"}]`;

        plugin.generateText(prompt, selectedModel).subscribe({
            next: (text) => {
                this.aiLoadingMap.update(m => ({ ...m, [debrief.id]: false }));
                try {
                    const suggestions = this.#parseAiSuggestions(text);
                    this.aiSuggestionsMap.update(m => ({ ...m, [debrief.id]: suggestions }));
                    if (!suggestions.length) throw new Error('No suggestions parsed from AI response');
                } catch {
                    Toast.error($localize`:@@i18n.debrief.aiParseError:Could not parse AI response`);
                }
            },
            error: (err) => {
                this.aiLoadingMap.update(m => ({ ...m, [debrief.id]: false }));
                Toast.error(err?.message || $localize`:@@i18n.debrief.aiError:AI request failed`);
            },
        });
    }

    #parseAiSuggestions(text: string): AISuggestion[] {
        try {
            const parsed = JSON.parse(text.trim());
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(item => item && typeof item.title === 'string' && item.title.trim() && (item.type === 'problem' || item.type === 'positive'))
                .map(item => {
                    const suggestion: AISuggestion = { type: item.type, title: item.title.trim() };
                    if (item.category?.trim()) suggestion.category = item.category.trim();
                    if (item.type === 'problem') {
                        const sev = item.severity?.toLowerCase();
                        suggestion.severity = (['low', 'medium', 'high', 'critical'].includes(sev) ? sev : 'medium') as Severity;
                    }
                    return suggestion;
                });
        } catch {
            return [];
        }
    }

    applySuggestion(debrief: DebriefProjectDebrief, suggestion: AISuggestion) {
        const categoryId = suggestion.category
            ? this.categories().find(c => c.name.toLowerCase() === suggestion.category!.toLowerCase())?.id
            : undefined;

        if (suggestion.type === 'problem') {
            this.#service
                .storeProblem({ title: suggestion.title, debrief_problem_category_id: categoryId || this.categories()[0]?.id })
                .subscribe(problem => {
                    this.#service.attachProblem(debrief.id, problem.id, suggestion.severity || 'medium').subscribe(() => {
                        this.reloadDebrief(debrief.id);
                        this.removeSuggestion(debrief.id, suggestion);
                        Toast.success($localize`:@@i18n.debrief.problemCreated:Problem created and added`);
                    });
                });
        } else {
            this.#service
                .storePositive(debrief.id, { title: suggestion.title, debrief_problem_category_id: categoryId || undefined })
                .subscribe(() => {
                    this.reloadDebrief(debrief.id);
                    this.removeSuggestion(debrief.id, suggestion);
                    Toast.success($localize`:@@i18n.debrief.positiveAdded:Positive added`);
                });
        }
    }

    removeSuggestion(debriefId: string, suggestion: AISuggestion) {
        this.aiSuggestionsMap.update(m => ({ ...m, [debriefId]: (m[debriefId] || []).filter(s => s !== suggestion) }));
    }
}
