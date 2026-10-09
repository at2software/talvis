import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { tracked } from '@constants/tracked';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { Sentinel } from '@models/sentinel/sentinel.model';
import { SentinelService } from '@models/sentinel/sentinel.service';
import { GlobalService } from '@models/global.service';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ProfileSentinelTriggerModalComponent } from '../profile-sentinel-node/profile-sentinel-trigger-modal/profile-sentinel-trigger-modal.component';
import { ProfileSentinelCommandModalComponent } from '../profile-sentinel-node/profile-sentinel-command-modal/profile-sentinel-command-modal.component';
import { ProfileSentinelConditionModalComponent } from '../profile-sentinel-node/profile-sentinel-condition-modal/profile-sentinel-condition-modal.component';
import { ObserverTrigger } from '@enums/observer-trigger';
import { SENTINEL_CONDITIONS, SentinelConditionInstance } from '../sentinel-condition.model';
import { CHAT_POST_COMMAND_KEYS, SENTINEL_COMMANDS, SentinelCommandInstance } from '../sentinel-command.model';
import { PermissionsDirective } from '@directives/permissions.directive';
import { AutosaveDirective } from '@directives/autosave.directive';
import { WebhookEndpointService } from '@models/webhook/webhook-endpoint.service';

const parseJson = <T>(json: string | undefined): T => {
    try { return JSON.parse(json || '[]'); } catch { return [] as T; }
};

@Component({
    selector: 'profile-sentinel-detail',
    templateUrl: './profile-sentinel-detail.component.html',
    styleUrl: './profile-sentinel-detail.component.scss',
    imports: [FormsModule, PermissionsDirective, AutosaveDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSentinelDetailComponent {
    #modal = inject(ModalBaseService);
    #route = inject(ActivatedRoute);
    #sentinelService = inject(SentinelService);
    #global = inject(GlobalService);
    #webhookEndpointService = inject(WebhookEndpointService);

    readonly #routeId = toSignal(this.#route.params.pipe(map((params) => params['id'] as string | undefined)));

    readonly #allSentinels = modelListResource(() => this.#sentinelService.index());
    readonly #detail = modelResource(this.#routeId, (id) => this.#sentinelService.show(id));

    readonly #sentinel = linkedSignal(() => this.#detail.value());
    readonly sentinel = tracked(this.#sentinel);

    readonly conditions = linkedSignal<SentinelConditionInstance[][]>(() => parseJson(this.#sentinel()?.condition));
    readonly commands = linkedSignal<SentinelCommandInstance[]>(() => parseJson(this.#sentinel()?.result));

    readonly #usesWebhooks = computed(() => this.#containsCommand(this.commands(), 'webhook'));
    readonly #webhookEndpoints = modelListResource(
        () => this.#usesWebhooks() || undefined,
        () => this.#webhookEndpointService.index(),
    );

    readonly circularWarning = computed(() => {
        const s = this.#sentinel();
        if (!s) return null;

        const myTriggerTable = s.table_name;
        const myTargetTables = this.#getActionTargetTables(this.commands());

        for (const other of this.#allSentinels.value()) {
            if (other.id === s.id) continue;
            if (this.#getActionTargetTables(parseJson<SentinelCommandInstance[]>(other.result)).includes(myTriggerTable)) {
                return `"${other.name}" creates "${myTriggerTable}" which triggers this sentinel.`;
            }
            if (myTargetTables.includes(other.table_name)) {
                return `This sentinel creates "${other.table_name}" which triggers "${other.name}".`;
            }
        }
        return null;
    });

    #containsCommand = (commands: SentinelCommandInstance[], key: string): boolean => commands.some((c) => c.key === key || this.#containsCommand(c.actions ?? [], key));

    #getActionTargetTables(commands: SentinelCommandInstance[]): string[] {
        const tables: string[] = [];
        for (const cmd of commands) {
            if (cmd.key === 'create_new') {
                const table = cmd.options?.find((o) => o.key === 'table')?.value;
                if (table) tables.push(table);
            } else if (cmd.key === 'for_each' && cmd.actions) {
                tables.push(...this.#getActionTargetTables(cmd.actions));
            }
        }
        return tables;
    }

    getTriggerLabel = () => ObserverTrigger[this.sentinel()?.trigger ?? 0] || 'Unknown';

    getTriggerColor(): string {
        switch (this.sentinel()?.trigger) {
            case ObserverTrigger.OnCreated: return 'success';
            case ObserverTrigger.OnUpdated: return 'teal';
            case ObserverTrigger.OnDeleted: return 'danger';
            case ObserverTrigger.OnSchedule: return 'cyan';
            default: return 'dark-grey';
        }
    }

    getConditionLabel = (c: SentinelConditionInstance) => SENTINEL_CONDITIONS.find((x) => x.key === c.key)?.label || c.key || 'Unknown';
    getConditionColumn = (c: SentinelConditionInstance) => c.options?.find((o) => o.key === 'column')?.value || '';
    getConditionInput = (c: SentinelConditionInstance) => c.options?.find((o) => o.key === 'input')?.value || '';
    getCommandLabel = (c: SentinelCommandInstance) => SENTINEL_COMMANDS.find((x) => x.key === c.key)?.label || c.key || 'Unknown';

    colorizeVariables(text: string): string {
        if (!text) return '';
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return escaped.replace(/\{\{([^}]+)\}\}/g, '<span class="var-highlight">{{$1}}</span>');
    }

    getCommandTarget(cmd: SentinelCommandInstance): string {
        if (['create_new', 'create_for_each'].includes(cmd.key)) return cmd.options?.find((o) => o.key === 'table')?.value || '';
        if (CHAT_POST_COMMAND_KEYS.includes(cmd.key)) return cmd.options?.find((o) => o.key === 'channel_id')?.value || '';
        if (cmd.key === 'webhook') {
            const id = cmd.options?.find((o) => o.key === 'endpoint')?.value || '';
            return this.#webhookEndpoints.value().find((e) => e.id == id)?.name || id;
        }
        return '';
    }

    getCommandDetails(cmd: SentinelCommandInstance): { key: string; value: string }[] {
        if (cmd.key === 'create_new') {
            const fieldsJson = cmd.options?.find((o) => o.key === 'fields')?.value || '{}';
            try { return Object.entries(JSON.parse(fieldsJson)).map(([k, v]) => ({ key: k, value: String(v) })); }
            catch { return []; }
        }
        if (CHAT_POST_COMMAND_KEYS.includes(cmd.key)) {
            const message = cmd.options?.find((o) => o.key === 'message')?.value || '';
            return message ? [{ key: 'message', value: String(message) }] : [];
        }
        if (cmd.key === 'webhook') {
            return ['event', 'payload']
                .map((key) => ({ key, value: cmd.options?.find((o) => o.key === key)?.value || '' }))
                .filter((detail) => detail.value);
        }
        if (cmd.key === 'set_value') {
            const column = cmd.options?.find((o) => o.key === 'column')?.value || '';
            const value = cmd.options?.find((o) => o.key === 'input')?.value || '';
            return column ? [{ key: column, value: String(value) }] : [];
        }
        return [];
    }

    getForEachRelation = (cmd: SentinelCommandInstance) => cmd.options?.find((o) => o.key === 'relation')?.value || '';
    getForEachVariable = (cmd: SentinelCommandInstance) => cmd.options?.find((o) => o.key === 'variable')?.value || 'item';

    getNestedConditionsFlat(cmd: SentinelCommandInstance): { groupIndex: number; index: number; column: string; label: string; input: string }[] {
        const result: { groupIndex: number; index: number; column: string; label: string; input: string }[] = [];
        (cmd.conditions || []).forEach((group, groupIndex) => {
            group.forEach((cond, index) => {
                result.push({
                    groupIndex, index,
                    column: cond.options?.find((o) => o.key === 'column')?.value || '',
                    label: SENTINEL_CONDITIONS.find((x) => x.key === cond.key)?.label || cond.key || 'Unknown',
                    input: cond.options?.find((o) => o.key === 'input')?.value || '',
                });
            });
        });
        return result;
    }

    addForEachCondition(cmdIndex: number) {
        this.commands.update((cmds) => {
            const updated = [...cmds];
            if (!updated[cmdIndex].conditions) updated[cmdIndex].conditions = [];
            updated[cmdIndex] = { ...updated[cmdIndex], conditions: [...updated[cmdIndex].conditions, [{ key: 'none' }]] };
            return updated;
        });
        this.#updateCommands();
    }

    addForEachAction(cmdIndex: number) {
        this.commands.update((cmds) => {
            const updated = [...cmds];
            if (!updated[cmdIndex].actions) updated[cmdIndex].actions = [];
            updated[cmdIndex] = { ...updated[cmdIndex], actions: [...updated[cmdIndex].actions, { key: 'none' }] };
            return updated;
        });
        this.#updateCommands();
    }

    editForEachCondition(cmdIndex: number, groupIndex: number, condIndex: number) {
        const cmd = this.commands()[cmdIndex];
        const condition = cmd.conditions?.[groupIndex]?.[condIndex];
        if (!condition) return;

        const variableName = cmd.options?.find((o) => o.key === 'variable')?.value || 'item';
        const relationName = cmd.options?.find((o) => o.key === 'relation')?.value || '';
        const variableTable = this.#getRelationTable(String(relationName));

        this.#modal
            .open(ProfileSentinelConditionModalComponent, this.sentinel()!, {
                nested: true, nestedData: condition,
                variableContext: variableTable ? { name: String(variableName), table: variableTable } : undefined,
                onSave: (updatedCondition: SentinelConditionInstance) => {
                    this.commands.update((cmds) => {
                        const updated = [...cmds];
                        updated[cmdIndex].conditions![groupIndex][condIndex] = updatedCondition;
                        return updated;
                    });
                    this.#updateCommands();
                },
            })
            .then(() => this.#reload());
    }

    #getRelationTable(relationPath: string): string | undefined {
        const s = this.sentinel();
        if (!s?.table_name || !relationPath) return undefined;
        const triggerVar = s.trigger_variable || '';
        const path = triggerVar && relationPath.startsWith(triggerVar + '.') ? relationPath.substring(triggerVar.length + 1) : relationPath;
        let currentTable = s.table_name;
        for (const part of path.split('.')) {
            const relation = this.#global.relations.find((r) => r.table === currentTable)?.relations?.[part];
            if (!relation?.model) return undefined;
            currentTable = relation.model.toLowerCase();
        }
        return currentTable;
    }

    editForEachAction(cmdIndex: number, actionIndex: number) {
        const cmd = this.commands()[cmdIndex];
        const action = cmd.actions?.[actionIndex];
        if (!action) return;

        const loopVariable = String(cmd.options?.find((o) => o.key === 'variable')?.value || 'item');
        const loopTable = this.#getRelationTable(String(cmd.options?.find((o) => o.key === 'relation')?.value || ''));

        this.#modal
            .open(ProfileSentinelCommandModalComponent, this.sentinel()!, {
                nested: true, nestedData: action, loopVariable, loopTable,
                onSave: (updatedAction: SentinelCommandInstance) => {
                    this.commands.update((cmds) => {
                        const updated = [...cmds];
                        updated[cmdIndex].actions![actionIndex] = updatedAction;
                        return updated;
                    });
                    this.#updateCommands();
                },
            })
            .then(() => this.#reload());
    }

    deleteForEachCondition(cmdIndex: number, groupIndex: number, condIndex: number, event: Event) {
        event.stopPropagation();
        this.commands.update((cmds) => {
            const updated = [...cmds];
            const conditions = [...(updated[cmdIndex].conditions || [])];
            const group = [...conditions[groupIndex]];
            group.splice(condIndex, 1);
            if (group.length === 0) conditions.splice(groupIndex, 1);
            else conditions[groupIndex] = group;
            updated[cmdIndex] = { ...updated[cmdIndex], conditions };
            return updated;
        });
        this.#updateCommands();
    }

    deleteForEachAction(cmdIndex: number, actionIndex: number, event: Event) {
        event.stopPropagation();
        this.commands.update((cmds) => {
            const updated = [...cmds];
            const actions = [...(updated[cmdIndex].actions || [])];
            actions.splice(actionIndex, 1);
            updated[cmdIndex] = { ...updated[cmdIndex], actions };
            return updated;
        });
        this.#updateCommands();
    }

    editTrigger = () => this.#modal.open(ProfileSentinelTriggerModalComponent, this.sentinel()!).then(() => this.#reload());

    editCondition(colIndex: number, rowIndex: number) {
        this.#modal.open(ProfileSentinelConditionModalComponent, this.sentinel()!, { column: colIndex, row: rowIndex }).then(() => this.#reload());
    }

    editCommand = (index: number) => this.#modal.open(ProfileSentinelCommandModalComponent, this.sentinel()!, index).then(() => this.#reload());

    addCondition() {
        if (!this.sentinel()) return;
        this.conditions.update((c) => [...c, [{ key: 'none' }]]);
        this.#updateConditions();
    }

    addConditionToGroup(colIndex: number) {
        if (!this.sentinel()) return;
        this.conditions.update((c) => {
            const updated = [...c];
            updated[colIndex] = [...updated[colIndex], { key: 'none' }];
            return updated;
        });
        this.#updateConditions();
    }

    deleteCondition(colIndex: number, rowIndex: number) {
        if (!this.sentinel()) return;
        this.conditions.update((c) => {
            const updated = [...c];
            updated[colIndex] = [...updated[colIndex]];
            updated[colIndex].splice(rowIndex, 1);
            if (updated[colIndex].length === 0) updated.splice(colIndex, 1);
            return updated;
        });
        this.#updateConditions();
    }

    addCommand() {
        if (!this.sentinel()) return;
        this.commands.update((c) => [...c, { key: 'none' }]);
        this.#updateCommands();
    }

    deleteCommand(index: number) {
        if (!this.sentinel()) return;
        this.commands.update((c) => { const u = [...c]; u.splice(index, 1); return u; });
        this.#updateCommands();
    }

    #updateConditions() {
        const s = this.sentinel()!;
        s.condition = JSON.stringify(this.conditions());
        s.update({ condition: s.condition }).subscribe((_) => this.#sentinel.set(Sentinel.fromJson(_)));
    }

    #updateCommands() {
        const s = this.sentinel()!;
        s.result = JSON.stringify(this.commands());
        s.update({ result: s.result }).subscribe((_) => this.#sentinel.set(Sentinel.fromJson(_)));
    }

    #reload = () => this.#detail.reload();
}
