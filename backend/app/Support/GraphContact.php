<?php

namespace App\Support;

use Sabre\VObject\Component\VCard;
use Sabre\VObject\Property;
use Sabre\VObject\Reader;

/**
 * @see https://learn.microsoft.com/en-us/graph/api/resources/contact
 */
final class GraphContact {
    private const MAX_EMAILS = 3;
    private const MAX_PHONES = 2;

    public static function fromVCard(string $vcard): ?array {
        try {
            $card = Reader::read($vcard);
        } catch (\Throwable $e) {
            return null;
        }
        if (! $card instanceof VCard) {
            return null;
        }

        [$surname, $givenName, $middleName, $title] = array_pad(isset($card->N) ? $card->N->getParts() : [], 4, '');
        [$company, $department]                     = array_pad(isset($card->ORG) ? $card->ORG->getParts() : [], 2, '');
        $displayName                                = trim((string)$card->FN) ?: trim("$givenName $surname") ?: trim($company);
        if ($displayName === '') {
            return null;
        }

        $phones = ['mobilePhone' => null, 'businessPhones' => [], 'homePhones' => []];
        foreach ($card->select('TEL') as $tel) {
            $number = trim((string)$tel);
            match (true) {
                $number === ''                                          => null,
                self::hasType($tel, 'cell') && ! $phones['mobilePhone'] => $phones['mobilePhone']      = $number,
                self::hasType($tel, 'home')                             => $phones['homePhones'][]     = $number,
                default                                                 => $phones['businessPhones'][] = $number,
            };
        }

        $addresses = [];
        foreach ($card->select('ADR') as $adr) {
            $key = self::hasType($adr, 'home') ? 'homeAddress' : 'businessAddress';
            if (! isset($addresses[$key])) {
                [, , $street, $city, $state, $postalCode, $country] = array_pad($adr->getParts(), 7, '');
                $addresses[$key]                                    = array_filter(compact('street', 'city', 'state', 'postalCode') + ['countryOrRegion' => $country]);
            }
        }

        $emails = [];
        foreach ($card->select('EMAIL') as $email) {
            if (trim((string)$email) !== '' && count($emails) < self::MAX_EMAILS) {
                $emails[] = ['address' => trim((string)$email), 'name' => $displayName];
            }
        }

        $birthday = isset($card->BDAY) && preg_match('/^(\d{4})-?(\d{2})-?(\d{2})/', (string)$card->BDAY, $date) ? "$date[1]-$date[2]-$date[3]" : null;

        return array_filter([
            'displayName'      => $displayName,
            'givenName'        => $givenName,
            'middleName'       => $middleName,
            'surname'          => $surname,
            'title'            => $title,
            'companyName'      => $company,
            'department'       => $department,
            'jobTitle'         => trim((string)$card->TITLE),
            'emailAddresses'   => $emails,
            'mobilePhone'      => $phones['mobilePhone'],
            'businessPhones'   => array_slice(array_values(array_unique($phones['businessPhones'])), 0, self::MAX_PHONES),
            'homePhones'       => array_slice(array_values(array_unique($phones['homePhones'])), 0, self::MAX_PHONES),
            'businessHomePage' => trim((string)$card->URL),
            'birthday'         => $birthday ? $birthday.'T00:00:00Z' : null,
            'personalNotes'    => trim((string)$card->NOTE),
            ...$addresses,
        ], fn ($value) => $value !== null && $value !== '' && $value !== []);
    }
    private static function hasType(Property $property, string $type): bool {
        $types = isset($property['TYPE']) ? array_map('strtolower', $property['TYPE']->getParts()) : [];
        return in_array($type, $types, true);
    }
}
