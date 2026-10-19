<?php

namespace App\Flow;

use InvalidArgumentException;

final class JobInputSchema {
    public const FIELD_RULES = [
        'string' => ['string', 'max:255'],
        'text'   => ['string', 'max:65535'],
        'url'    => ['url:http,https', 'max:2048'],
        'list'   => ['array', 'list'],
        'object' => ['array'],
    ];
    public const ITEM_TYPES = ['string', 'text', 'url'];

    public static function validateSchema(mixed $schema): void {
        $fields = is_array($schema) ? ($schema['fields'] ?? null) : null;
        if (! is_array($fields) || ! array_is_list($fields) || $fields === []) {
            throw new InvalidArgumentException('A job input schema needs a non-empty "fields" list.');
        }
        $keys = self::validateFields($fields, array_keys(self::FIELD_RULES), 'job input field');
        foreach ($fields as $field) {
            $other = $field['required_without'] ?? null;
            if ($other !== null && (! in_array($other, $keys, true) || $other === $field['key'])) {
                throw new InvalidArgumentException("Job input field \"{$field['key']}\" is required_without an unknown field.");
            }
            if (isset($field['fields'])) {
                if ($field['type'] !== 'list' || ! is_array($field['fields']) || ! array_is_list($field['fields']) || $field['fields'] === []) {
                    throw new InvalidArgumentException("Job input field \"{$field['key']}\": only a list can have item \"fields\", and they must be a non-empty list.");
                }
                self::validateFields($field['fields'], self::ITEM_TYPES, "item field of \"{$field['key']}\"");
            }
        }
    }
    public static function rules(array $schema, string $prefix = 'input'): array {
        $rules = [$prefix => ['present', 'array']];
        foreach ($schema['fields'] as $field) {
            $path         = "{$prefix}.{$field['key']}";
            $rules[$path] = [...self::presence($field, $prefix), ...self::FIELD_RULES[$field['type']]];
            if ($field['type'] === 'list' && isset($field['fields'])) {
                $rules["{$path}.*"] = ['array:'.implode(',', array_column($field['fields'], 'key'))];
                foreach ($field['fields'] as $item) {
                    $rules["{$path}.*.{$item['key']}"] = [($item['required'] ?? false) ? 'required' : 'nullable', ...self::FIELD_RULES[$item['type']]];
                }
            } elseif ($field['type'] === 'list') {
                $rules["{$path}.*"] = ['string', 'max:2048'];
            }
        }
        return $rules;
    }
    private static function validateFields(array $fields, array $types, string $label): array {
        $keys = [];
        foreach ($fields as $field) {
            $key = $field['key'] ?? null;
            if (! is_string($key) || ! preg_match('/^[a-z][a-z0-9_]*$/', $key)) {
                throw new InvalidArgumentException("Every {$label} needs a snake_case \"key\".");
            }
            if (! in_array($field['type'] ?? null, $types, true)) {
                throw new InvalidArgumentException(ucfirst($label)." \"{$key}\" has an unknown type; allowed: ".implode(', ', $types).'.');
            }
            if (in_array($key, $keys, true)) {
                throw new InvalidArgumentException(ucfirst($label)." \"{$key}\" is defined twice.");
            }
            $keys[] = $key;
        }
        return $keys;
    }
    private static function presence(array $field, string $prefix): array {
        return match (true) {
            $field['required'] ?? false            => ['required'],
            isset($field['required_without'])      => ["required_without:{$prefix}.{$field['required_without']}", 'nullable'],
            default                                => ['nullable'],
        };
    }
}
