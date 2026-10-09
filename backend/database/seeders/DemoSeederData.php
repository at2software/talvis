<?php

namespace Database\Seeders;

use App\Enums\InvoiceItemType;

class DemoSeederData {
    public const PASSWORD = 'Talvis2026!';

    public static function company(): array {
        return [
            'name'       => 'Nordlicht Software',
            'legal_form' => 'GmbH',
            'owners'     => 'Jana Albrecht',
            'street'     => 'Stresemannstraße 29',
            'zip'        => '22769',
            'city'       => 'Hamburg',
            'country'    => 'DE',
            'url'        => 'https://www.nordlicht-software.example.com',
            'email'      => 'info@nordlicht-software.example.com',
            'phone'      => '+49 40 80903310',
            'iban'       => 'DE89370400440532013000',
            'bic'        => 'COBADEFFXXX',
            'tax_id'     => '43/123/45678',
            'vat_id'     => 'DE298765432',
        ];
    }
    public static function params(): array {
        return [
            'SYS_LANGUAGE'               => 'de',
            'SYS_COUNTRY'                => 'DE',
            'SYS_CURRENCY'               => 'EUR',
            'INVOICE_DEFAULT_VAT'        => 19,
            'INVOICE_PAYMENT_DURATION'   => 14,
            'INVOICE_HOURLY_WAGE'        => 105,
            'INVOICE_HPD'                => 8,
            'INVOICE_GRACE_PERIOD'       => 7,
            'INVOICE_REMINDER_FEE'       => 5,
            'INVOICE_OVERDRAFT_INTEREST' => 9,
            'INVOICE_NO_PREFIX'          => 'RE-',
            'INVOICE_NO_DIGITS'          => 5,
            'INVOICE_NO_CURRENT'         => 1,
            'QUOTE_NO_PREFIX'            => 'AN-',
            'QUOTE_NO_DIGITS'            => 5,
            'QUOTE_NO_CURRENT'           => 1,
            'CUSTOMER_NUMBER_PREFIX'     => 'K',
            'CUSTOMER_NUMBER_CURRENT'    => 10001,
            'HR_HPD'                     => 8,
        ];
    }

    /** @return array<string, array{first: string, family: string, email: string, roles: string[], type: string, hours: array<string, float>, hired: int, zip: string, title: string, phone: string, color: string, orga: float}> */
    public static function users(): array {
        $fullTime = ['mo' => 8, 'tu' => 8, 'we' => 8, 'th' => 8, 'fr' => 8, 'sa' => 0, 'su' => 0];
        return [
            'owner'  => ['first' => 'Jana', 'family' => 'Albrecht', 'email' => 'owner@demo.test', 'roles' => ['admin'], 'type' => 'Inhaber', 'hours' => $fullTime, 'hired' => 0, 'zip' => '22769', 'title' => 'Geschäftsführerin', 'phone' => '+49 170 4410021', 'color' => '#00C9A7', 'orga' => 0.45],
            'pm'     => ['first' => 'Markus', 'family' => 'Lindner', 'email' => 'markus.lindner@demo.test', 'roles' => ['project_manager', 'invoicing', 'hr'], 'type' => 'Festanstellung', 'hours' => $fullTime, 'hired' => 0, 'zip' => '22303', 'title' => 'Projektleiter', 'phone' => '+49 171 2290415', 'color' => '#135BCD', 'orga' => 0.3],
            'lea'    => ['first' => 'Lea', 'family' => 'Vogt', 'email' => 'lea.vogt@demo.test', 'roles' => ['user'], 'type' => 'Festanstellung', 'hours' => $fullTime, 'hired' => 3, 'zip' => '22085', 'title' => 'Full-Stack-Entwicklerin', 'phone' => '+49 152 33871904', 'color' => '#F2A900', 'orga' => 0.1],
            'tim'    => ['first' => 'Tim', 'family' => 'Kaiser', 'email' => 'tim.kaiser@demo.test', 'roles' => ['user'], 'type' => 'Teilzeit', 'hours' => ['mo' => 7.5, 'tu' => 7.5, 'we' => 7.5, 'th' => 7.5, 'fr' => 0, 'sa' => 0, 'su' => 0], 'hired' => 11, 'zip' => '21029', 'title' => 'Backend-Entwickler', 'phone' => '+49 160 99018273', 'color' => '#7B0DCF', 'orga' => 0.1],
            'sophie' => ['first' => 'Sophie', 'family' => 'Lang', 'email' => 'sophie.lang@demo.test', 'roles' => ['user', 'marketing'], 'type' => 'Teilzeit', 'hours' => ['mo' => 5, 'tu' => 5, 'we' => 5, 'th' => 5, 'fr' => 0, 'sa' => 0, 'su' => 0], 'hired' => 19, 'zip' => '22301', 'title' => 'UX-Designerin & Marketing', 'phone' => '+49 151 40028816', 'color' => '#E8576D', 'orga' => 0.25],
        ];
    }

    public static function orgaTopics(): array {
        return ['Teammeeting', 'Angebotserstellung', 'Akquise', 'Buchhaltung', 'Weiterbildung', 'Interne Tools', 'Recruiting', 'Kundentermin Vorbereitung'];
    }
    public static function productGroups(): array {
        return [
            'consulting' => ['name' => 'Beratung', 'color' => '#135BCD'],
            'dev'        => ['name' => 'Entwicklung', 'color' => '#00C9A7'],
            'design'     => ['name' => 'Design', 'color' => '#E8576D'],
            'ops'        => ['name' => 'Betrieb & Support', 'color' => '#F2A900'],
        ];
    }

    /** @return array<string, array{group: string, name: string, number: string, price: float, unit: string, type?: InvoiceItemType}> */
    public static function products(): array {
        return [
            'consulting' => ['group' => 'consulting', 'name' => 'Beratung & Konzeption', 'number' => 'B-100', 'price' => 120, 'unit' => 'h'],
            'workshop'   => ['group' => 'consulting', 'name' => 'Workshop (Tagessatz)', 'number' => 'B-110', 'price' => 1150, 'unit' => 'PT'],
            'web'        => ['group' => 'dev', 'name' => 'Webentwicklung', 'number' => 'E-200', 'price' => 105, 'unit' => 'h'],
            'app'        => ['group' => 'dev', 'name' => 'App-Entwicklung', 'number' => 'E-210', 'price' => 110, 'unit' => 'h'],
            'api'        => ['group' => 'dev', 'name' => 'Schnittstellenentwicklung', 'number' => 'E-220', 'price' => 840, 'unit' => 'PT'],
            'design'     => ['group' => 'design', 'name' => 'UI/UX-Design', 'number' => 'D-300', 'price' => 95, 'unit' => 'h'],
            'support'    => ['group' => 'ops', 'name' => 'Support & Wartung', 'number' => 'S-400', 'price' => 95, 'unit' => 'h'],
            'hosting'    => ['group' => 'ops', 'name' => 'Hosting & Wartung (quartalsweise)', 'number' => 'S-410', 'price' => 447, 'unit' => 'Quartal', 'type' => InvoiceItemType::Quarterly],
        ];
    }

    /** @return array<string, array{name: string, weight: int, hosting: bool, items: array{string, int, int, string}[]}> */
    public static function projectTypes(): array {
        return [
            'website' => ['name' => 'Website-Relaunch', 'weight' => 25, 'hosting' => true, 'items' => [
                ['workshop', 1, 2, 'Kick-off-Workshop & Zieldefinition'],
                ['design', 16, 40, 'Screendesign Desktop & Mobil'],
                ['web', 40, 100, 'Frontend-Entwicklung'],
                ['web', 16, 40, 'CMS-Einrichtung & Inhaltsmigration'],
                ['consulting', 4, 10, 'Projektmanagement & Go-Live'],
            ]],
            'portal' => ['name' => 'Kundenportal', 'weight' => 15, 'hosting' => true, 'items' => [
                ['consulting', 12, 24, 'Anforderungsanalyse & Konzeption'],
                ['design', 24, 48, 'UX-Konzept & Screendesign'],
                ['web', 80, 180, 'Portal-Entwicklung'],
                ['api', 3, 8, 'Schnittstelle ERP'],
                ['web', 16, 32, 'Testing & Go-Live'],
            ]],
            'app' => ['name' => 'Mobile App', 'weight' => 10, 'hosting' => false, 'items' => [
                ['consulting', 12, 24, 'Konzeption & User Stories'],
                ['design', 32, 60, 'App-Design'],
                ['app', 120, 260, 'App-Entwicklung iOS/Android'],
                ['web', 24, 48, 'Backend-API'],
                ['app', 16, 24, 'Store-Veröffentlichung & Testing'],
            ]],
            'integration' => ['name' => 'ERP-Schnittstelle', 'weight' => 15, 'hosting' => false, 'items' => [
                ['consulting', 6, 12, 'Analyse der Datenflüsse'],
                ['api', 4, 12, 'Schnittstellenentwicklung'],
                ['web', 8, 16, 'Monitoring & Dokumentation'],
            ]],
            'consulting' => ['name' => 'Digitalisierungsberatung', 'weight' => 15, 'hosting' => false, 'items' => [
                ['workshop', 1, 3, 'Workshop Prozessaufnahme'],
                ['consulting', 16, 40, 'Konzept & Handlungsempfehlungen'],
            ]],
            'shop' => ['name' => 'Online-Shop', 'weight' => 10, 'hosting' => true, 'items' => [
                ['design', 24, 40, 'Shop-Design'],
                ['web', 60, 140, 'Shop-Entwicklung'],
                ['api', 2, 5, 'Anbindung Zahlungsanbieter'],
            ]],
            'support' => ['name' => 'Support-Kontingent', 'weight' => 10, 'hosting' => false, 'items' => [
                ['support', 10, 30, 'Support-Kontingent'],
            ]],
            'private' => ['name' => 'Website', 'weight' => 0, 'hosting' => false, 'items' => [
                ['design', 6, 12, 'Gestaltung'],
                ['web', 10, 24, 'Umsetzung & Einrichtung'],
            ]],
        ];
    }

    /** @return array{name: string, short: string, street: string, zip: string, city: string, area: string, domain: string, source: string, private?: bool, late?: bool, payment?: int}[] */
    public static function customers(): array {
        return [
            ['name' => 'Hansen Maschinenbau GmbH', 'short' => 'Hansen', 'street' => 'Werftstraße 21', 'zip' => '24143', 'city' => 'Kiel', 'area' => '0431', 'domain' => 'hansen-maschinenbau', 'source' => 'Referral'],
            ['name' => 'Petersen Logistik GmbH & Co. KG', 'short' => 'Petersen', 'street' => 'Am Hafen 7', 'zip' => '28217', 'city' => 'Bremen', 'area' => '0421', 'domain' => 'petersen-logistik', 'source' => 'Website', 'late' => true],
            ['name' => 'Weber Elektrotechnik GmbH', 'short' => 'Weber', 'street' => 'Industriering 12', 'zip' => '21079', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'weber-elektrotechnik', 'source' => 'LinkedIn'],
            ['name' => 'Stadtwerke Quickborn GmbH', 'short' => 'Stadtwerke Quickborn', 'street' => 'Rathausplatz 2', 'zip' => '25451', 'city' => 'Quickborn', 'area' => '04106', 'domain' => 'stadtwerke-quickborn', 'source' => 'Event', 'payment' => 30],
            ['name' => 'Thomas Behrens', 'short' => 'Behrens', 'street' => 'Bergstedter Chaussee 88', 'zip' => '22395', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'behrens-privat', 'source' => 'Referral', 'private' => true],
            ['name' => 'Kanzlei Möller & Partner', 'short' => 'Möller', 'street' => 'Neuer Wall 54', 'zip' => '20354', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'kanzlei-moeller', 'source' => 'Referral'],
            ['name' => 'Fischer Feinkost GmbH', 'short' => 'Fischer', 'street' => 'Marktstraße 9', 'zip' => '23552', 'city' => 'Lübeck', 'area' => '0451', 'domain' => 'fischer-feinkost', 'source' => 'Website'],
            ['name' => 'Nordwind Reisen GmbH', 'short' => 'Nordwind', 'street' => 'Strandallee 41', 'zip' => '23669', 'city' => 'Timmendorfer Strand', 'area' => '04503', 'domain' => 'nordwind-reisen', 'source' => 'LinkedIn'],
            ['name' => 'Hoffmann Bau AG', 'short' => 'Hoffmann', 'street' => 'Gewerbepark 3', 'zip' => '30855', 'city' => 'Langenhagen', 'area' => '0511', 'domain' => 'hoffmann-bau', 'source' => 'Event', 'late' => true, 'payment' => 30],
            ['name' => 'Praxisklinik am Stadtpark MVZ GmbH', 'short' => 'Praxisklinik', 'street' => 'Hindenburgstraße 22', 'zip' => '22297', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'praxisklinik-stadtpark', 'source' => 'Website'],
            ['name' => 'Brauerei Lüneburger Heide GmbH', 'short' => 'Brauerei Lüneburg', 'street' => 'Am Sande 33', 'zip' => '21335', 'city' => 'Lüneburg', 'area' => '04131', 'domain' => 'brauerei-heide', 'source' => 'Referral'],
            ['name' => 'Sabine Hartmann', 'short' => 'Hartmann', 'street' => 'Lindenweg 4', 'zip' => '25421', 'city' => 'Pinneberg', 'area' => '04101', 'domain' => 'hartmann-privat', 'source' => 'Website', 'private' => true],
            ['name' => 'Schuster Immobilien GmbH', 'short' => 'Schuster', 'street' => 'Jungfernstieg 7', 'zip' => '20354', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'schuster-immobilien', 'source' => 'LinkedIn'],
            ['name' => 'Elbe Solartechnik GmbH', 'short' => 'Elbe Solar', 'street' => 'Moorfleeter Deich 4', 'zip' => '22113', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'elbe-solar', 'source' => 'Event'],
            ['name' => 'Kühn Sanitär & Heizung GmbH', 'short' => 'Kühn', 'street' => 'Bahnhofstraße 18', 'zip' => '25335', 'city' => 'Elmshorn', 'area' => '04121', 'domain' => 'kuehn-sanitaer', 'source' => 'Website'],
            ['name' => 'Meyer Werkzeugbau GmbH & Co. KG', 'short' => 'Meyer', 'street' => 'Hauptstraße 101', 'zip' => '21614', 'city' => 'Buxtehude', 'area' => '04161', 'domain' => 'meyer-werkzeugbau', 'source' => 'Referral'],
            ['name' => 'Autohaus Krüger GmbH', 'short' => 'Krüger', 'street' => 'Kieler Straße 250', 'zip' => '22525', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'autohaus-krueger', 'source' => 'Website'],
            ['name' => 'Wagner Medientechnik GmbH', 'short' => 'Wagner', 'street' => 'Schanzenstraße 75', 'zip' => '20357', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'wagner-medientechnik', 'source' => 'LinkedIn'],
            ['name' => 'Jörg Paulsen', 'short' => 'Paulsen', 'street' => 'Am Deich 17', 'zip' => '25813', 'city' => 'Husum', 'area' => '04841', 'domain' => 'paulsen-privat', 'source' => 'Other', 'private' => true],
            ['name' => 'Hanse Versicherungsmakler GmbH', 'short' => 'Hanse Versicherung', 'street' => 'Ballindamm 13', 'zip' => '20095', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'hanse-makler', 'source' => 'Referral'],
            ['name' => 'Becker Landtechnik GmbH', 'short' => 'Becker', 'street' => 'Dorfstraße 5', 'zip' => '24589', 'city' => 'Nortorf', 'area' => '04392', 'domain' => 'becker-landtechnik', 'source' => 'Event'],
            ['name' => 'Tischlerei Jansen GmbH', 'short' => 'Jansen', 'street' => 'Werkstraße 3', 'zip' => '25524', 'city' => 'Itzehoe', 'area' => '04821', 'domain' => 'tischlerei-jansen', 'source' => 'Website'],
            ['name' => 'Ostsee Ferienwohnungen GmbH', 'short' => 'Ostsee FeWo', 'street' => 'Seestraße 12', 'zip' => '18225', 'city' => 'Kühlungsborn', 'area' => '038293', 'domain' => 'ostsee-fewo', 'source' => 'LinkedIn'],
            ['name' => 'Lehmann Personalservice GmbH', 'short' => 'Lehmann', 'street' => 'Mönckebergstraße 11', 'zip' => '20095', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'lehmann-personal', 'source' => 'Website'],
            ['name' => 'Kraft Lebensmittelhandel GmbH', 'short' => 'Kraft', 'street' => 'Großmarkt 1', 'zip' => '20097', 'city' => 'Hamburg', 'area' => '040', 'domain' => 'kraft-lebensmittel', 'source' => 'Referral'],
        ];
    }

    public static function contactPositions(): array {
        return ['Geschäftsführung', 'IT-Leitung', 'Marketing', 'Einkauf', 'Projektleitung', 'Vertrieb'];
    }
    public static function companyNotes(): array {
        return [
            'Telefonat: Interesse an Folgeprojekt im nächsten Quartal.',
            'Rechnungsadresse geändert, bitte nur noch an die Buchhaltung senden.',
            'Ansprechpartner ist bis Ende des Monats im Urlaub.',
            'Jahresgespräch geführt, sehr zufrieden mit der Zusammenarbeit.',
            'Budgetfreigabe erfolgt immer erst nach Vorstandssitzung.',
            'Wünscht künftig Angebote mit Festpreis.',
            'Hat uns an einen Geschäftspartner weiterempfohlen.',
        ];
    }
    public static function projectNotes(): array {
        return [
            'Abstimmungstermin mit dem Kunden hat stattgefunden, Feedback eingearbeitet.',
            'Kunde liefert die Inhalte verspätet, Zeitplan leicht verschoben.',
            'Zwischenstand präsentiert, Kunde sehr zufrieden.',
            'Zusatzwunsch aufgenommen, wird separat angeboten.',
            'Testzugang für den Kunden eingerichtet.',
            'Technische Abnahme für nächste Woche vereinbart.',
            'Performance-Optimierung nach Lasttest notwendig.',
        ];
    }

    /** @return array{name: string, category: string, price: float, repeat: InvoiceItemType, match: string, months_ago?: int}[] */
    public static function expenses(): array {
        return [
            ['name' => 'Büromiete Stresemannstraße', 'category' => 'Office', 'price' => 1850, 'repeat' => InvoiceItemType::Monthly, 'match' => 'MIETE STRESEMANN'],
            ['name' => 'Microsoft 365 Business', 'category' => 'Software', 'price' => 96, 'repeat' => InvoiceItemType::Monthly, 'match' => 'MICROSOFT'],
            ['name' => 'Hetzner Cloud Server', 'category' => 'Software', 'price' => 142.8, 'repeat' => InvoiceItemType::Monthly, 'match' => 'HETZNER'],
            ['name' => 'JetBrains All Products Pack', 'category' => 'Software', 'price' => 1290, 'repeat' => InvoiceItemType::Yearly, 'match' => 'JETBRAINS'],
            ['name' => 'Figma Professional', 'category' => 'Software', 'price' => 540, 'repeat' => InvoiceItemType::Yearly, 'match' => 'FIGMA'],
            ['name' => 'Betriebshaftpflicht & Cyberversicherung', 'category' => 'Insurance', 'price' => 1480, 'repeat' => InvoiceItemType::Yearly, 'match' => 'HANSEMERKUR'],
            ['name' => 'Leasing Notebooks', 'category' => 'Hardware', 'price' => 389, 'repeat' => InvoiceItemType::Monthly, 'match' => 'GRENKE'],
            ['name' => 'Steuerberatung', 'category' => 'Other', 'price' => 1150, 'repeat' => InvoiceItemType::Quarterly, 'match' => 'STB PARTNER'],
            ['name' => 'LinkedIn Ads', 'category' => 'Marketing', 'price' => 300, 'repeat' => InvoiceItemType::Monthly, 'match' => 'LINKEDIN', 'months_ago' => 6],
        ];
    }

    /** @return array{name: string, description: string, status: string, source: string, starts: int, ends: ?int, prospects: int}[] */
    public static function marketingInitiatives(): array {
        return [
            ['name' => 'Messe „IT-Tage Nord“', 'description' => 'Messestand und Nachfassaktion für Kontakte aus der Messe.', 'status' => 'completed', 'source' => 'Event', 'starts' => 13, 'ends' => 10, 'prospects' => 6],
            ['name' => 'LinkedIn-Outreach Mittelstand', 'description' => 'Gezielte Ansprache von IT-Verantwortlichen im norddeutschen Mittelstand.', 'status' => 'active', 'source' => 'LinkedIn', 'starts' => 5, 'ends' => null, 'prospects' => 9],
            ['name' => 'Newsletter Kundenbindung', 'description' => 'Quartalsweiser Newsletter an Bestandskunden.', 'status' => 'paused', 'source' => 'Website', 'starts' => 8, 'ends' => null, 'prospects' => 0],
        ];
    }

    public static function prospectCompanies(): array {
        return ['Ostholsteiner Fleischwaren GmbH', 'Kieler Hafenbetriebe GmbH', 'Nordsee Windservice GmbH', 'Alster Steuerberatung', 'Hamburger Kaffeerösterei KG', 'Heide Metallbau GmbH', 'Sylt Hotels GmbH', 'Elbmarsch Bio-Höfe eG', 'Lübecker Druckhaus GmbH', 'Holstein Pflegedienst GmbH', 'Wedel Präzisionstechnik GmbH', 'Cuxhaven Fischerei GmbH', 'Harburg Event GmbH', 'Stormarn Kliniken GmbH', 'Pinneberg Baustoffe KG'];
    }
}
