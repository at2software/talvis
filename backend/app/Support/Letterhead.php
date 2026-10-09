<?php

namespace App\Support;

use App\Models\Company;
use App\Models\Param;
use Illuminate\Http\UploadedFile;

class Letterhead {
    public const SENDER_TOKENS   = ['companyName', 'companyAddress', 'companyStreet', 'companyPostcode', 'companyCity', 'companyCountry', 'companyWeb', 'companyMail', 'companyPhone', 'companyFax', 'companyOwners', 'companyRegisterNumber', 'companyRegisterCourt', 'companyVatId', 'companyTaxId', 'companyIban', 'companyBic', 'companyContact', 'companyRegistration', 'companyBankDetails', 'companyHeader', 'senderAddress', 'place', 'logo'];
    public const DOCUMENT_TOKENS = ['documentTitle', 'address', 'headerInfo', 'dayNow', 'content', 'footerContext', 'pageLabel', 'pageOfLabel', 'pageCount'];
    public const LOGO_SOURCES    = ['[logo]', 'pdf/logo.png', 'pdf/at2_logo.png'];
    private const SHIPPED_DIR    = 'pdf';
    private const CUSTOM_DIR     = 'app/pdf';
    private const HTML           = 'template.html';
    private const CSS            = 'styles.css';
    private const SHIPPED_LOGOS  = ['logo.png', 'at2_logo.png'];
    private const BLANK_IMAGE    = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    public static function html(): string {
        return self::read(self::HTML);
    }
    public static function css(): string {
        return self::read(self::CSS);
    }
    public static function isCustomized(): bool {
        return file_exists(self::customPath(self::HTML)) || file_exists(self::customPath(self::CSS));
    }
    public static function save(string $html, string $css): void {
        self::ensureCustomDir();
        file_put_contents(self::customPath(self::HTML), $html);
        file_put_contents(self::customPath(self::CSS), $css);
    }
    public static function reset(): void {
        foreach ([self::HTML, self::CSS] as $file) {
            @unlink(self::customPath($file));
        }
    }
    public static function customLogo(): ?string {
        return glob(self::customPath('logo.*'))[0] ?? null;
    }
    public static function storeLogo(UploadedFile $file): void {
        self::removeLogo();
        self::ensureCustomDir();
        $file->move(self::customPath(''), 'logo.'.strtolower($file->guessExtension() ?: $file->getClientOriginalExtension()));
    }
    public static function removeLogo(): void {
        foreach (glob(self::customPath('logo.*')) as $path) {
            @unlink($path);
        }
    }
    public static function logoDataUri(): string {
        $path = self::customLogo() ?? collect(self::SHIPPED_LOGOS)
            ->map(fn ($_) => public_path(self::SHIPPED_DIR.'/'.$_))
            ->first(fn ($_) => file_exists($_));
        if (! $path) {
            return self::BLANK_IMAGE;
        }
        return 'data:'.(mime_content_type($path) ?: 'image/png').';base64,'.base64_encode(file_get_contents($path));
    }
    public static function render(?string $html = null, ?string $css = null, string $lang = 'de'): string {
        $html ??= self::html();
        $css ??= self::css();
        $css   = preg_replace('/url\(\s*([\'"]?)(?!https?:|data:|\/|#)/i', 'url($1'.self::SHIPPED_DIR.'/', $css);
        $style = "<style>\n$css\n</style>";
        $link  = '/<link\b[^>]*href=["\'][^"\']*styles\.css["\'][^>]*>/i';
        $html  = preg_match($link, $html)
            ? preg_replace_callback($link, fn () => $style, $html, 1)
            : preg_replace_callback('/<head\b[^>]*>/i', fn ($_) => $_[0].$style, $html, 1);
        $html = self::replaceLogo(preg_replace($link, '', $html));
        return strtr($html, self::bracketed(self::tokens($lang)));
    }
    public static function replaceLogo(string $html): string {
        $sources = implode('|', array_map(fn ($_) => preg_quote($_, '/'), self::LOGO_SOURCES));
        return preg_replace('/(src=)(["\'])(?:'.$sources.')\2/i', '$1$2'.self::logoDataUri().'$2', $html);
    }
    public static function tokens(string $lang = 'de'): array {
        $sender  = Company::senderData();
        $param   = fn (string $key) => trim((string)(Param::get($key)->value ?? ''));
        $esc     = fn (array $values) => array_map(fn ($_) => e($_), $values);
        $country = config('country-codes')[$sender['country']] ?? $sender['country'];
        $values  = $esc([
            'companyName'           => $sender['name'],
            'companyStreet'         => $sender['street'],
            'companyPostcode'       => $sender['zip'],
            'companyCity'           => $sender['city'],
            'companyCountry'        => $country,
            'companyWeb'            => $sender['url'],
            'companyMail'           => $sender['email'],
            'companyPhone'          => $sender['phone'],
            'companyFax'            => $param('ME_FAX'),
            'companyOwners'         => $sender['owners'],
            'companyRegisterNumber' => $param('ME_HREG_NO'),
            'companyRegisterCourt'  => $param('ME_HREG_NAME'),
            'companyVatId'          => $sender['vat_id'] ?: $param('ME_VATID'),
            'companyTaxId'          => $sender['tax_id'],
            'companyIban'           => $sender['iban'],
            'companyBic'            => $sender['bic'] ?: $param('ME_SWIFT'),
        ]);
        $label = fn (string $key) => __('pdf.'.$key, [], $lang);
        $lines = function (array $rows) {
            $rows = array_filter($rows, fn ($_) => $_ !== '');
            return implode('<br />', array_map(fn ($k, $v) => is_int($k) ? $v : "$k: $v", array_keys($rows), $rows));
        };

        $values['companyAddress']      = implode(' | ', array_filter([$values['companyStreet'], trim($values['companyPostcode'].' '.$values['companyCity']), $values['companyCountry']]));
        $values['senderAddress']       = implode(' | ', array_filter([$values['companyName'], $values['companyAddress']]));
        $values['place']               = $values['companyCity'];
        $values['city']                = $values['companyCity'];
        $values['companyContact']      = $lines([
            $label('web')   => $values['companyWeb'],
            $label('email') => $values['companyMail'],
            $label('phone') => $values['companyPhone'],
            $label('fax')   => $values['companyFax'],
        ]);
        $values['companyRegistration'] = $lines([
            $label('register_number') => $values['companyRegisterNumber'],
            $values['companyRegisterCourt'],
            $label('company_owners')  => $values['companyOwners'],
            $label('vat_id')          => $values['companyVatId'],
            $label('tax_id')          => $values['companyTaxId'],
        ]);
        $values['companyBankDetails'] = $lines([
            'IBAN' => $values['companyIban'],
            'BIC'  => $values['companyBic'],
        ]);
        $values['companyHeader']      = '<table><tr><td>'.$values['companyContact'].'</td><td>'.$values['companyRegistration'].'</td><td>'.$values['companyBankDetails'].'</td></tr></table>';
        return $values;
    }
    public static function bracketed(array $tokens): array {
        return collect($tokens)->mapWithKeys(fn ($v, $k) => ["[$k]" => (string)$v])->all();
    }
    private static function read(string $file): string {
        $path = file_exists(self::customPath($file)) ? self::customPath($file) : public_path(self::SHIPPED_DIR.'/'.$file);
        return file_exists($path) ? file_get_contents($path) : '';
    }
    private static function customPath(string $file): string {
        return storage_path(self::CUSTOM_DIR.'/'.$file);
    }
    private static function ensureCustomDir(): void {
        if (! is_dir(self::customPath(''))) {
            mkdir(self::customPath(''), 0775, true);
        }
    }
}
