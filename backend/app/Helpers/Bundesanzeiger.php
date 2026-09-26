<?php

namespace App\Helpers;

use Composer\CaBundle\CaBundle;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\DomCrawler\Crawler;

class Bundesanzeiger {
    private $cookies = [];

    private function http() {
        return Http::withOptions(['verify' => CaBundle::getSystemCaRootBundlePath()])
            ->connectTimeout(15)
            ->timeout(60)
            ->withHeaders([
                'Accept'                    => 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'           => 'gzip, deflate, br',
                'Accept-Language'           => 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control'             => 'no-cache',
                'Connection'                => 'keep-alive',
                'DNT'                       => '1',
                'Host'                      => 'www.bundesanzeiger.de',
                'Pragma'                    => 'no-cache',
                'Referer'                   => 'https://www.bundesanzeiger.de/',
                'Sec-Fetch-Dest'            => 'document',
                'Sec-Fetch-Mode'            => 'navigate',
                'Sec-Fetch-Site'            => 'same-origin',
                'Sec-Fetch-User'            => '?1',
                'Upgrade-Insecure-Requests' => '1',
                'User-Agent'                => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ]);
    }
    public function process($companyName) {
        try {
            $html = $this->fetchSearchResults($companyName);
        } catch (ConnectionException $e) {
            Log::warning('Bundesanzeiger: Request failed for '.$companyName.': '.$e->getMessage());
            return [];
        }

        if (empty($html)) {
            return [];
        }
        return $this->parseReports($html);
    }
    private function fetchSearchResults($companyName) {
        $initialResponse = $this->http()->get('https://www.bundesanzeiger.de');
        if ($initialResponse->failed()) {
            Log::warning('Bundesanzeiger: Failed to fetch the initial page.');
            return null;
        }

        foreach ($initialResponse->cookies() as $cookie) {
            $this->cookies[$cookie->getName()] = $cookie->getValue();
        }

        $startPageResponse = $this->http()
            ->withCookies($this->cookies, 'www.bundesanzeiger.de')
            ->get('https://www.bundesanzeiger.de/pub/de/start?0');
        if ($startPageResponse->failed()) {
            Log::warning('Bundesanzeiger: Failed to fetch the start page.');
            return null;
        }

        $searchUrl      = 'https://www.bundesanzeiger.de/pub/de/start?0-2.-top%7Econtent%7Epanel-left%7Ecard-form=&fulltext='.urlencode($companyName).'&area_select=&search_button=Suchen';
        $searchResponse = $this->http()
            ->withCookies($this->cookies, 'www.bundesanzeiger.de')
            ->get($searchUrl);
        if ($searchResponse->failed()) {
            Log::warning('Bundesanzeiger: Failed to perform the search for: '.$companyName);
            return null;
        }
        return $searchResponse->body();
    }
    private function parseReports($html) {
        $crawler = new Crawler($html);
        $reports = [];

        $crawler->filter('.result_container .row')->each(function (Crawler $node, $i) use (&$reports) {
            $date    = $node->filter('.date')->count() ? trim($node->filter('.date')->text()) : null;
            $name    = $node->filter('.info a')->count() ? trim($node->filter('.info a')->text()) : null;
            $link    = $node->filter('.info a')->count() ? $node->filter('.info a')->attr('href') : null;
            $company = $node->filter('.first')->count() ? trim($node->filter('.first')->text()) : null;

            if (! $date || ! $name || ! $link || ! $company) {
                return;
            }

            $reports[] = [
                'date'    => $date,
                'name'    => $name,
                'link'    => $link,
                'company' => $company,
            ];
        });
        return $reports;
    }
}
