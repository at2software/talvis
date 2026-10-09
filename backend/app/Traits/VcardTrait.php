<?php

namespace App\Traits;

use App\Models\Vcard;

trait VcardTrait {
    private ?Vcard $_cached_vcard = null;

    public function setVcardAttribute(Vcard|string $value, $preservePhotos = true) {
        $vcard = ($value instanceof Vcard) ? $value : new Vcard($value);

        if ($preservePhotos && isset($this->attributes['vcard'])) {
            $oldVcard = new Vcard($this->attributes['vcard']);
            foreach ($oldVcard->getRows() as $row) {
                if ($row->getName() === 'PHOTO') {
                    $vcard->addRow($row);
                }
            }
        }

        $this->attributes['vcard'] = $vcard->toVCardString(false);
        $this->_cached_vcard       = $vcard;
    }
    public function getVcardAttribute($value = null): Vcard {
        if ($this->_cached_vcard !== null) {
            return $this->_cached_vcard;
        }

        return $this->_cached_vcard = new Vcard($this->attributes['vcard'] ?? '');
    }
    public function getNameAttribute() {
        return $this->vcard->getFirstValue('FN', 'unknown name');
    }
    public function getEmailAttribute(): ?string {
        return $this->vcard->getFirstValue('EMAIL');
    }
    public function setPhoto(string $filePath) {
        $size = getimagesize($filePath);
        $file = file_get_contents($filePath);
        if (! $file) {
            abort(422, 'error creating image');
        }

        $vcard = $this->vcard;

        $vcard->remove('PHOTO');

        $vcard->setProperty('PHOTO', base64_encode($file), [
            'ENCODING' => 'b',
            'TYPE'     => $size['mime'],
        ]);

        $this->setVcardAttribute($vcard, false);
        $this->save();
        return $this;
    }

    // Deprecated - use $model->vcard->getAddressBookOnly() instead
    public function _getAddressBookVcard(): string {
        return $this->vcard->getAddressBookOnly();
    }

    // Deprecated - use $model->vcard->toCardArray($model) instead
    public function getAddressBookVcard(): array {
        return $this->vcard->toCardArray($this);
    }

    // Deprecated - use $model->vcard->compact()->toCardArray($model) instead
    public function getCompactVcard(): array {
        return $this->vcard->compact()->toCardArray($this);
    }
    public function image() {
        return $this->vcard->getPhotoResponse();
    }

    /**
     * Normalize phone number to ISO format: +COUNTRY CITY PHONE_NUMBER
     * Removes city zero when country prefix is present
     * Prepends country code if missing
     *
     * Examples:
     * - "+49 (0)541 987712" -> "+49 541 987712"
     * - "+49 054 4198 7712" -> "+49 54 4198 7712"
     * - "0541 987712" (DE) -> "+49 541 987712"
     * - "0172-4055066" (DE) -> "+49 172 4055066"
     *
     * @param string $phoneNumber Raw phone number
     * @param string $countryContext ISO country code (e.g., 'DE', 'AT', 'CH')
     * @return string Normalized phone number
     */
    public static function normalizePhoneNumber(string $phoneNumber, string $countryContext = 'DE'): string {
        $phone = trim($phoneNumber);

        $phone = preg_replace('/[^\d+\-]/', '', $phone);

        if (! preg_match('/^\+/', $phone)) {
            $countryMap     = config('phone-countries.country_codes', []);
            $defaultCountry = config('phone-countries.default_country', 'DE');
            $countryCode    = $countryMap[$countryContext] ?? $countryMap[$defaultCountry] ?? '+49';

            if (preg_match('/^0(\d+)$/', $phone, $matches)) {
                $phone = $countryCode.$matches[1];
            } else {
                $phone = $countryCode.$phone;
            }
        }

        // Remove (0) patterns: +49(0)541 -> +49541
        $phone = preg_replace('/\+(\d+)\(0\)/', '+$1', $phoneNumber);

        // Remove leading zero after country code: +49 0541 -> +49 541
        $phone = preg_replace('/\+(\d{1,4})\s*0(\d)/', '+$1 $2', $phone);

        if (preg_match('/^\+(\d{1,4})(.*)$/', $phone, $matches)) {
            $countryCode = $matches[1];
            $rest        = $matches[2];

            $rest = preg_replace('/[^\d\-]/', '', $rest);

            if ($countryCode === '49') {
                $digits = preg_replace('/[^\d]/', '', $rest);

                if (strlen($digits) >= 6) {
                    if (in_array(substr($digits, 0, 3), ['030', '040', '069', '089', '221', '211', '228', '231', '241', '228', '251', '261', '271', '281', '511', '611', '711', '811', '911'])) {
                        $cityCode    = substr($digits, 0, 3);
                        $localNumber = substr($digits, 3);
                    } elseif (strlen($digits) >= 9) {
                        $cityCode    = substr($digits, 0, 4);
                        $localNumber = substr($digits, 4);
                    } elseif (in_array(substr($digits, 0, 2), ['30', '40', '69', '89'])) {
                        $cityCode    = substr($digits, 0, 2);
                        $localNumber = substr($digits, 2);
                    } else {
                        $cityCode    = substr($digits, 0, 3);
                        $localNumber = substr($digits, 3);
                    }
                    return "+$countryCode $cityCode $localNumber";
                }
            }

            $digits = preg_replace('/[^\d]/', '', $rest);
            if (strlen($digits) > 0) {
                return "+$countryCode $digits";
            }
        }

        return trim($phone);
    }
}
