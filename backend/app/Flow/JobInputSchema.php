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

    public static function validateSchema(mixed $schema): void {
        $fields = is_array($schema) ? ($schema['fields'] ?? null) : null;
        if (! is_array($fields) || ! array_is_list($fields) || $fields === []) {
            throw new InvalidArgumentException('A job input schema needs a non-empty "fields" list.');
        }
        $keys = [];
        foreach ($fields as $field) {
            $key = $field['key'] ?? null;
            if (! is_string($key) || ! preg_match('/^[a-z][a-z0-9_]*$/', $key)) {
                throw new InvalidArgumentException('Every job input field needs a snake_case "key".');
            }
            if (! array_key_exists($field['type'] ?? null, self::FIELD_RULES)) {
                throw new InvalidArgumentException("Job input field \"{$key}\" has an unknown type; allowed: ".implode(', ', array_keys(self::FIELD_RULES)).'.');
            }
            if (in_array($key, $keys, true)) {
                throw new InvalidArgumentException("Job input field \"{$key}\" is defined twice.");
            }
            $keys[] = $key;
        }
    }
    public static function rules(array $schema, string $prefix = 'input'): array {
        $rules = [$prefix => ['present', 'array']];
        foreach ($schema['fields'] as $field) {
            $rules["{$prefix}.{$field['key']}"] = [($field['required'] ?? false) ? 'required' : 'nullable', ...self::FIELD_RULES[$field['type']]];
            if ($field['type'] === 'list') {
                $rules["{$prefix}.{$field['key']}.*"] = ['string', 'max:2048'];
            }
        }
        return $rules;
    }
}
