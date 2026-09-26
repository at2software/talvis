<?php

namespace App\Models;

use App\Builders\ContactBuilder;
use App\Traits\HasI18nTrait;
use App\Traits\VcardGenderTrait;
use App\Traits\VcardTrait;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Contact extends BaseModel {
    use HasFactory;
    use HasI18nTrait;
    use VcardGenderTrait;
    use VcardTrait;

    protected $fillable = ['vcard', 'created_at', 'updated_at', 'flags'];
    protected $touches  = [];
    protected $appends  = ['gender', 'class', 'path', 'icon'];

    public function companyContacts() {
        return $this->hasMany(CompanyContact::class);
    }
    public function activeCompanyContacts() {
        return $this->hasMany(CompanyContact::class)->where('is_retired', false);
    }
    public function companies() {
        return $this->belongsToMany(Company::class, CompanyContact::class, 'contact_id', 'company_id');
    }
    public function active_companies() {
        return $this->belongsToMany(Company::class, CompanyContact::class, 'contact_id', 'company_id')->where('is_deprecated', false);
    }
    public function assignments() {
        return $this->hasMany(Assignment::class)->with('assignee');
    }
    public function newEloquentBuilder($query) {
        return new ContactBuilder($query);
    }
    private function vcardWithout($_, ...$keys) {
        return preg_replace('/^('.implode('|', $keys).')(:|;).*$/im', '', $_);
    }
    public function toVCard() {
        $cards   = [];
        $cards[] = $this->vcardWithout($this->_getAddressBookVcard(), 'PHOTO');
        $acc     = $this->activeCompanyContacts()->with('company')->get()->filter();
        $acc->each(function ($_) use (&$cards) {
            $text    = $_->_getAddressBookVcard();
            $cards[] = $this->vcardWithout($text, 'PHOTO', 'FN', 'N');
        });
        foreach ($acc as $i => $cc) {
            $vcard = $cc->company?->_getAddressBookVcard();
            if ($vcard) {
                if ($i === 0) {
                    $cards[] = $this->vcardWithout($vcard, 'FN', 'N');
                } else {
                    $cards[] = $this->vcardWithout($vcard, 'PHOTO', 'FN', 'N');
                }
            }
        }
        return self::getMergedVcard($this, ...$cards);
    }
    private static function mergeSimilarVcards($vcardsString) {
        $vcardsArray  = preg_split('/\n(?=ADR)/', trim($vcardsString));
        $mergedVcards = [];

        foreach ($vcardsArray as $vcard) {
            $lines  = explode("\n", $vcard);
            $key    = '';
            $data   = [];
            $phones = [];
            $emails = [];

            foreach ($lines as $line) {
                if (strpos($line, 'ADR') !== false) {
                    $key .= $line;
                }

                if (strpos($line, 'TEL') !== false) {
                    $phones[] = $line;
                } elseif (strpos($line, 'EMAIL') !== false) {
                    $emails[] = $line;
                } else {
                    $data[] = $line;
                }
            }

            $key = hash('sha256', $key);

            if (! isset($mergedVcards[$key])) {
                $mergedVcards[$key] = ['data' => $data, 'phones' => $phones, 'emails' => $emails];
            } else {
                $mergedVcards[$key]['data']   = array_unique(array_merge($mergedVcards[$key]['data'], $data));
                $mergedVcards[$key]['phones'] = array_unique(array_merge($mergedVcards[$key]['phones'], $phones));
                $mergedVcards[$key]['emails'] = array_unique(array_merge($mergedVcards[$key]['emails'], $emails));
            }
        }

        $finalVcards = '';
        foreach ($mergedVcards as $vcard) {
            $lines = array_merge($vcard['data'], $vcard['phones'], $vcard['emails']);
            $finalVcards .= implode("\n", $lines)."\n\n";
        }
        return trim($finalVcards);
    }
    public static function getMergedVcard($reference, ...$data) {
        $text = implode("\n", $data);
        $text = preg_replace('/(^|\n)\s*\n/is', "\n", $text); // remove empty lines
        $text = preg_replace('/(^|\n)\s*\n$/is', '', $text); // remove potential empty line at the end of vcard
        $text = self::mergeSimilarVcards($text); // merge vcards with the same address

        $vcard = new Vcard($text);
        $text  = $vcard->forCardDAV()->toVCardString(false);

        $rev = Carbon::parse($reference->attributes['updated_at'])->format('YmdHis');
        // $rev = now()->toIso8601String();
        $vcard_content = "BEGIN:VCARD\n".
                        "VERSION:3.0\n".
                        'REV:'.$rev."Z\n".
                        $text.
                        "\nEND:VCARD\n";

        $cardId = "$reference->class-$reference->id";
        $etag   = $cardId.'_'.$rev;

        $card = [
            'id'            => $cardId,
            'addressbookid' => $cardId,
            'carddata'      => $vcard_content,
            'uri'           => "$etag.vcf",
            'etag'          => $etag,
            'size'          => strlen($vcard_content),
        ];
        return $card;
    }
}
