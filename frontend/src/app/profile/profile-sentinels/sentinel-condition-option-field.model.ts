import { SentinelOptionFieldType } from './sentinel-option-field-type.model';

export interface SentinelOptionInstance {
    key: string;
    value?: string;
}

export interface SentinelOptionField {
    key: string;
    label?: string;
    value?: string | boolean | number;
    type: SentinelOptionFieldType;
    default?: string | boolean | number;
    placeholder?: string;
    enumValues?: { label: string; value: string }[];
    hint?: string;
    examples?: { label: string; code: string }[];
}
