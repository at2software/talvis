<?php

namespace Database\Seeders;

use App\Models\ProductGroup;
use Carbon\Carbon;
use Faker\Factory as Faker;
use Faker\Generator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoSeederData extends Seeder {
    private $_faker = null;

    public function faker(): Generator {
        if ($this->_faker == null) {
            $this->_faker = Faker::create('de_DE');
        }
        return $this->_faker;
    }
    public function users(Carbon $startDay): array {
        $faker = $this->faker();

        $hireOffsets = [
            [0,  'anna.mueller',   'anna.mueller',   'admin',           'Geschäftsführerin', '1985-03-12'],
            [0,  'thomas.weber',   'thomas.weber',   'project_manager', 'Senior Developer',  '1983-07-24'],
            [0,  'lisa.schmidt',   'lisa.schmidt',   'user',       'Full-Stack Developer', '1990-11-05'],
            [12, 'markus.fischer', 'markus.fischer', 'user',       'Backend Developer', '1992-04-18'],
            [30, 'julia.becker',   'julia.becker',   'user',       'Frontend Developer', '1994-09-30'],
            [42, 'david.koch',     'david.koch',     'user',       'Junior Developer',  '1999-02-14'],
        ];

        $users = [];
        foreach ($hireOffsets as [$offset, $username, $emailPre, $role, $title, $birthdate]) {
            $hiredAt   = $startDay->copy()->addMonths($offset);
            $domain    = 'digitech-demo.com';
            $phone     = $faker->phoneNumber();
            $postcode  = $faker->postcode();
            $city      = $faker->city();
            $street    = $faker->streetAddress();
            $firstName = ucfirst(explode('.', $username)[0]);
            $lastName  = ucfirst(explode('.', $username)[1]);

            $users[] = [
                'name'     => $username,
                'email'    => "{$emailPre}@{$domain}",
                'password' => Hash::make('password'),
                'role'     => $role,
                'hired_at' => $hiredAt,
                'vcard'    => <<<VCARD
                    FN:{$firstName} {$lastName}
                    ORG:Digitech GmbH
                    TITLE:{$title}
                    N;charset=utf-8:{$lastName};{$firstName};;;
                    BDAY:{$birthdate}
                    TEL;type=work;type=cell:{$phone}
                    EMAIL;type=work:{$emailPre}@{$domain}
                    ADR;type=work;charset=utf-8:;;{$street};{$city};;{$postcode};DE
                    URL;type=work:https://digitech-demo.com
                    VCARD,
            ];
        }
        return $users;
    }
    public function product_groups(): array {
        return [
            'Beratung',
            'Mediendesign',
            'Expo Development',
            'Web Development',
            'Mobile Development',
            '3D Development',
            'Software Development',
            'Microcomputer Development',
        ];
    }

    private array $productNamesAndGroups = [
        ['Support', 'Beratung'],
        ['Beratung', 'Beratung'],
        ['Webdesign', 'Mediendesign'],
        ['Expo Development', 'Expo Development'],
        ['Installation', 'Expo Development'],
        ['PHP & Web-Development', 'Web Development'],
        ['Angular Development', 'Web Development'],
        ['Laravel Development', 'Web Development'],
        ['IOS Development', 'Mobile Development'],
        ['Android Development', 'Mobile Development'],
        ['Unreal Engine Development', '3D Development'],
        ['Unity Development', '3D Development'],
        ['C# Development', '3D Development'],
        ['Cpp Development', '3D Development'],
        ['Individuelle Softwareentwicklung', 'Software Development'],
        ['Arduino Development', 'Microcomputer Development'],
        ['Microcomputer Development', 'Microcomputer Development'],
    ];

    public function products(): array {
        $faker    = $this->faker();
        $products = [];

        foreach ($this->productNamesAndGroups as $i => $productNameAndGroup) {
            [$productName, $product_group_name] = $productNameAndGroup;
            $productGroupId                     = ProductGroup::where('name', $product_group_name)->pluck('id')->first();
            $price                              = $faker->numberBetween(1000, 5000);
            $products[]                         = [
                'product_group_id' => $productGroupId,
                'name'             => $productName,
                'item_number'      => 'PROD-00'.$i,
                'is_active'        => true,
                'is_discountable'  => false,
                'time_based'       => 0,
                'recurrence'       => 0,
                'position'         => 2,
                'minimum_amount'   => 1,
                'package_amount'   => 1,
                'minimum_price'    => $price,
                'net'              => $price,
                'gross'            => round($price * 0.19, 2),
            ];
        }
        return $products;
    }
    public function new_customer(): array {
        $faker          = $this->faker();
        $companyName    = $faker->company();
        $customerNumber = $faker->numberBetween(10000, 99999);
        $phoneNumber    = $faker->phoneNumber();
        $postcode       = $faker->postcode();
        $city           = $faker->city();
        $streetAddress  = $faker->streetAddress();
        $companySlug    = Str::slug($companyName, '.');
        $email          = 'info@'.$companySlug.'.com';
        $website        = $companySlug.'.com';

        $company = [
            'name'            => $companyName,
            'customer_number' => $customerNumber,
            'discount'        => 0,
            'net'             => 0,
            'gross'           => 0,
            'vcard'           => <<<VCARD
                FN:{$companyName}
                ADR;type=work;charset=utf-8:;;{$streetAddress};{$city};;{$postcode};DE
                ORG:{$companyName}
                EMAIL;type=work:{$email}
                TEL;type=work;type=cell:{$phoneNumber}
                URL;type=work:{$website}
                VCARD,
        ];

        $firstName    = $faker->firstName();
        $lastName     = $faker->lastName();
        $contactEmail = strtolower($firstName).'.'.strtolower($lastName).'@'.$companySlug.'.com';
        $contactVcard = <<<VCARD
            FN:{$firstName} {$lastName}
            N;charset=utf-8:{$lastName};{$firstName};;;
            ADR;type=work;charset=utf-8:;;{$streetAddress};{$city};;{$postcode};DE
            ORG:{$companyName}
            EMAIL;type=work:{$contactEmail}
            TEL;type=work;type=cell:{$phoneNumber}
            VCARD;
        return [
            'company'         => $company,
            'company_contact' => [
                'is_retired'           => false,
                'is_invoicing_address' => true,
                'vcard'                => $contactVcard,
            ],
            'contact' => ['vcard' => $contactVcard],
        ];
    }
    public function new_project($company): array {
        $faker       = $this->faker();
        $companyName = '';
        if (preg_match('/^FN:(.+)$/m', $company->vcard, $matches)) {
            $companyName = trim($matches[1]);
        }

        $projectNamesWithArea = [
            ['Interaktive Wand', 'Event'],
            ['Minispiel', 'Event'],
            ['Wheel of Fortune', 'Event'],
            ['Arduino Library', 'Microcontroller'],
            ['Raspberry Pi Project', 'Microcontroller'],
            ['Fitness Tracker', 'Mobile'],
            ['Multitool App Android', 'Mobile'],
            ['Multitool App IOS', 'Mobile'],
            ['Mobile Shop View', 'Mobile'],
            ['3D Viewer & Editor', 'Windows'],
            ['3D Modell Generator', 'Windows'],
            ['Web Shop', 'Web'],
            ['Web Management Tool', 'Web'],
            ['Web File Viewer', 'Web'],
            ['Website Redesign', 'Web'],
        ];

        $productIds = [];
        foreach ($this->productNamesAndGroups as $i => $product_name_and_group) {
            $productName              = $product_name_and_group[0];
            $productIds[$productName] = \DB::table('products')->where('name', $productName)->value('id');
        }

        [$project_general_name, $area] = $projectNamesWithArea[$faker->numberBetween(0, count($projectNamesWithArea) - 1)];
        $projectName                   = $project_general_name.' '.$companyName;

        $project = [
            'name'           => $projectName,
            'description'    => '',
            'state'          => 0,
            'finished_state' => 0,
            'is_internal'    => false,
            'is_time_based'  => false,
            'company_id'     => $company->id,
        ];

        $invoiceItems = $this->createInvoiceItems($area, $productIds, $faker);
        return [$project, $invoiceItems];
    }
    public function createInvoiceItems(string $area, array $productIds, Generator $faker): array {
        $invoiceItems = [];
        switch ($area) {
            case 'Event':
                $invoiceItems[] = [
                    'product_id' => $productIds['Expo Development'],
                    'qty'        => $faker->numberBetween(1, 7),
                    'price'      => $faker->randomFloat(2, 100, 1000),
                    'unit_name'  => 'PT',
                    'text'       => 'Base Development',
                ];
                $invoiceItems[] = [
                    'product_id' => $productIds['Beratung'],
                    'qty'        => 1,
                    'price'      => $faker->randomFloat(2, 100, 1000),
                    'unit_name'  => 'PT',
                    'text'       => 'Problembehebung während Messe',
                ];
                if ($faker->boolean(50)) {
                    $invoiceItems[] = [
                        'product_id' => $productIds['Installation'],
                        'qty'        => 0.5,
                        'price'      => $faker->randomFloat(2, 100, 1000),
                        'unit_name'  => 'PT',
                        'text'       => 'Remote Installation Hilfe',
                    ];
                }
                break;

            case 'Microcontroller':
                $invoiceItems[] = [
                    'product_id' => $productIds['Arduino Development'],
                    'qty'        => $faker->numberBetween(2, 7),
                    'price'      => $faker->randomFloat(2, 100, 1000),
                    'unit_name'  => 'PT',
                    'text'       => 'Base Software Development',
                ];
                $invoiceItems[] = [
                    'product_id' => $productIds['Arduino Development'],
                    'qty'        => $faker->numberBetween(2, 4),
                    'price'      => $faker->randomFloat(2, 100, 1000),
                    'unit_name'  => 'PT',
                    'text'       => 'Physical Development',
                ];
                break;

            case 'Mobile':
                $product        = $faker->boolean(50) ? 'IOS Development' : 'Android Development';
                $invoiceItems[] = [
                    'product_id' => $productIds[$product],
                    'qty'        => $faker->numberBetween(5, 21),
                    'price'      => $faker->randomFloat(2, 100, 1000),
                    'unit_name'  => 'PT',
                    'text'       => 'Base Development',
                ];
                break;

            case 'Windows':
                $options        = ['Unreal Engine Development', 'Unity Development', 'C# Development', 'Cpp Development'];
                $product        = $faker->randomElement($options);
                $invoiceItems[] = [
                    'product_id' => $productIds[$product],
                    'qty'        => $faker->numberBetween(5, 15),
                    'price'      => $faker->randomFloat(2, 100, 1000),
                    'unit_name'  => 'PT',
                    'text'       => 'Base Development',
                ];
                break;

            case 'Web':
                if ($faker->boolean(50)) {
                    $invoiceItems[] = [
                        'product_id' => $productIds['PHP & Web-Development'],
                        'qty'        => $faker->numberBetween(2, 3),
                        'price'      => $faker->randomFloat(2, 100, 1000),
                        'unit_name'  => 'PT',
                        'text'       => 'Base Development',
                    ];
                } else {
                    $qty            = $faker->numberBetween(10, 30);
                    $invoiceItems[] = [
                        'product_id' => $productIds['Angular Development'],
                        'qty'        => $qty,
                        'price'      => $faker->randomFloat(2, 100, 1000),
                        'unit_name'  => 'PT',
                        'text'       => 'Frontend Development',
                    ];
                    $invoiceItems[] = [
                        'product_id' => $productIds['Laravel Development'],
                        'qty'        => $qty,
                        'price'      => $faker->randomFloat(2, 100, 1000),
                        'unit_name'  => 'PT',
                        'text'       => 'Backend Development',
                    ];
                }
                break;
        }
        return $invoiceItems;
    }
}
