import { ALL_TRIGGERS, MODEL_BASED_TRIGGERS, ObserverTrigger } from '@enums/observer-trigger';
import { SentinelOptionFieldType } from './sentinel-option-field-type.model';
import { SentinelOptionField, SentinelOptionInstance } from './sentinel-condition-option-field.model';
import { SentinelConditionInstance } from './sentinel-condition.model';

export interface SentinelCommandInstance {
    key: string;
    options?: SentinelOptionInstance[];
    conditions?: SentinelConditionInstance[][];
    actions?: SentinelCommandInstance[];
}

export class SentinelCommand {
    label: string = '';
    key: string = '';
    allowedTriggerTypes: ObserverTrigger[] = [];
    options?: SentinelOptionField[];
    hasNestedConditions?: boolean;
    hasNestedActions?: boolean;
}

export const CHAT_POST_COMMAND_KEYS = ['mattermost_post', 'slack_post'];

function chatPostCommand(label: string, key: string): SentinelCommand {
    return {
        label,
        key,
        allowedTriggerTypes: ALL_TRIGGERS,
        options: [
            {
                key: 'channel_id',
                label: 'Channel ID',
                type: SentinelOptionFieldType.String,
                default: '',
            },
            {
                key: 'message',
                label: 'Message',
                type: SentinelOptionFieldType.String,
                default: '',
            },
        ],
    };
}

export const SENTINEL_COMMANDS: SentinelCommand[] = [
    {
        label: 'None',
        key: 'none',
        allowedTriggerTypes: ALL_TRIGGERS,
    },
    chatPostCommand('Mattermost Post', 'mattermost_post'),
    chatPostCommand('Slack Post', 'slack_post'),
    {
        label: 'Setting Value',
        key: 'set_value',
        allowedTriggerTypes: MODEL_BASED_TRIGGERS,
        options: [
            {
                key: 'column',
                label: 'Column',
                type: SentinelOptionFieldType.Column,
                default: '1',
            },
            {
                key: 'input',
                label: 'Value',
                type: SentinelOptionFieldType.String,
                default: '',
            },
        ],
    },
    {
        label: 'For Each',
        key: 'for_each',
        allowedTriggerTypes: MODEL_BASED_TRIGGERS,
        hasNestedConditions: true,
        hasNestedActions: true,
        options: [
            {
                key: 'relation',
                label: 'Iterate Over',
                type: SentinelOptionFieldType.Relation,
                default: '',
                placeholder: 'assignees or assignedContacts()',
            },
            {
                key: 'variable',
                label: 'Variable Name',
                type: SentinelOptionFieldType.String,
                default: 'item',
                placeholder: 'item',
            },
        ],
    },
    {
        label: 'Create New',
        key: 'create_new',
        allowedTriggerTypes: MODEL_BASED_TRIGGERS,
        options: [
            {
                key: 'table',
                label: 'Model',
                type: SentinelOptionFieldType.Table,
                default: '',
            },
            {
                key: 'fields',
                label: 'Fields',
                type: SentinelOptionFieldType.ModelFields,
                default: '{}',
            },
        ],
    },
];
