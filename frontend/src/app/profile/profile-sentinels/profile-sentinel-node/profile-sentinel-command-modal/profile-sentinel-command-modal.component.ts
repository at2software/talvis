import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbActiveModal, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { Sentinel } from '@models/sentinel/sentinel.model';
import { GlobalService } from '@models/global.service';
import { SENTINEL_COMMANDS, SentinelCommand, SentinelCommandInstance } from '../../sentinel-command.model';
import { SentinelConditionInstance } from '../../sentinel-condition.model';
import { SentinelOptionInstance } from '../../sentinel-condition-option-field.model';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ModelFieldEditorComponent } from './model-field-editor/model-field-editor.component';
import { RelationPathAutocompleteComponent } from './relation-path-autocomplete/relation-path-autocomplete.component';
import { VariableAutocompleteComponent } from './variable-autocomplete/variable-autocomplete.component';
import { WebhookEndpointSelectComponent } from './webhook-endpoint-select/webhook-endpoint-select.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'sentinel-command-edit-modal',
    templateUrl: './profile-sentinel-command-modal.component.html',
    styleUrls: ['./profile-sentinel-command-modal.component.scss'],
    imports: [FormsModule, NgTemplateOutlet, NgbDropdownModule, ModelFieldEditorComponent, RelationPathAutocompleteComponent, VariableAutocompleteComponent, WebhookEndpointSelectComponent],
})
export class ProfileSentinelCommandModalComponent extends ModalBaseComponent<boolean> {
    sentinel!: Sentinel;
    commandIndex = 0;
    #activeModal = inject(NgbActiveModal);
    #global = inject(GlobalService);

    allCommands = SENTINEL_COMMANDS;
    selectedCommand!: SentinelCommand;
    existingConditions: SentinelConditionInstance[][] = [];
    existingActions: SentinelCommandInstance[] = [];
    nested = false;
    onSave?: (action: SentinelCommandInstance) => void;
    loopVariable?: string;
    loopTable?: string;
    tables: { name: string; columns: { Field: string }[] }[] = [];
    relations: { table: string; relations: Dictionary<{ type: string; model?: string }> }[] = [];
    getTableColumns = (name: string) => this.tables.find((t) => t.name == name)?.columns;
    getTargetTable = () => String(this.selectedCommand?.options?.find((o) => o.key === 'table')?.value ?? '');

    onRelationSelected(finalRelationName: string) {
        const variableOpt = this.selectedCommand?.options?.find((o) => o.key === 'variable');
        if (variableOpt) {
            // Convert to singular: remove trailing 's' or 'ies' -> 'y'
            let singular = finalRelationName;
            if (singular.endsWith('ies')) singular = singular.slice(0, -3) + 'y';
            else if (singular.endsWith('s')) singular = singular.slice(0, -1);
            variableOpt.value = singular;
        }
    }

    init(sentinel: Sentinel, index: number | { nested?: boolean; nestedData?: SentinelCommandInstance; onSave?: (a: SentinelCommandInstance) => void; loopVariable?: string; loopTable?: string }): void {
        this.sentinel = sentinel;
        this.tables = this.#global.tables;
        this.relations = this.#global.relations;

        if (typeof index === 'object' && index.nested) {
            this.nested = true;
            this.onSave = index.onSave;
            this.loopVariable = index.loopVariable;
            this.loopTable = index.loopTable;
            this.allCommands = SENTINEL_COMMANDS.filter((c) => c.allowedTriggerTypes.includes(this.sentinel.trigger) && c.key !== 'for_each');
            if (index.nestedData) {
                this.selectedCommand = this.parseCommand(index.nestedData);
            }
            return;
        }

        this.commandIndex = (index as number) ?? 0;
        this.allCommands = SENTINEL_COMMANDS.filter((c) => c.allowedTriggerTypes.includes(this.sentinel.trigger));
        if (this.sentinel.result) {
            const commands = JSON.parse(this.sentinel.result);
            if (commands[this.commandIndex]) {
                const data = commands[this.commandIndex];
                this.selectedCommand = this.parseCommand(data);
                this.existingConditions = data.conditions || [];
                this.existingActions = data.actions || [];
            }
        }
    }

    onSuccess = () => true;

    accept = () => {
        const command: SentinelCommandInstance = {
            key: this.selectedCommand.key,
            options: this.selectedCommand.options?.map((o) => ({ key: o.key, value: o.value !== undefined ? String(o.value) : undefined })) || [],
        };

        if (this.nested && this.onSave) {
            this.onSave(command);
            this.#activeModal.close(true);
            return;
        }

        if (this.selectedCommand.key === 'for_each') {
            command.conditions = this.existingConditions;
            command.actions = this.existingActions;
        }

        const commands = JSON.parse(this.sentinel.result || '[]');
        if (commands[this.commandIndex]) {
            commands[this.commandIndex] = command;
        } else {
            commands.push(command);
        }
        this.sentinel.result = JSON.stringify(commands);
        this.sentinel?.update({ result: this.sentinel.result }).subscribe((_) => (this.sentinel = _));
        this.#activeModal.close(true);
    };

    decline = () => this.#activeModal.close(undefined);
    dismiss = () => this.#activeModal.close(undefined);

    parseCommand(data: SentinelCommandInstance) {
        const index = this.allCommands.findIndex((c) => c.key == data.key);
        if (index == -1) return new SentinelCommand();

        if (this.allCommands[index].options && (data?.options?.length ?? 0) > 0) {
            this.allCommands[index].options!.forEach((opt) => {
                const match = data.options!.find((o: SentinelOptionInstance) => o.key == opt.key);
                if (match) opt.value = match.value;
            });
        }
        return this.allCommands[index];
    }
}
