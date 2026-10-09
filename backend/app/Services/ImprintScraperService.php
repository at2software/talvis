<?php

namespace App\Services;

use App\Traits\VcardTrait;
use DOMDocument;
use DOMXPath;
use Illuminate\Console\Command;

class ImprintScraperService {
    const EMPTY_LINES_BEFORE = 4;
    const EMPTY_LINES_AFTER  = 0;

    public static $imprints = [
        'impressum',        // German
        'imprint',          // English
        'legal notice',     // English
        'legal information', // English
        'company info',     // English
        'company information', // English
        'about us',         // English (sometimes contains legal info)
        'contact',          // English (often has company details)
        'legal',            // English
        'terms',            // English (terms page often has company info)
        'privacy',          // English (privacy page often has company info)
        'disclaimer',       // English
        'datenschutz',      // German (privacy)
        'rechtliches',      // German (legal)
        'unternehmen',      // German (company)
        'kontakt',          // German (contact)
        'über uns',         // German (about us)
        'agb',               // German (terms and conditions)
    ];
    private ?Command $console = null;

    public function __construct(private SafeUrlGuard $guard) {}

    private function fetch(string $url, int $hopsLeft = 5): string {
        $pinned = $this->guard->pinnedCurlOptions($url);

        $ch = curl_init();
        curl_setopt_array($ch, $pinned + [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            CURLOPT_ENCODING       => '',
            CURLOPT_HTTPHEADER     => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9',
                'DNT: 1',
                'Connection: keep-alive',
                'Upgrade-Insecure-Requests: 1',
                'Sec-Fetch-Dest: document',
                'Sec-Fetch-Mode: navigate',
                'Sec-Fetch-Site: none',
                'Cache-Control: max-age=0',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $redirect = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new \Exception("cURL error: $error");
        }

        if ($redirect && $httpCode >= 300 && $httpCode < 400) {
            if ($hopsLeft === 0) {
                throw new \Exception('Too many redirects');
            }

            return $this->fetch($redirect, $hopsLeft - 1);
        }

        if ($httpCode >= 400) {
            throw new \Exception("HTTP error $httpCode");
        }

        return $response;
    }
    private function loadUrl(string $url): string {
        $response = $this->fetch($url);
        $encoding = mb_detect_encoding($response, mb_detect_order(), true);

        if (strtoupper($encoding) === 'UTF-8' || strtoupper($encoding) === 'UTF8' || strtoupper($encoding) === 'ASCII') {
            return html_entity_decode($response);
        }
        return html_entity_decode(iconv($encoding, 'UTF-8//IGNORE', $response));
    }
    private function relToAbs($base, $link) {
        if (preg_match('/^https?:\\/\\//is', $link)) {
            return $link;
        } // already absolute link
        if (! preg_match('/^\\//', $link)) {
            return $base.$link;
        }
        $base = preg_replace('/^(https?:\\/\\/.*?)[\\/$].*$/', '$1', $base);
        return $base.$link;
    }
    private function reduce(array $set) {
        while (count($set) > (self::EMPTY_LINES_AFTER + 4) && ! preg_match('/ (gmbh|ag|se|kg|kgaa)$/i', $set[0])) {
            array_shift($set);
        }
        return $set;
    }
    private function findRaw($regex, $string) {
        preg_match_all("/$regex/is", $string, $matches, PREG_SET_ORDER);
        return array_map(fn ($_) => $_[1], $matches);
    }
    private function findArray($regex, $string) {
        return $this->findRaw("\\n$regex\\s*:?[\\s\\n]*(.*?)\\n", $string);
    }
    private function convertImage(string $url): ?\GdImage {
        $url_plain = preg_replace('/[?&#].*$/', '', $url);
        $parts     = explode('.', $url_plain);
        $type      = array_pop($parts);
        if (! in_array(strtolower($type), ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'wbmp', 'webp'], true)) {
            return null;
        }
        try {
            return @imagecreatefromstring($this->fetch($url)) ?: null;
        } catch (\Exception) {
            return null;
        }
    }
    private function createThumbnail(\GdImage $src_img, int $newSize): ?\GdImage {
        $x = imagesx($src_img);
        $y = imagesy($src_img);

        $dst_img = imagecreatetruecolor($newSize, $newSize);
        imagesavealpha($dst_img, true);

        if ($x === $y) {
            imagecopyresampled($dst_img, $src_img, 0, 0, 0, 0, $newSize, $newSize, $x, $y);
            return $dst_img;
        }

        $backgroundColor = $this->detectBackgroundColor($src_img);

        $bgColor = imagecolorallocate($dst_img, $backgroundColor['r'], $backgroundColor['g'], $backgroundColor['b']);
        imagefill($dst_img, 0, 0, $bgColor);

        $ratio     = $newSize / max($x, $y);
        $newWidth  = (int)($x * $ratio);
        $newHeight = (int)($y * $ratio);

        $offsetX = (int)(($newSize - $newWidth) / 2);
        $offsetY = (int)(($newSize - $newHeight) / 2);

        imagecopyresampled($dst_img, $src_img, $offsetX, $offsetY, 0, 0, $newWidth, $newHeight, $x, $y);
        return $dst_img;
    }
    private function detectBackgroundColor(\GdImage $img): array {
        $width  = imagesx($img);
        $height = imagesy($img);

        $corners = [
            imagecolorat($img, 0, 0),
            imagecolorat($img, 1, 0),
            imagecolorat($img, 0, 1),

            imagecolorat($img, $width - 1, 0),
            imagecolorat($img, $width - 2, 0),
            imagecolorat($img, $width - 1, 1),

            imagecolorat($img, 0, $height - 1),
            imagecolorat($img, 1, $height - 1),
            imagecolorat($img, 0, $height - 2),

            imagecolorat($img, $width - 1, $height - 1),
            imagecolorat($img, $width - 2, $height - 1),
            imagecolorat($img, $width - 1, $height - 2),
        ];

        $colorCounts = [];
        foreach ($corners as $colorIndex) {
            $rgb = imagecolorsforindex($img, $colorIndex);
            $key = "{$rgb['red']},{$rgb['green']},{$rgb['blue']}";

            if (! isset($colorCounts[$key])) {
                $colorCounts[$key] = ['count' => 0, 'rgb' => $rgb];
            }
            $colorCounts[$key]['count']++;
        }

        $mostCommon = null;
        $maxCount   = 0;
        foreach ($colorCounts as $data) {
            if ($data['count'] > $maxCount) {
                $maxCount   = $data['count'];
                $mostCommon = $data['rgb'];
            }
        }

        if ($mostCommon) {
            return ['r' => $mostCommon['red'], 'g' => $mostCommon['green'], 'b' => $mostCommon['blue']];
        }

        return ['r' => 255, 'g' => 255, 'b' => 255];
    }
    private function autoCropImage(\GdImage $img, float $maxPaddingPercent = 0.05): \GdImage {
        $width  = imagesx($img);
        $height = imagesy($img);

        $bgColor   = $this->detectBackgroundColor($img);
        $tolerance = 30; // Color tolerance for matching background

        $left   = $this->findContentBoundary($img, 'left', $bgColor, $tolerance);
        $right  = $this->findContentBoundary($img, 'right', $bgColor, $tolerance);
        $top    = $this->findContentBoundary($img, 'top', $bgColor, $tolerance);
        $bottom = $this->findContentBoundary($img, 'bottom', $bgColor, $tolerance);

        if ($left >= $right || $top >= $bottom) {
            return $img;
        }

        $contentWidth  = $right - $left;
        $contentHeight = $bottom - $top;

        $paddingX = (int)($contentWidth * $maxPaddingPercent);
        $paddingY = (int)($contentHeight * $maxPaddingPercent);

        $cropLeft   = max(0, $left - $paddingX);
        $cropTop    = max(0, $top - $paddingY);
        $cropWidth  = min($width - $cropLeft, $contentWidth + (2 * $paddingX));
        $cropHeight = min($height - $cropTop, $contentHeight + (2 * $paddingY));

        $cropped = imagecreatetruecolor($cropWidth, $cropHeight);
        imagesavealpha($cropped, true);

        $bg = imagecolorallocate($cropped, $bgColor['r'], $bgColor['g'], $bgColor['b']);
        imagefill($cropped, 0, 0, $bg);

        imagecopy($cropped, $img, 0, 0, $cropLeft, $cropTop, $cropWidth, $cropHeight);
        return $cropped;
    }
    private function findContentBoundary(\GdImage $img, string $direction, array $bgColor, int $tolerance): int {
        $width  = imagesx($img);
        $height = imagesy($img);

        $isBackground = function ($rgb) use ($bgColor, $tolerance) {
            return abs($rgb['red'] - $bgColor['r']) <= $tolerance &&
                   abs($rgb['green'] - $bgColor['g']) <= $tolerance &&
                   abs($rgb['blue'] - $bgColor['b']) <= $tolerance;
        };

        switch ($direction) {
            case 'left':
                for ($x = 0; $x < $width; $x++) {
                    for ($y = 0; $y < $height; $y++) {
                        $rgb = imagecolorsforindex($img, imagecolorat($img, $x, $y));
                        if (! $isBackground($rgb)) {
                            return $x;
                        }
                    }
                }
                return $width;

            case 'right':
                for ($x = $width - 1; $x >= 0; $x--) {
                    for ($y = 0; $y < $height; $y++) {
                        $rgb = imagecolorsforindex($img, imagecolorat($img, $x, $y));
                        if (! $isBackground($rgb)) {
                            return $x + 1;
                        }
                    }
                }
                return 0;

            case 'top':
                for ($y = 0; $y < $height; $y++) {
                    for ($x = 0; $x < $width; $x++) {
                        $rgb = imagecolorsforindex($img, imagecolorat($img, $x, $y));
                        if (! $isBackground($rgb)) {
                            return $y;
                        }
                    }
                }
                return $height;

            case 'bottom':
                for ($y = $height - 1; $y >= 0; $y--) {
                    for ($x = 0; $x < $width; $x++) {
                        $rgb = imagecolorsforindex($img, imagecolorat($img, $x, $y));
                        if (! $isBackground($rgb)) {
                            return $y + 1;
                        }
                    }
                }
                return 0;
        }
        return 0;
    }
    private function getMaximumImageSizeFor($logos, string $sizeAttr = 'sizes'): ?string {
        $maxSize = 0;
        $maxUrl  = null;
        foreach ($logos as $logo) {
            $mySize = intval(explode('x', $logo->getAttribute($sizeAttr))[0]);
            if ($mySize > $maxSize) {
                $maxSize = $mySize;
                $maxUrl  = $logo->getAttribute('href');
            }
        }
        return $maxUrl;
    }
    private function checkForCompanyLogo(DOMDocument $doc): ?string {
        $xpath = new DOMXPath($doc);

        if ($_ = $this->getMaximumImageSizeFor($xpath->query('//link[@rel="apple-touch-icon"]', $doc))) {
            return $_;
        }
        if ($_ = $this->getMaximumImageSizeFor($xpath->query('//link[@rel="icon" or @rel="apple-touch-icon"]', $doc))) {
            return $_;
        }

        if (count($_ = $xpath->query('//meta[@rel="icon" and @type="image/png"]', $doc))) {
            $iconNode = $_->item(0);
            if ($iconNode instanceof \DOMElement) {
                return $iconNode->getAttribute('content');
            }
        }
        if (count($_ = $xpath->query('//meta[@property="og:image"]', $doc))) {
            $ogImageNode = $_->item(0);
            if ($ogImageNode instanceof \DOMElement) {
                return $ogImageNode->getAttribute('content');
            }
        }

        $logoPatterns = [
            '//header//img[contains(@class, "logo")]',
            '//header//img[contains(@id, "logo")]',
            '//img[contains(@class, "site-logo")]',
            '//img[contains(@class, "header-logo")]',
            '//img[contains(@id, "site-logo")]',
            '//a[contains(@class, "logo")]//img',
            '//*[@class="logo"]//img',
            '//*[@id="logo"]//img',
            '//div[contains(@class, "branding")]//img',
        ];

        foreach ($logoPatterns as $pattern) {
            $images = $xpath->query($pattern, $doc);
            if ($images && $images->length > 0) {
                $logoNode = $images->item(0);
                if ($logoNode instanceof \DOMElement) {
                    return $logoNode->getAttribute('src');
                }
            }
        }
        return null;
    }
    public function execute(string $url, ?string $existingVcard = null, ?Command $console = null): array {
        $this->console = $console;

        $this->log("<fg=cyan>📄 Analyzing URL:</> <fg=white>$url</>");

        try {
            $response = $this->loadUrl($url);
            $this->log('<fg=green>✓</> Loaded page ('.round(strlen($response) / 1024, 1).'KB)');
        } catch (\Exception $e) {
            $this->log("<fg=red>✗ Failed to load URL: {$e->getMessage()}</>");
            throw $e;
        }

        $rv = [
            'URL'               => $url,
            'FN'                => '',
            'ORG'               => '',
            'ADR'               => [],
            'TEL'               => [],
            'EMAIL'             => [],
            'VAT_ID'            => null,
            'MANAGING_DIRECTOR' => null,
            'BUSINESS_REGISTER' => null,
            'SOCIAL_MEDIA'      => [],
        ];

        $doc = new DOMDocument;
        $doc->loadHTML($response, LIBXML_NOERROR);
        $xpath = new DOMXPath($doc);

        $schemaData = $this->extractSchemaOrgData($doc, $xpath);

        $companyName = $this->extractCompanyName($doc, $xpath);
        if ($companyName) {
            $rv['FN']  = $companyName;
            $rv['ORG'] = $companyName;
            $this->log("<fg=green>✓</> Found company name: <fg=white>$companyName</>");
        }

        if ($image = @$this->checkForCompanyLogo($doc)) {
            $absoluteUrl = $this->relToAbs($rv['URL'], $image);
            if ($logo = $this->convertImage($absoluteUrl)) {
                $logo = $this->autoCropImage($logo);
                $new  = $this->createThumbnail($logo, 512);
                ob_start();
                imagepng($new);
                $imageData   = ob_get_clean();
                $rv['PHOTO'] = base64_encode($imageData);
                $this->log('<fg=green>✓</> Found logo ('.round(strlen($rv['PHOTO']) / 1024, 1).'KB)');
            }
        }

        $this->log('<fg=yellow>🔍 Searching for imprint page...</>');

        $imprintFound = false;
        foreach (self::$imprints as $imprintNeedle) {
            $contains = "contains(translate(., 'ABCDEFGHJIKLMNOPQRSTUVWXYZ', 'abcdefghjiklmnopqrstuvwxyz'), '$imprintNeedle')";
            $query    = "//a[@href and $contains]|//a//*[$contains]";
            $entries  = $xpath->query($query, $doc);

            if ($entries && $entries->length > 0) {
                $entryNode = $entries->item(0);
                if (! $entryNode instanceof \DOMElement) {
                    continue;
                }

                $imprint_url = $entryNode->getAttribute('href');

                if (! preg_match('/^https?:\\/\\//is', $imprint_url)) {
                    $imprint_url = $this->relToAbs($rv['URL'], $imprint_url);
                }

                $this->log("<fg=green>✓</> Found imprint page: <fg=white>$imprintNeedle</>");

                try {
                    $response = $this->loadUrl($imprint_url);
                    $this->log('<fg=green>✓</> Loaded imprint ('.round(strlen($response) / 1024, 1).'KB)');
                } catch (\Exception $e) {
                    $this->log("<fg=red>✗ Failed to load imprint: {$e->getMessage()}</>");

                    continue;
                }

                $imprintFound = true;
                $this->extractFromPageContent($response, $url, $rv, $existingVcard, $schemaData);
                break;
            }
        }

        if (! $imprintFound) {
            $this->log('<fg=yellow>⚠ No imprint page found, analyzing main page content...</>');
            $this->extractFromPageContent($response, $url, $rv, $existingVcard, $schemaData);
        }

        if (count($rv['ADR'])) {
            $this->log('<fg=green>✓</> Found '.count($rv['ADR']).' address(es)');
        }

        if (empty(array_filter([$rv['FN'], $rv['ORG']]) + $rv['ADR'] + $rv['TEL'] + $rv['EMAIL'])) {
            $this->log('<fg=yellow>⚠ No imprint data found</>');
        } else {
            $this->log('');
            $this->log('<fg=green>✅ Extraction complete</>');
            if ($rv['FN']) {
                $this->log("   Company: <fg=white>{$rv['FN']}</>");
            }
            $this->log('   Data: <fg=white>'.count($rv['ADR']).' address(es), '.count($rv['TEL']).' phone(s), '.count($rv['EMAIL']).' email(s)</>');
        }

        $this->emitJson($rv);
        return $rv;
    }
    private function extractFromPageContent(string $response, string $url, array &$rv, ?string $existingVcard, array $schemaData = []): void {
        $this->log('<fg=yellow>🔎 Extracting contact information...</>');

        $originalHtml = $response;

        $response = preg_replace('/<!--.*?-->/is', "\n", $response);
        $response = preg_replace('/<script.*?<\/script>/is', "\n", $response);
        $response = preg_replace('/<style.*?<\/style>/is', "\n", $response);
        $response = preg_replace('/<.*?>/is', "\n", $response);
        $response = strip_tags($response);
        $response = preg_replace('/(?:\\r?\\n|\\r)/is', "\n", $response);
        $response = preg_replace('/(\\n)\\s*\\n/is', "\n", $response);
        $response = preg_replace('/\\n\\s+/s', "\n", $response);
        $response = preg_replace('/\\s+\\n/s', "\n", $response);

        $existingData = $this->parseExistingVcard($existingVcard);

        if (! empty($schemaData['address'])) {
            $addr        = $schemaData['address'];
            $countryCode = 'DE'; // default
            if (! empty($addr['country'])) {
                $countryMap  = ['Germany' => 'DE', 'United Kingdom' => 'GB', 'UK' => 'GB', 'United States' => 'US', 'USA' => 'US'];
                $countryCode = $countryMap[$addr['country']] ?? $addr['country'];
            }

            $rfc = [
                '',
                '',
                $addr['street'],
                $addr['city'],
                $addr['region'],
                $addr['postalCode'],
                $countryCode,
            ];

            if (! $this->isAddressDuplicate($rfc, $rv['ADR'])) {
                $rv['ADR'][] = $rfc;
                $this->log('<fg=green>✓</> Found address from schema.org');
            }
        }

        $this->extractGermanAddresses($response, $rv);
        $this->extractUkAddresses($response, $rv);
        $this->extractUsAddresses($response, $rv);

        $countryContext = $this->determineCountryContext($url, $rv['ADR'], $schemaData);

        $existingData['TEL'] = array_map(
            fn ($tel) => VcardTrait::normalizePhoneNumber($tel, $countryContext),
            $existingData['TEL']
        );

        if (! empty($schemaData['telephone'])) {
            foreach ($schemaData['telephone'] as $phone) {
                $normalized = VcardTrait::normalizePhoneNumber($phone, $countryContext);
                if (! in_array($normalized, $existingData['TEL'] ?? [])) {
                    $rv['TEL'][] = ['number' => $normalized, 'type' => 'phone'];
                }
            }
            $this->log('<fg=green>✓</> Found '.count($schemaData['telephone']).' phone number(s) from schema.org');
        }

        $scrapedPhones = $this->extractPhoneNumbers($response, $countryContext, array_merge($existingData['TEL'] ?? [], array_column($rv['TEL'], 'number')));
        $rv['TEL']     = array_merge($rv['TEL'], $scrapedPhones);

        if (! empty($schemaData['email'])) {
            $rv['EMAIL'] = array_merge($rv['EMAIL'], array_diff($schemaData['email'], $existingData['EMAIL'] ?? []));
            $this->log('<fg=green>✓</> Found '.count($schemaData['email']).' email(s) from schema.org');
        }

        $scrapedEmails = $this->extractEmails($response, array_merge($existingData['EMAIL'] ?? [], $rv['EMAIL']));
        $rv['EMAIL']   = array_merge($rv['EMAIL'], $scrapedEmails);

        if (! empty($schemaData['vatID'])) {
            $rv['VAT_ID'] = $schemaData['vatID'];
            $this->log("<fg=green>✓</> Found VAT ID from schema.org: <fg=white>{$rv['VAT_ID']}</>");
        } else {
            $rv['VAT_ID'] = $this->extractVatId($response);
            if ($rv['VAT_ID']) {
                $this->log("<fg=green>✓</> Found VAT ID: <fg=white>{$rv['VAT_ID']}</>");
            }
        }

        $rv['MANAGING_DIRECTOR'] = $this->extractManagingDirector($response);
        if ($rv['MANAGING_DIRECTOR']) {
            $this->log("<fg=green>✓</> Found managing director: <fg=white>{$rv['MANAGING_DIRECTOR']}</>");
        }

        if (count($rv['TEL'])) {
            $this->log('<fg=green>✓</> Found '.count($rv['TEL']).' phone number(s) total');
        }
        if (count($rv['EMAIL'])) {
            $this->log('<fg=green>✓</> Found '.count($rv['EMAIL']).' email(s) total');
        }

        $rv['BUSINESS_REGISTER'] = $this->extractBusinessRegisterInfo($response);
        if ($rv['BUSINESS_REGISTER']) {
            $this->log("<fg=green>✓</> Found business register: <fg=white>{$rv['BUSINESS_REGISTER']}</>");
        }

        if (! $rv['BUSINESS_REGISTER'] && $countryContext === 'GB') {
            $rv['BUSINESS_REGISTER'] = $this->extractUkCompanyNumber($response);
            if ($rv['BUSINESS_REGISTER']) {
                $this->log("<fg=green>✓</> Found UK company number: <fg=white>{$rv['BUSINESS_REGISTER']}</>");
            }
        }

        if (! empty($schemaData['socialMedia'])) {
            foreach ($schemaData['socialMedia'] as $url) {
                $normalized = $this->normalizeSocialMediaUrl($url);
                if (! $this->isSocialMediaDuplicate($normalized, $rv['SOCIAL_MEDIA'])) {
                    $rv['SOCIAL_MEDIA'][] = $url;
                }
            }
            $this->log('<fg=green>✓</> Found '.count($schemaData['socialMedia']).' social media link(s) from schema.org');
        }

        $scrapedSocial = $this->extractSocialMediaUrls($originalHtml);
        foreach ($scrapedSocial as $url) {
            $normalized = $this->normalizeSocialMediaUrl($url);
            if (! $this->isSocialMediaDuplicate($normalized, $rv['SOCIAL_MEDIA'])) {
                $rv['SOCIAL_MEDIA'][] = $url;
            }
        }

        if (count($rv['SOCIAL_MEDIA'])) {
            $this->log('<fg=green>✓</> Found '.count($rv['SOCIAL_MEDIA']).' social media link(s) total');
        }
    }
    private function isWebmasterAddress(string $text): bool {
        $text = strtolower($text);

        $webmasterKeywords = [
            'internet-seiten wurden erstellt',
            'webseite wurde erstellt',
            'website wurde erstellt',
            'homepage wurde erstellt',
            'webdesign',
            'web design',
            'webentwicklung',
            'web entwicklung',
            'internetagentur',
            'internet agentur',
            'werbeagentur',
            'marketing&internet',
            'marketing & internet',
            'webmaster',
            'web-master',
            'programmierung',
            'softwareentwicklung',
            'it-dienstleistungen',
            'it dienstleistungen',
            'gestaltung und programmierung',
            'konzeption und realisierung',
            'technische realisierung',
            'technische umsetzung',
        ];

        foreach ($webmasterKeywords as $keyword) {
            if (strpos($text, $keyword) !== false) {
                return true;
            }
        }
        return false;
    }
    private function isAddressDuplicate(array $newAddress, array $existingAddresses): bool {
        foreach ($existingAddresses as $existing) {
            if (strcasecmp($newAddress[2], $existing[2]) === 0 &&  // street address
                strcasecmp($newAddress[3], $existing[3]) === 0 &&  // city
                $newAddress[5] === $existing[5]) {                  // postal code
                return true;
            }
        }
        return false;
    }
    private function parseExistingVcard(?string $vcard): array {
        if (empty($vcard)) {
            return ['TEL' => [], 'EMAIL' => []];
        }

        $existing = ['TEL' => [], 'EMAIL' => []];
        $lines    = explode("\n", $vcard);

        foreach ($lines as $line) {
            $line = trim($line);
            if (preg_match('/^TEL[^:]*:(.+)$/i', $line, $matches)) {
                $existing['TEL'][] = trim($matches[1]);
            } elseif (preg_match('/^EMAIL[^:]*:(.+)$/i', $line, $matches)) {
                $existing['EMAIL'][] = trim($matches[1]);
            }
        }
        return $existing;
    }
    private function determineCountryContext(string $url, array $addresses = [], array $schemaData = []): string {
        $config = config('imprint');

        if (! empty($schemaData['address']['country'])) {
            $countryCode = $this->mapCountryNameToCode($schemaData['address']['country']);
            if ($countryCode && isset($config['country_to_phone_code'][$countryCode])) {
                return $countryCode;
            }
        }

        foreach ($addresses as $address) {
            if (! empty($address[6])) { // Country field in RFC2426 format
                $country = strtoupper($address[6]);
                if (isset($config['country_to_phone_code'][$country])) {
                    return $country;
                }
            }
        }

        if (preg_match('/\.([a-z]{2,4})(?:\/|$)/i', $url, $matches)) {
            $tld = '.'.strtolower($matches[1]);
            if (isset($config['tld_to_country'][$tld])) {
                return $config['tld_to_country'][$tld];
            }
        }

        if (preg_match('/\.co\.([a-z]{2})(?:\/|$)/i', $url, $matches)) {
            $tld = '.co.'.strtolower($matches[1]);
            if (isset($config['tld_to_country'][$tld])) {
                return $config['tld_to_country'][$tld];
            }
        }
        return $config['default_country'];
    }
    private function mapCountryNameToCode(string $countryName): ?string {
        $countryName = strtolower(trim($countryName));

        $countryMap = [
            'germany'              => 'DE',
            'united kingdom'       => 'GB',
            'great britain'        => 'GB',
            'uk'                   => 'GB',
            'gb'                   => 'GB',
            'united states'        => 'US',
            'usa'                  => 'US',
            'us'                   => 'US',
            'austria'              => 'AT',
            'switzerland'          => 'CH',
            'france'               => 'FR',
            'italy'                => 'IT',
            'spain'                => 'ES',
            'netherlands'          => 'NL',
            'belgium'              => 'BE',
            'poland'               => 'PL',
            'denmark'              => 'DK',
            'sweden'               => 'SE',
            'norway'               => 'NO',
            'finland'              => 'FI',
            'ireland'              => 'IE',
            'portugal'             => 'PT',
            'greece'               => 'GR',
            'czech republic'       => 'CZ',
            'hungary'              => 'HU',
            'romania'              => 'RO',
            'bulgaria'             => 'BG',
            'croatia'              => 'HR',
            'slovakia'             => 'SK',
            'slovenia'             => 'SI',
            'lithuania'            => 'LT',
            'latvia'               => 'LV',
            'estonia'              => 'EE',
            'luxembourg'           => 'LU',
            'malta'                => 'MT',
            'cyprus'               => 'CY',
            'canada'               => 'CA',
            'australia'            => 'AU',
            'new zealand'          => 'NZ',
            'japan'                => 'JP',
            'china'                => 'CN',
            'india'                => 'IN',
            'brazil'               => 'BR',
            'mexico'               => 'MX',
            'argentina'            => 'AR',
            'south africa'         => 'ZA',
            'russia'               => 'RU',
            'turkey'               => 'TR',
            'south korea'          => 'KR',
            'singapore'            => 'SG',
            'hong kong'            => 'HK',
            'taiwan'               => 'TW',
            'thailand'             => 'TH',
            'malaysia'             => 'MY',
            'indonesia'            => 'ID',
            'philippines'          => 'PH',
            'vietnam'              => 'VN',
            'israel'               => 'IL',
            'united arab emirates' => 'AE',
            'uae'                  => 'AE',
            'saudi arabia'         => 'SA',
            'egypt'                => 'EG',

            'deutschland'            => 'DE',
            'vereinigtes königreich' => 'GB',
            'vereinigte staaten'     => 'US',
            'österreich'             => 'AT',
            'schweiz'                => 'CH',
            'frankreich'             => 'FR',
            'italien'                => 'IT',
            'spanien'                => 'ES',
            'niederlande'            => 'NL',
            'belgien'                => 'BE',
            'polen'                  => 'PL',
            'dänemark'               => 'DK',
            'schweden'               => 'SE',
            'norwegen'               => 'NO',
            'finnland'               => 'FI',
            'irland'                 => 'IE',
            'portugal'               => 'PT',
            'griechenland'           => 'GR',
            'tschechien'             => 'CZ',
            'ungarn'                 => 'HU',
            'rumänien'               => 'RO',
            'bulgarien'              => 'BG',
            'kroatien'               => 'HR',
            'slowakei'               => 'SK',
            'slowenien'              => 'SI',
            'litauen'                => 'LT',
            'lettland'               => 'LV',
            'estland'                => 'EE',
        ];

        if (strlen($countryName) === 2) {
            return strtoupper($countryName);
        }
        return $countryMap[$countryName] ?? null;
    }
    private function extractEmails(string $text, array $existingEmails = []): array {
        $emails  = [];
        $pattern = '/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/';

        if (preg_match_all($pattern, $text, $matches)) {
            foreach ($matches[1] as $email) {
                $email = strtolower(trim($email));

                if (strpos($email, 'example.') !== false ||
                    strpos($email, 'domain.') !== false ||
                    strpos($email, 'yourname@') !== false) {
                    continue;
                }

                $isDuplicate = false;
                foreach ($existingEmails as $existing) {
                    if (strtolower($existing) === $email) {
                        $isDuplicate = true;
                        break;
                    }
                }

                foreach ($emails as $alreadyFound) {
                    if (strtolower($alreadyFound) === $email) {
                        $isDuplicate = true;
                        break;
                    }
                }

                if (! $isDuplicate) {
                    $emails[] = $email;
                }
            }
        }
        return $emails;
    }
    private function extractPhoneNumbers(string $text, string $countryContext = 'DE', array $existingNumbers = []): array {
        $phoneNumbers = [];

        // Patterns with context for type detection
        $contextPatterns = [
            ['pattern' => '/(?:mobil|mobile|handy|cell)[\s.:]*([+]?[\d\s\-()\/]+)/i', 'type' => 'mobile'],
            ['pattern' => '/(?:fax|telefax)[\s.:]*([+]?[\d\s\-()\/]+)/i', 'type' => 'fax'],
            ['pattern' => '/(?:tel(?:ephone|efon|ephon)?|fon|phone|ph)[\s.:]*([+]?[\d\s\-()\/]+)/i', 'type' => 'phone'],
        ];

        foreach ($contextPatterns as $contextPattern) {
            preg_match_all($contextPattern['pattern'], $text, $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                $rawNumber     = trim($match[1]);
                $cleanedNumber = $this->formatPhoneNumber($rawNumber, $countryContext);

                if ($cleanedNumber) {
                    $isDuplicate = $this->isPhoneNumberDuplicate($cleanedNumber, array_merge($existingNumbers, $phoneNumbers));

                    if (! $isDuplicate) {
                        $phoneNumbers[] = ['number' => $cleanedNumber, 'type' => $contextPattern['type']];
                    }
                }
            }
        }

        $genericPatterns = [
            '/([+]\d{1,4}[\s\-]?\d[\d\s\-()\/]+)/i',
            '/(0\d[\d\s\-()\/]+)/i',
        ];

        foreach ($genericPatterns as $pattern) {
            preg_match_all($pattern, $text, $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                $rawNumber     = trim($match[1]);
                $cleanedNumber = $this->formatPhoneNumber($rawNumber, $countryContext);

                if ($cleanedNumber) {
                    $alreadyExists = false;
                    foreach ($phoneNumbers as $existingPhone) {
                        if ($existingPhone['number'] === $cleanedNumber) {
                            $alreadyExists = true;
                            break;
                        }
                    }

                    if (! $alreadyExists && ! $this->isPhoneNumberDuplicate($cleanedNumber, $existingNumbers)) {
                        $type           = $this->detectPhoneType($cleanedNumber);
                        $phoneNumbers[] = ['number' => $cleanedNumber, 'type' => $type];
                    }
                }
            }
        }
        return $phoneNumbers;
    }
    private function detectPhoneType(string $phoneNumber): string {
        $digits = preg_replace('/[^\d]/', '', $phoneNumber);

        if (preg_match('/^49(15|16|17)\d/', $digits)) {
            return 'mobile';
        }

        return 'phone';
    }
    private function isPhoneNumberDuplicate(string $number, array $existingNumbers): bool {
        $normalized = preg_replace('/[^\d]/', '', $number);

        foreach ($existingNumbers as $existing) {
            $existingNumber     = is_array($existing) ? $existing['number'] : $existing;
            $existingNormalized = preg_replace('/[^\d]/', '', $existingNumber);

            if ($normalized === $existingNormalized) {
                return true;
            }
        }
        return false;
    }

    /**
     * Format phone number to ISO format: +49 123 12345678-20
     */
    private function formatPhoneNumber(string $rawNumber, string $countryContext = 'DE'): ?string {
        $config = config('imprint');

        $cleaned = preg_replace('/[^\d+\-]/', '', $rawNumber);

        if (strlen(preg_replace('/[^\d]/', '', $cleaned)) < 6) {
            return null;
        }

        if (strlen(preg_replace('/[^\d]/', '', $cleaned)) > 20) {
            return null;
        }

        if (preg_match('/^0(\d+)(-?\d*)$/', $cleaned, $matches)) {
            $mainNumber = $matches[1];
            $extension  = $matches[2];
            $formatted  = '+49 '.$this->formatGermanNumber($mainNumber);
            if ($extension) {
                $formatted .= $extension;
            }

            return VcardTrait::normalizePhoneNumber($formatted, $countryContext);
        }

        $config            = config('imprint');
        $knownCountryCodes = array_keys($config['country_codes']);

        usort($knownCountryCodes, function ($a, $b) {
            return strlen($b) - strlen($a);
        });

        foreach ($knownCountryCodes as $countryCodePattern) {
            $codeDigits = substr($countryCodePattern, 1); // Remove the +
            if (preg_match('/^\+'.preg_quote($codeDigits).'(\d+)(-?\d*)$/', $cleaned, $matches)) {
                $countryCode = $codeDigits;
                $mainNumber  = $matches[1];
                $extension   = $matches[2];

                if ($countryCode === '49') { // Germany
                    $formatted = '+49 '.$this->formatGermanNumber($mainNumber);
                } else {
                    $formatted = '+'.$countryCode.' '.$this->formatInternationalNumber($mainNumber);
                }

                if ($extension) {
                    $formatted .= $extension;
                }

                return VcardTrait::normalizePhoneNumber($formatted, $countryContext);
            }
        }

        $digitsOnly = preg_replace('/[^\d]/', '', $cleaned);
        if (strlen($digitsOnly) >= 6 && strlen($digitsOnly) <= 20) {
            $countryCode = $config['country_to_phone_code'][$countryContext] ?? '+49';

            if ($countryContext === 'DE') {
                $formatted = $countryCode.' '.$this->formatGermanNumber($digitsOnly);
            } else {
                $formatted = $countryCode.' '.$this->formatInternationalNumber($digitsOnly);
            }

            return VcardTrait::normalizePhoneNumber($formatted, $countryContext);
        }
        return null;
    }

    private function formatGermanNumber(string $number): string {

        if (strlen($number) >= 8) {
            if (in_array(substr($number, 0, 3), ['030', '040', '089', '069', '221', '211', '228', '231', '241'])) {
                return substr($number, 0, 3).' '.$this->formatPhoneNumberPart(substr($number, 3));
            } elseif (strlen($number) >= 9 && $this->isValidGermanAreaCode(substr($number, 0, 4))) {
                return substr($number, 0, 4).' '.$this->formatPhoneNumberPart(substr($number, 4));
            } elseif (strlen($number) >= 10 && $this->isValidGermanAreaCode(substr($number, 0, 5))) {
                return substr($number, 0, 5).' '.$this->formatPhoneNumberPart(substr($number, 5));
            } elseif (strlen($number) >= 8 && in_array(substr($number, 0, 2), ['30', '40', '89', '69'])) {
                return substr($number, 0, 2).' '.$this->formatPhoneNumberPart(substr($number, 2));
            } else {
                return substr($number, 0, 3).' '.$this->formatPhoneNumberPart(substr($number, 3));
            }
        }
        return $number;
    }
    private function isValidGermanAreaCode(string $code): bool {
        $common4DigitCodes = [
            '2171', '2173', '2174', '2175', '2181', '2182', '2183', '2191', '2192',
            '3371', '3372', '3373', '3374', '3375', '3381', '3382', '3383', '3384',
            '4171', '4172', '4173', '4174', '4175', '4181', '4182', '4183', '4191',
            '5171', '5172', '5173', '5174', '5175', '5181', '5182', '5183', '5191',
            '6171', '6172', '6173', '6174', '6175', '6181', '6182', '6183', '6191',
            '7803', '8031', // Your specific examples
        ];

        $common5DigitCodes = [
            '33201', '33202', '33203', '33204', '33205', '33206', '33207', '33208',
        ];
        return in_array($code, $common4DigitCodes) || in_array($code, $common5DigitCodes);
    }
    private function formatPhoneNumberPart(string $numberPart): string {
        if (strlen($numberPart) > 8) {
            return preg_replace('/(\d{4})(\d{4})(.*)/', '$1 $2$3', $numberPart);
        } elseif (strlen($numberPart) > 6) {
            $mid = intval(strlen($numberPart) / 2);
            return substr($numberPart, 0, $mid).' '.substr($numberPart, $mid);
        }
        return $numberPart;
    }
    private function formatInternationalNumber(string $number): string {
        return $this->formatPhoneNumberPart($number);
    }

    /**
     * Extract VAT ID (Umsatzsteuer Identnummer)
     * Returns format: "DE153078203" (without spaces)
     */
    private function extractVatId(string $text): ?string {
        // Patterns for VAT ID - more specific first
        $patterns = [
            // Pattern 1: "Umsatzsteuer Identnummer: DE 153078203" or "Umsatzsteuer-Identifikationsnummer"
            '/umsatzsteuer[\s\-]*(?:ident|id)[^\n:]*?[\s:]+([A-Z]{2}[\s]*[0-9]{6,12})/i',

            // Pattern 2: "USt-IdNr.: DE123456789"
            '/ust[\s\-\.]*id[\s\-\.]*nr[.\s:]*([A-Z]{2}[\s]*[0-9]{6,12})/i',

            // Pattern 3: "VAT ID: DE123456789"
            '/vat[\s\-\.]*id[\s:]*([A-Z]{2}[\s]*[0-9]{6,12})/i',
        ];

        foreach ($patterns as $patternIndex => $pattern) {
            if (preg_match($pattern, $text, $matches)) {
                $vatId = preg_replace('/\s/', '', $matches[1]);

                // Validate format: 2 letters + 6-12 digits
                if (preg_match('/^[A-Z]{2}[0-9]{6,12}$/', strtoupper($vatId))) {
                    $this->log("VAT ID found with pattern $patternIndex: $vatId");
                    return strtoupper($vatId);
                }
            }
        }
        return null;
    }

    private function extractManagingDirector(string $text): ?string {
        // Patterns for managing director - ordered by priority
        $patterns = [
            // Pattern 1: "Vertretungsberechtigter: Rainer Sketsch" (specific match after colon/newline)
            '/(?:vertretungsberechtigter|geschäftsführer|geschäftsführung)[\s:]+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/i',

            // Pattern 2: "Inhaber: Max Mustermann"
            '/inhaber[\s:]+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $matches)) {
                $name = trim($matches[1]);

                if (preg_match('/^(ansprechpartner|kontakt|tel|email|fax)/i', $name)) {
                    continue;
                }

                $name = preg_replace('/[,\n].*$/', '', $name);
                $name = trim($name);

                $wordCount = count(explode(' ', $name));
                if ($wordCount >= 2 && $wordCount <= 4 && strlen($name) > 3 && strlen($name) < 50) {
                    return $name;
                }
            }
        }
        return null;
    }

    /**
     * Extract German business register information (Handelsregister)
     * Returns format: "HRB|221011|München" or null if not found
     */
    private function extractBusinessRegisterInfo(string $text): ?string {
        $patterns = [
            // Pattern 1: "Handelsregister Nummer: Amtsgericht Walsrode HRB 100180"
            '/(?:handelsregister[^:]*?:?)[\s]*(?:amtsgericht|ag|registergericht)[\s]*([a-zA-ZäöüßÄÖÜ\s]+?)[\s,]+([hr][rb][ab])[\s]*([0-9]+)/i',

            // Pattern 2: "Amtsgericht München HRB 123456"
            '/(?:amtsgericht|ag|registergericht)[\s]*([a-zA-ZäöüßÄÖÜ\s]+?)[\s,]*([hr][rb][ab])[\s]*([0-9]+)/i',

            // Pattern 3: "HRB 123456 Amtsgericht München"
            '/([hr][rb][ab])[\s]*([0-9]+)[\s,]*(?:amtsgericht|ag|registergericht)[\s]*([a-zA-ZäöüßÄÖÜ\s]+)/i',

            // Pattern 4: "Registergericht: München, HRB 123456"
            '/(?:registergericht|amtsgericht)[\s:]*([a-zA-ZäöüßÄÖÜ\s]+?)[\s,]+([hr][rb][ab])[\s]*([0-9]+)/i',

            // Pattern 5: "HRB 123456 München" (simple format)
            '/([hr][rb][ab])[\s]*([0-9]+)[\s,]*([a-zA-ZäöüßÄÖÜ\s]{3,})/i',
        ];

        foreach ($patterns as $patternIndex => $pattern) {
            if (preg_match($pattern, $text, $matches)) {
                // Pattern 0: court, type, number
                // Pattern 1: court, type, number
                // Pattern 2: type, number, court
                // Pattern 3: court, type, number
                // Pattern 4: type, number, court

                if ($patternIndex === 2 || $patternIndex === 4) { // Type, number, court
                    $registerType   = strtoupper(trim($matches[1]));
                    $registerNumber = trim($matches[2]);
                    $court          = trim($matches[3]);
                } else { // Court, type, number (patterns 0, 1, 3)
                    $court          = trim($matches[1]);
                    $registerType   = strtoupper(trim($matches[2]));
                    $registerNumber = trim($matches[3]);
                }

                $court = preg_replace('/^(am\s+|der\s+|des\s+)/i', '', $court);
                $court = preg_replace('/\s+(amtsgericht|ag|registergericht)$/i', '', $court);
                $court = trim($court);

                if (! in_array($registerType, ['HRA', 'HRB', 'GNR', 'PR'])) {
                    continue;
                }

                if (! preg_match('/^\d+$/', $registerNumber)) {
                    continue;
                }

                if (strlen($court) < 3 || strlen($court) > 50) {
                    continue;
                }
                return $registerType.'|'.$registerNumber.'|'.$court;
            }
        }
        return null;
    }

    private function extractUkCompanyNumber(string $text): ?string {
        $patterns = [
            '/company\s+reg(?:istration)?\.?\s+no\.?[\s:]*(\d{8})/i',
            '/company\s+no\.?[\s:]*(\d{8})/i',
            '/reg(?:istered)?\.?\s+no\.?[\s:]*(\d{8})/i',
            '/registration\s+number[\s:]*(\d{8})/i',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $matches)) {
                return 'UK|'.$matches[1];
            }
        }
        return null;
    }
    private function extractSchemaOrgData(DOMDocument $doc, DOMXPath $xpath): array {
        $data = [
            'name'        => null,
            'address'     => null,
            'telephone'   => [],
            'email'       => [],
            'vatID'       => null,
            'socialMedia' => [],
        ];

        $schemaOrg = $xpath->query('//script[@type="application/ld+json"]');
        foreach ($schemaOrg as $script) {
            $json = json_decode($script->textContent, true);
            if (! $json) {
                continue;
            }

            $entities = [];
            if (isset($json['@graph']) && is_array($json['@graph'])) {
                $entities = $json['@graph'];
            } else {
                $entities = [$json];
            }

            foreach ($entities as $entity) {
                if (! isset($entity['@type'])) {
                    continue;
                }

                $type = $entity['@type'];
                if (is_array($type)) {
                    $type = $type[0];
                }

                if (in_array($type, ['Organization', 'LocalBusiness', 'Corporation', 'Company'])) {
                    if (! $data['name'] && ! empty($entity['name'])) {
                        $data['name'] = trim($entity['name']);
                    }

                    if (! $data['address'] && ! empty($entity['address'])) {
                        $addr = $entity['address'];
                        if (is_array($addr) && isset($addr['@type']) && $addr['@type'] === 'PostalAddress') {
                            $data['address'] = [
                                'street'     => $addr['streetAddress'] ?? '',
                                'city'       => $addr['addressLocality'] ?? '',
                                'region'     => $addr['addressRegion'] ?? '',
                                'postalCode' => $addr['postalCode'] ?? '',
                                'country'    => $addr['addressCountry'] ?? '',
                            ];
                        }
                    }

                    if (! empty($entity['telephone'])) {
                        $phones = is_array($entity['telephone']) ? $entity['telephone'] : [$entity['telephone']];
                        foreach ($phones as $phone) {
                            if (! in_array($phone, $data['telephone'])) {
                                $data['telephone'][] = $phone;
                            }
                        }
                    }

                    if (! empty($entity['email'])) {
                        $emails = is_array($entity['email']) ? $entity['email'] : [$entity['email']];
                        foreach ($emails as $email) {
                            $email = preg_replace('/^mailto:/i', '', $email);
                            if (! in_array($email, $data['email']) && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                                $data['email'][] = $email;
                            }
                        }
                    }

                    if (! $data['vatID'] && ! empty($entity['vatID'])) {
                        $data['vatID'] = $entity['vatID'];
                    }

                    if (! empty($entity['sameAs'])) {
                        $sameAs = is_array($entity['sameAs']) ? $entity['sameAs'] : [$entity['sameAs']];
                        foreach ($sameAs as $url) {
                            if (preg_match('/(facebook|twitter|x\.com|instagram|linkedin|youtube|xing)\.com/i', $url)) {
                                if (! in_array($url, $data['socialMedia'])) {
                                    $data['socialMedia'][] = $url;
                                }
                            }
                        }
                    }
                }
            }
        }
        return $data;
    }
    private function extractCompanyName(DOMDocument $doc, DOMXPath $xpath): ?string {
        $schemaData = $this->extractSchemaOrgData($doc, $xpath);
        if ($schemaData['name']) {
            return $schemaData['name'];
        }

        $ogSiteName = $xpath->query('//meta[@property="og:site_name"]');
        if ($ogSiteName->length > 0) {
            $siteNameNode = $ogSiteName->item(0);
            if ($siteNameNode instanceof \DOMElement) {
                $name = $siteNameNode->getAttribute('content');
                if (! empty($name) && strlen($name) > 2 && strlen($name) < 100) {
                    return trim($name);
                }
            }
        }

        $title = $xpath->query('//title');
        if ($title->length > 0 && $title->item(0)) {
            $titleText = $title->item(0)->textContent;
            $parts     = preg_split('/[\-\|–—]/', $titleText);
            if (count($parts) > 0) {
                $name = trim($parts[0]);
                if (strlen($name) > 2 && strlen($name) < 100 && preg_match('/[a-zA-Z]{2,}/', $name)) {
                    return $name;
                }
            }
        }

        $h1 = $xpath->query('//h1');
        if ($h1->length > 0 && $h1->item(0)) {
            $name = trim($h1->item(0)->textContent);
            if (strlen($name) > 2 && strlen($name) < 100) {
                return $name;
            }
        }
        return null;
    }
    private function extractSocialMediaUrls(string $html): array {
        $socialMedia = [];
        $platforms   = [
            'facebook'  => '/(?:https?:\/\/)?(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i',
            'twitter'   => '/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9._-]+/i',
            'instagram' => '/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i',
            'linkedin'  => '/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._-]+/i',
            'youtube'   => '/(?:https?:\/\/)?(?:www\.)?youtube\.com\/(?:channel|c|user)\/[a-zA-Z0-9._-]+/i',
            'xing'      => '/(?:https?:\/\/)?(?:www\.)?xing\.com\/(?:profile|companies)\/[a-zA-Z0-9._-]+/i',
        ];

        foreach ($platforms as $platform => $pattern) {
            if (preg_match_all($pattern, $html, $matches)) {
                foreach ($matches[0] as $url) {
                    $url = preg_replace('/^(?!https?:\/\/)/', 'https://', $url);
                    if (! in_array($url, $socialMedia)) {
                        $socialMedia[] = $url;
                    }
                }
            }
        }
        return $socialMedia;
    }
    private function extractGermanAddresses(string $response, array &$rv): void {
        $regex = '\\n(?:D-)?(\\d{5})\\s+([^\\n]*?)\\n';
        $regex = str_repeat('\\n([^\\n]*?)', self::EMPTY_LINES_BEFORE).$regex;
        $regex .= str_repeat('([^\\n]*?)\\n', self::EMPTY_LINES_AFTER);

        preg_match_all("/$regex/is", $response, $addresses, PREG_SET_ORDER);

        foreach ($addresses as $a) {
            $fullText = implode(' ', $a);
            if ($this->isWebmasterAddress($fullText)) {
                continue;
            }

            $conv = $this->reduce($a);

            strlen($rv['FN']) || $rv['FN']   = $conv[0];
            strlen($rv['ORG']) || $rv['ORG'] = $conv[0];

            $rfc = [
                '',
                count($conv) > 4 + self::EMPTY_LINES_AFTER ? $conv[2] : '',
                $conv[1],
                $conv[count($conv) - self::EMPTY_LINES_AFTER - 1],
                '',
                $conv[count($conv) - self::EMPTY_LINES_AFTER - 2],
                'DE',
            ];

            if (! $this->isAddressDuplicate($rfc, $rv['ADR'])) {
                $rv['ADR'][] = $rfc;
            }
        }
    }
    private function extractUkAddresses(string $response, array &$rv): void {
        $regex = '([A-Z]{1,2}\\d{1,2}[A-Z]?\\s*\\d[A-Z]{2})';

        preg_match_all("/$regex/is", $response, $postcodeMatches, PREG_OFFSET_CAPTURE);

        foreach ($postcodeMatches[0] as $match) {
            $postcode = trim($match[0]);
            $offset   = $match[1];

            $contextBefore = substr($response, max(0, $offset - 300), 300);

            // Try comma-separated format first (e.g., "Unit 13, Street, City, County, AL2 2DQ")
            $commaPattern = '/([^,\n]+(?:,\s*[^,\n]+)*),\s*'.preg_quote($postcode, '/').'/i';
            if (preg_match($commaPattern, $contextBefore, $commaMatch)) {
                $parts = array_map('trim', explode(',', $commaMatch[1]));
                $parts = array_filter($parts); // Remove empty parts

                if (count($parts) >= 2) {
                    $fullText = implode(' ', $parts);
                    if ($this->isWebmasterAddress($fullText)) {
                        continue;
                    }

                    $city   = $parts[count($parts) - 1]; // Last part before postcode
                    $region = count($parts) > 2 ? $parts[count($parts) - 2] : ''; // Second to last (county)
                    $street = implode(', ', array_slice($parts, 0, count($parts) - (count($parts) > 2 ? 2 : 1)));

                    if (! empty($city) && ! empty($street)) {
                        $rfc = [
                            '',
                            '',
                            $street,
                            $city,
                            $region,
                            $postcode,
                            'GB',
                        ];

                        if (! $this->isAddressDuplicate($rfc, $rv['ADR'])) {
                            $rv['ADR'][] = $rfc;

                            continue;
                        }
                    }
                }
            }

            $lines = array_filter(explode("\n", $contextBefore));
            $lines = array_reverse($lines);

            if (count($lines) < 2) {
                continue;
            }

            $fullText = implode(' ', $lines);
            if ($this->isWebmasterAddress($fullText)) {
                continue;
            }

            $city    = isset($lines[1]) ? trim($lines[1]) : '';
            $street  = isset($lines[2]) ? trim($lines[2]) : '';
            $company = isset($lines[3]) ? trim($lines[3]) : '';

            if (empty($city) || empty($street)) {
                continue;
            }

            strlen($rv['FN']) || $rv['FN']   = $company;
            strlen($rv['ORG']) || $rv['ORG'] = $company;

            $rfc = [
                '',
                $company && $company !== $street ? $company : '',
                $street,
                $city,
                '',
                $postcode,
                'GB',
            ];

            if (! $this->isAddressDuplicate($rfc, $rv['ADR'])) {
                $rv['ADR'][] = $rfc;
            }
        }
    }
    private function extractUsAddresses(string $response, array &$rv): void {
        $regex = '\\n([A-Z]{2})\\s+(\\d{5}(?:-\\d{4})?)\\s*\\n';
        $regex = str_repeat('\\n([^\\n]*?)', 3).$regex;

        preg_match_all("/$regex/is", $response, $addresses, PREG_SET_ORDER);

        foreach ($addresses as $a) {
            $fullText = implode(' ', $a);
            if ($this->isWebmasterAddress($fullText)) {
                continue;
            }

            $state   = trim($a[count($a) - 2]);
            $zip     = trim($a[count($a) - 1]);
            $city    = trim($a[count($a) - 3]);
            $street  = trim($a[count($a) - 4]);
            $company = trim($a[count($a) - 5]);

            strlen($rv['FN']) || $rv['FN']   = $company;
            strlen($rv['ORG']) || $rv['ORG'] = $company;

            $rfc = [
                '',
                '',
                $street,
                $city,
                $state,
                $zip,
                'US',
            ];

            if (! $this->isAddressDuplicate($rfc, $rv['ADR'])) {
                $rv['ADR'][] = $rfc;
            }
        }
    }

    /**
     * Normalize social media URL for comparison (twitter.com -> x.com, remove trailing slash, remove www)
     */
    private function normalizeSocialMediaUrl(string $url): string {
        $url = preg_replace('/twitter\.com/i', 'x.com', $url);

        $url = preg_replace('/\/\/www\./i', '//', $url);

        $url = rtrim($url, '/');

        return strtolower($url);
    }

    private function isSocialMediaDuplicate(string $normalizedUrl, array $existingUrls): bool {
        foreach ($existingUrls as $existing) {
            $normalizedExisting = $this->normalizeSocialMediaUrl($existing);
            if ($normalizedUrl === $normalizedExisting) {
                return true;
            }
        }
        return false;
    }
    private function emitJson(array $payload): void {
        $json = json_encode($payload);

        if ($this->console) {
            $this->console->info($json);
            return;
        }

        file_put_contents('php://stdout', $json.PHP_EOL);
    }
    private function log(string $message): void {
        $message = preg_replace('/<fg=\w+>|<\/>/', '', $message);
        file_put_contents('php://stderr', $message.PHP_EOL);
    }
}
