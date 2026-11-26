<?php

return [
    'countries' => [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
        'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
        'SI', 'ES', 'SE',
    ],
    'vat_included_non_members' => ['MC'],
    'vat_excluded_territories' => [
        'DE' => ['Helgoland' => '27498', 'Büsingen am Hochrhein' => '78266'],
        'ES' => ['Las Palmas' => '35', 'Santa Cruz de Tenerife' => '38', 'Ceuta' => '51', 'Melilla' => '52'],
        'FI' => ['Åland' => '22'],
        'FR' => ['Outre-mer' => '97', 'Terres australes' => '984', 'Wallis-et-Futuna' => '986', 'Polynésie française' => '987', 'Nouvelle-Calédonie' => '988'],
        'GR' => ['Karyes' => '63086', 'Agion Oros' => '63087'],
        'IT' => ['Campione d\'Italia' => '22061', 'Livigno' => '23041'],
    ],
];
