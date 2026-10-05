<?php

namespace App\Traits;

use App\Models\I18n;
use Illuminate\Database\Eloquent\Relations\MorphMany;

trait HasI18nTrait {
    public static function bootHasI18nTrait(): void {
        static::created(function ($model) {
            if (! empty($model->__pendingI18n)) {
                foreach ($model->__pendingI18n as $key => $value) {
                    $variants            = is_array($value) && isset($value[0]) ? $value : [$value];
                    $isFirstLocalization = true;

                    foreach ($variants as $variant) {
                        if (! isset($variant['language']) || ! isset($variant['text'])) {
                            continue;
                        }

                        if ($isFirstLocalization && count($variants) === 1) {
                            $allVariants = [
                                ['language' => 'de', 'formality' => 'formal'],
                                ['language' => 'de', 'formality' => 'informal'],
                                ['language' => 'en', 'formality' => 'formal'],
                                ['language' => 'en', 'formality' => 'informal'],
                            ];
                            foreach ($allVariants as $v) {
                                I18n::create([
                                    'parent_type' => $model::class,
                                    'parent_id'   => $model->getKey(),
                                    'language'    => $v['language'],
                                    'formality'   => $v['formality'],
                                    'text'        => $variant['text'],
                                ]);
                            }
                        } else {
                            I18n::create([
                                'parent_type' => $model::class,
                                'parent_id'   => $model->getKey(),
                                'language'    => $variant['language'],
                                'formality'   => $variant['formality'] ?? 'formal',
                                'text'        => $variant['text'],
                            ]);
                        }
                        $isFirstLocalization = false;
                    }
                }
                $model->__pendingI18n = [];
            }
        });
    }
    public function i18n(): MorphMany {
        return $this->morphMany(I18n::class, 'parent');
    }
    public function getI18n(?string $language = null, ?string $formality = null): ?I18n {
        return $this->i18n()
            ->when($language, fn ($q) => $q->where('language', $language))
            ->when($formality, fn ($q) => $q->where('formality', $formality))
            ->first();
    }
    public function getI18nText(?string $language = null, ?string $formality = null): ?string {
        return $this->getI18n($language, $formality)?->text;
    }
    public function setI18n(string $language, ?string $formality, string $text): I18n {
        return $this->i18n()->updateOrCreate(
            [
                'language'  => $language,
                'formality' => $formality,
            ],
            [
                'text' => $text,
            ]
        );
    }
    public function getLanguage(): string {
        return $this->vcard?->getFirstValue('X-LANG') ?? 'de';
    }
    public function getFormality(): string {
        return $this->vcard?->getFirstValue('X-FORMALITY') ?? 'formal';
    }
    public static function resolveI18nValue(mixed $value, string $language = 'de', string $formality = 'formal'): ?string {
        if (is_string($value)) {
            return $value;
        }

        if (is_array($value)) {
            foreach ($value as $variant) {
                if (isset($variant['language'], $variant['formality'], $variant['text'])
                    && $variant['language'] === $language
                    && $variant['formality'] === $formality) {
                    return $variant['text'];
                }
            }

            foreach ($value as $variant) {
                if (isset($variant['language'], $variant['text']) && $variant['language'] === $language) {
                    return $variant['text'];
                }
            }

            foreach ($value as $variant) {
                if (isset($variant['text']) && ! empty($variant['text'])) {
                    return $variant['text'];
                }
            }
        }
        return null;
    }
}
