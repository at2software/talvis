<?php

namespace App\Models;

use App\Builders\CompanyContactBuilder;
use App\Traits\HasI18nTrait;
use App\Traits\VcardTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class CompanyContact extends BaseModel {
    use HasFactory;
    use HasI18nTrait;
    use VcardTrait { _getAddressBookVcard as protected trait_getAddressBookVcard; }

    public function _getAddressBookVcard() {
        return Vcard::fromStrings(
            $this->vcard->cleaned(),
            $this->company?->vcard->cleaned(),
            $this->contact?->vcard->cleaned()
        )->cleaned();
    }

    protected $fillable = ['vcard', 'created_at', 'updated_at', 'company_id', 'contact_id', 'flags', 'is_retired', 'is_favorite', 'is_invoicing_address'];
    protected $touches  = ['company', 'contact'];
    protected $appends  = ['gender', 'class', 'path'];

    protected function casts(): array {
        return ['is_retired' => 'boolean', 'is_favorite' => 'boolean', 'is_invoicing_address' => 'boolean'];
    }
    public function getIconAttribute() {
        return 'companies/'.$this->company_id.'/icon?'.($this->updated_at ? $this->updated_at->timestamp : '');
    }
    public function company() {
        return $this->belongsTo(Company::class);
    }
    public function contact() {
        return $this->belongsTo(Contact::class);
    }
    public function projects() {
        return $this->morphedByMany(Project::class, 'parent', 'assignments', 'assignee_id');
    }
    public function activeProjects() {
        return $this->projects()->whereProgress(ProjectState::Running);
    }
    public function gatheredContact($key, $attr) {
        if (! isset($attr->$key)) {
            return [];
        }
        $ret = [];
        foreach ($attr->$key as $cat => $arr) {
            foreach ($arr as $val) {
                $ret[] = [$cat, $val];
            }
        }
        return $ret;
    }
    public function getLetterHead() {
        $ADR    = $this->vcard->getFirstAttr('ADR', []);
        $values = $this->vcard->getFirstAttr('N', ['', '', '', '', '']);
        $az3    = trim(implode(' ', [
            $values[3] ?? '', // Title
            $values[2] ?? '', // Additional
            $values[0] ?? '', // Family
            $values[4] ?? '',  // Suffix
        ]));
        $az4 = ($ADR[2] ?? '').(strlen($ADR[1] ?? '') ? ' // '.($ADR[1] ?? '') : '');
        $az5 = ($ADR[4] ?? '').' '.($ADR[5] ?? '');
        if (strtoupper($ADR[6] ?? '') != 'DE') {
            $az5 = strtoupper($az5);
        }  // Foreign cities should be in UPPERCASE and in the local language
        $az6                                      = (strtoupper($ADR[6] ?? '') != 'DE') ? ($ADR[6] ?? '') : '';
        $code                                     = [];
        ! strlen($this->company->name) || $code[] = $this->company->name;            // 1. AZ – Firma (= Name des Unternehmens)
        ! strlen($this->title) || $code[]         = $this->title;              // 2. AZ – Anrede, ggf. Berufs- oder Amtsbezeichnungen
        ! strlen($az3) || $code[]                 = $az3;                      // 3. AZ – ggf. akademische Grade (z. B. Dr., Dipl.-Ing., Dipl.-Hdl.), Name
        ! strlen($ADR[2]) || $code[]              = $ADR[2];   // 4. AZ – Straße/Hausnummer (ggf. // App.-Nr.) oder Postfach
        ! strlen($ADR[1]) || $code[]              = $ADR[1];  // 4. AZ – Thomas Otto Override: App-Nr bekommt ne eigene Zeile!
        ! strlen($az5) || $code[]                 = $az5;                      // 5. AZ – Postleitzahl und Bestimmungsort
        ! strlen($az6) || $code[]                 = $az6;                      // 6. AZ – (LAND)
        while (count($code) < 8) {
            array_unshift($code, '&nbsp;');
        }      // always 8 lines high
        array_unshift($code, '&nbsp;');
        $code[] = '&nbsp;';
        return implode('<br />', $code);
    }

    public function getGenderAttribute(): ?string {
        return $this->contact->gender;
    }
    public function getSalutationAttribute(): string {
        $lang   = $this->getLanguage();
        $gender = $this->contact->gender;
        if ($lang === 'en') {
            return match ($gender) {
                'M'     => 'Mr.',
                'F'     => 'Mrs.',
                default => '',
            };
        }
        return match ($gender) {
            'M'     => 'Herr',
            'F'     => 'Frau',
            default => '',
        };
    }
    public function is_male(): bool {
        return $this->contact->is_male();
    }
    public function salutationReplacements() {
        $n = $this->contact->vcard->getFirstAttr('N', ['', '', '', '', '']);
        return [
            'familyName'     => $n[0],
            'firstName'      => $n[1],
            'middleName'     => $n[2],
            'prefix'         => $n[3],
            'suffix'         => $n[4],
            'salutation'     => strlen($n[3]) ? $n[3] : $this->salutation,
            'fullSalutation' => (strlen($n[3]) ? $n[3] : $this->salutation).' '.$n[1].' '.$n[0],
        ];
    }
    public function getLanguage(): string {
        return $this->company?->vcard?->getFirstValue('X-LANG') ?? 'de';
    }
    public function getFormality(): string {
        return $this->company?->vcard?->getFirstValue('X-FORMALITY') ?? 'formal';
    }
    public function newEloquentBuilder($query) {
        return new CompanyContactBuilder($query);
    }
}
