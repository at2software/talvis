<?php

namespace App\Helpers;

use Composer\CaBundle\CaBundle;
use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Support\Facades\Log;
use Symfony\Component\DomCrawler\Crawler;

class HandelsRegister {
    private Client $client;
    private string $viewState         = '';
    private string $resultsFormAction = '';

    private function initClient() {
        $this->client = new Client([
            'verify'          => CaBundle::getSystemCaRootBundlePath(),
            'cookies'         => new CookieJar,
            'http_errors'     => false,
            'connect_timeout' => 15,
            'timeout'         => 60,
            'headers'         => [
                'User-Agent'      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language' => 'de-DE,de;q=0.9',
            ],
        ]);
    }
    public function process($commercialRegister) {
        $this->initClient();

        try {
            $resultsHtml = $this->fetchSearchResults($commercialRegister);
        } catch (GuzzleException $e) {
            Log::warning('HandelsRegister: Request failed for '.$commercialRegister.': '.$e->getMessage());
            return null;
        }

        if ($resultsHtml === 'fehlerhaft') {
            return ['fehlerhaft' => true];
        }
        if (empty($resultsHtml)) {
            return null;
        }

        try {
            return $this->parseCompany($resultsHtml);
        } catch (GuzzleException $e) {
            Log::warning('HandelsRegister: Request failed for '.$commercialRegister.': '.$e->getMessage());
            return null;
        }
    }
    private function parseCommercialRegister($commercialRegister) {
        if (preg_match('/[|,]/', $commercialRegister)) {
            $parts = preg_split('/[|,]/', $commercialRegister);
            return [
                'art'    => trim($parts[0] ?? ''),
                'nummer' => trim($parts[1] ?? ''),
                'ort'    => trim($parts[2] ?? ''),
            ];
        }

        if (preg_match('/^(.+?)\s+(HRA|HRB|GnR|PR|VR)\s+(.+)$/i', $commercialRegister, $matches)) {
            return [
                'art'    => trim($matches[2]),
                'nummer' => trim($matches[3]),
                'ort'    => trim($matches[1]),
            ];
        }

        return null;
    }
    private function fetchSearchResults($commercialRegister) {
        $parsed = $this->parseCommercialRegister($commercialRegister);
        if (! $parsed) {
            Log::warning('HandelsRegister: Could not parse commercial register: '.$commercialRegister);
            return null;
        }

        $registerGericht = $this->mapRegistergericht($parsed['ort']);
        if (empty($parsed['art']) || empty($parsed['nummer']) || empty($registerGericht)) {
            Log::warning('HandelsRegister: Missing register data for: '.$commercialRegister);
            return null;
        }

        $r1 = $this->client->get('https://www.handelsregister.de/rp_web/welcome.xhtml');
        if ($r1->getStatusCode() !== 200) {
            Log::warning('HandelsRegister: Failed to load welcome page.');
            return null;
        }
        $body1 = (string)$r1->getBody();

        preg_match('/name="javax.faces.ViewState".*?value="([^"]+)"/', $body1, $vsMatch);
        $welcomeViewState = $vsMatch[1] ?? '';

        $r2 = $this->client->post('https://www.handelsregister.de/rp_web/welcome.xhtml', [
            'form_params' => [
                'naviForm'                  => 'naviForm',
                'naviForm:normaleSucheLink' => 'naviForm:normaleSucheLink',
                'target'                    => 'normaleSucheLink',
                'javax.faces.ViewState'     => $welcomeViewState,
            ],
        ]);
        $body2 = (string)$r2->getBody();

        preg_match('/name="javax.faces.ViewState".*?value="([^"]+)"/', $body2, $vsMatch2);
        $searchViewState = $vsMatch2[1] ?? '';

        preg_match('/<form[^>]*id="form"[^>]*action="([^"]+)"/', $body2, $formMatch);
        $formAction = html_entity_decode($formMatch[1] ?? '');
        if (empty($formAction)) {
            Log::warning('HandelsRegister: Could not find search form.');
            return null;
        }

        $searchUrl = 'https://www.handelsregister.de'.$formAction;
        $r3        = $this->client->post($searchUrl, [
            'form_params' => [
                'javax.faces.partial.ajax'      => 'true',
                'javax.faces.source'            => 'form:btnSuche',
                'javax.faces.partial.execute'   => '@all',
                'javax.faces.partial.render'    => 'form',
                'form:btnSuche'                 => 'form:btnSuche',
                'form'                          => 'form',
                'form:schlagwoerter'            => '',
                'form:schlagwortOptionen'       => '1',
                'form:registerArt_input'        => $parsed['art'],
                'form:registerNummer'           => $parsed['nummer'],
                'form:registergericht_input'    => $registerGericht,
                'form:ergebnisseProSeite_input' => '10',
                'form:auchGeloeschte_input'     => 'on',
                'javax.faces.ViewState'         => $searchViewState,
            ],
        ]);
        $body3 = (string)$r3->getBody();

        if (preg_match('/redirect url="([^"]+)"/', $body3, $redirectMatch)) {
            $resultsUrl = 'https://www.handelsregister.de'.$redirectMatch[1];
            $r4         = $this->client->get($resultsUrl);
            return (string)$r4->getBody();
        }

        if (str_contains($body3, 'fehlerhaft')) {
            Log::warning('HandelsRegister: Registernummer fehlerhaft for: '.$commercialRegister);
            return 'fehlerhaft';
        }

        Log::warning('HandelsRegister: No redirect to results page for: '.$commercialRegister);
        return null;
    }
    private function parseCompany($html) {
        $crawler = new Crawler($html);

        if (! $crawler->filter('form[id=ergebnissForm]')->count()) {
            return null;
        }
        $this->resultsFormAction = $crawler->filter('form[id=ergebnissForm]')->first()->attr('action');

        if (! $crawler->filter('table[role="grid"] tbody tr[data-ri]')->count()) {
            return null;
        }
        $row = $crawler->filter('table[role="grid"] tbody tr[data-ri]')->first();

        $cells = $row->filter('td')->each(function ($cell) {
            return trim($cell->text());
        });

        preg_match('/name="javax.faces.ViewState".*?value="([^"]+)"/', $html, $vsMatch);
        $this->viewState = $vsMatch[1] ?? '';

        $links = $this->extractDocumentLinks($crawler);

        $insolvent = false;
        foreach ($links as $link) {
            if ($link['text'] !== 'SI') {
                continue;
            }
            $response = $this->client->post('https://www.handelsregister.de'.$this->resultsFormAction, [
                'form_params' => [
                    'ergebnissForm'         => 'ergebnissForm',
                    'javax.faces.ViewState' => $this->viewState,
                    $link['spanId']         => $link['spanId'],
                    'property'              => 'Global.Dokumentart.SI',
                ],
            ]);

            if ($response->getStatusCode() === 200) {
                $insolvent = str_contains((string)$response->getBody(), 'Insolvenz');
            }
        }

        return [
            'court'     => $cells[1] ?? '-',
            'name'      => $cells[2] ?? '-',
            'state'     => $cells[3] ?? '-',
            'status'    => $cells[4] ?? '-',
            'insolvent' => $insolvent,
            'links'     => array_column($links, 'text'),
            'history'   => array_slice($cells, 8),
        ];
    }
    private function extractDocumentLinks(Crawler $crawler) {
        return $crawler->filter('td a')->each(function ($linkNode) {
            $onclick = $linkNode->attr('onclick') ?? '';
            preg_match_all("/'([^']+)'/", $onclick, $matches);
            $text = $linkNode->filter('span')->count() ? $linkNode->filter('span')->text() : trim($linkNode->text());
            return [
                'text'   => $text,
                'spanId' => $linkNode->attr('id') ?? null,
                'params' => $matches[1] ?? [],
            ];
        });
    }
    private function mapRegistergericht($registerGerichtOrt) {
        $mapping = [
            'alle'                               => '',
            'Aachen'                             => 'R3101',
            'Altenburg'                          => 'Y1201',
            'Amberg'                             => 'D3101',
            'Ansbach'                            => 'D3201',
            'Apolda'                             => 'Y1101',
            'Arnsberg'                           => 'R1901',
            'Arnstadt'                           => 'Y1102',
            'Arnstadt Zweigstelle Ilmenau'       => 'Y1303',
            'Aschaffenburg'                      => 'D4102',
            'Augsburg'                           => 'D2102',
            'Aurich'                             => 'P3101',
            'Bad Hersfeld'                       => 'M1305',
            'Bad Homburg v.d.H.'                 => 'M1202',
            'Bad Kreuznach'                      => 'T2101',
            'Bad Oeynhausen'                     => 'R2108',
            'Bad Salzungen'                      => 'Y1301',
            'Bamberg'                            => 'D4201',
            'Bayreuth'                           => 'D4301',
            'Berlin'                             => 'F1103',
            'Bielefeld'                          => 'R2101',
            'Bochum'                             => 'R2201',
            'Bonn'                               => 'R3201',
            'Braunschweig'                       => 'P1103',
            'Bremen'                             => 'H1101',
            'Chemnitz'                           => 'U1206',
            'Coburg'                             => 'D4401',
            'Coesfeld'                           => 'R2707',
            'Cottbus'                            => 'G1103',
            'Darmstadt'                          => 'M1103',
            'Deggendorf'                         => 'D2201',
            'Dortmund'                           => 'R2402',
            'Dresden'                            => 'U1104',
            'Duisburg'                           => 'R1202',
            'Düren'                              => 'R3103',
            'Düsseldorf'                         => 'R1101',
            'Eisenach'                           => 'Y1105',
            'Erfurt'                             => 'Y1106',
            'Eschwege'                           => 'M1602',
            'Essen'                              => 'R2503',
            'Flensburg'                          => 'X1112',
            'Frankfurt am Main'                  => 'M1201',
            'Frankfurt/Oder'                     => 'G1207',
            'Freiburg'                           => 'B1204',
            'Friedberg'                          => 'M1405',
            'Fritzlar'                           => 'M1603',
            'Fulda'                              => 'M1301',
            'Fürth'                              => 'D3304',
            'Gelsenkirchen'                      => 'R2507',
            'Gera'                               => 'Y1203',
            'Gießen'                             => 'M1406',
            'Gotha'                              => 'Y1108',
            'Göttingen'                          => 'P2204',
            'Greiz'                              => 'Y1205',
            'Gütersloh'                          => 'R2103',
            'Hagen'                              => 'R2602',
            'Hamburg'                            => 'K1101',
            'Hamm'                               => 'R2404',
            'Hanau'                              => 'M1502',
            'Hannover'                           => 'P2305',
            'Heilbad Heiligenstadt'              => 'Y1109',
            'Hildburghausen'                     => 'Y1302',
            'Hildesheim'                         => 'P2408',
            'Hof'                                => 'D4501',
            'Homburg'                            => 'V1102',
            'Ingolstadt'                         => 'D5701',
            'Iserlohn'                           => 'R2604',
            'Jena'                               => 'Y1206',
            'Kaiserslautern'                     => 'T3201',
            'Kassel'                             => 'M1607',
            'Kempten'                            => 'D2304',
            'Kiel'                               => 'X1517',
            'Kleve'                              => 'R1304',
            'Koblenz'                            => 'T2210',
            'Köln'                               => 'R3306',
            'Königstein'                         => 'M1203',
            'Korbach'                            => 'M1608',
            'Krefeld'                            => 'R1402',
            'Landau'                             => 'T3304',
            'Landshut'                           => 'D2404',
            'Langenfeld'                         => 'R1105',
            'Lebach'                             => 'V1103',
            'Leipzig'                            => 'U1308',
            'Lemgo'                              => 'R2307',
            'Limburg'                            => 'M1706',
            'Lübeck'                             => 'X1721',
            'Ludwigshafen a.Rhein'               => 'T3104',
            'Lüneburg'                           => 'P2507',
            'Mainz'                              => 'T2304',
            'Mannheim'                           => 'B1601',
            'Marburg'                            => 'M1809',
            'Meiningen'                          => 'Y1304',
            'Memmingen'                          => 'D2505',
            'Merzig'                             => 'V1104',
            'Mönchengladbach'                    => 'R1504',
            'Montabaur'                          => 'T2214',
            'Mühlhausen'                         => 'Y1110',
            'München'                            => 'D2601',
            'Münster'                            => 'R2713',
            'Neubrandenburg'                     => 'N1105',
            'Neunkirchen'                        => 'V1105',
            'Neuruppin'                          => 'G1309',
            'Neuss'                              => 'R1102',
            'Nordhausen'                         => 'Y1111',
            'Nürnberg'                           => 'D3310',
            'Offenbach am Main'                  => 'M1114',
            'Oldenburg (Oldenburg)'              => 'P3210',
            'Osnabrück'                          => 'P3313',
            'Ottweiler'                          => 'V1107',
            'Paderborn'                          => 'R2809',
            'Passau'                             => 'D2803',
            'Pinneberg'                          => 'X1321',
            'Pößneck'                            => 'Y1209',
            'Pößneck Zweigstelle Bad Lobenstein' => 'Y1208',
            'Potsdam'                            => 'G1312',
            'Recklinghausen'                     => 'R2204',
            'Regensburg'                         => 'D3410',
            'Rostock'                            => 'N1206',
            'Rudolstadt'                         => 'Y1210',
            'Saarbrücken'                        => 'V1109',
            'Saarlouis'                          => 'V1110',
            'Schweinfurt'                        => 'D4608',
            'Schwerin'                           => 'N1308',
            'Siegburg'                           => 'R3208',
            'Siegen'                             => 'R2909',
            'Sömmerda'                           => 'Y1112',
            'Sondershausen'                      => 'Y1113',
            'Sonneberg'                          => 'Y1307',
            'Stadthagen'                         => 'P2106',
            'Stadtroda'                          => 'Y1214',
            'Steinfurt'                          => 'R2706',
            'Stendal'                            => 'W1215',
            'St. Ingbert'                        => 'V1111',
            'Stralsund'                          => 'N1209',
            'Straubing'                          => 'D3413',
            'Stuttgart'                          => 'B2609',
            'St. Wendel'                         => 'V1112',
            'Suhl'                               => 'Y1308',
            'Tostedt'                            => 'P2613',
            'Traunstein'                         => 'D2910',
            'Ulm'                                => 'B2805',
            'Völklingen'                         => 'V1115',
            'Walsrode'                           => 'P2716',
            'Weiden i. d. OPf.'                  => 'D3508',
            'Weimar'                             => 'Y1114',
            'Wetzlar'                            => 'M1710',
            'Wiesbaden'                          => 'M1906',
            'Wittlich'                           => 'T2408',
            'Wuppertal'                          => 'R1608',
            'Würzburg'                           => 'D4708',
            'Zweibrücken'                        => 'T3403',
        ];
        return $mapping[$registerGerichtOrt] ?? null;
    }
}
