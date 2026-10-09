<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Contracts\Support\Arrayable;
use JsonSerializable;

class Vcard implements Arrayable, JsonSerializable {
    private const PHOTO_CACHE_SECONDS = 86400;

    private array $rows = [];

    public function __construct(string $vcardString = '') {
        $this->importString($vcardString);
    }
    public function importString(string $vcardString): self {
        $vcardString = html_entity_decode($vcardString);
        $vcardString = preg_replace("/\r\n|\r/", "\n", $vcardString);
        $vcardString = preg_replace("/\n[ \t]/", '', $vcardString);
        $vcardString = preg_replace("/\n+/", "\n", $vcardString);
        $vcardString = trim($vcardString);
        foreach (explode("\n", $vcardString) as $line) {
            if ($line && ! preg_match('/^(BEGIN|END|VERSION|UID|REV|CLASS):/i', $line)) {
                $this->rows[] = new VcardRow($line);
            }
        }
        return $this;
    }

    /** @return array{string, string} */
    public static function splitName(string $name): array {
        $parts = explode(' ', trim($name), 2);
        return [$parts[0], trim($parts[1] ?? '')];
    }

    public static function forName(string $name): self {
        [$firstName, $familyName] = self::splitName($name);
        return (new self)
            ->setProperty('FN', trim($name))
            ->setProperty('N', [$familyName, $firstName, '', '', '']);
    }
    public function getRows(): array {
        return $this->rows;
    }
    public function getAttr(string $name): array {
        $values = [];
        foreach ($this->rows as $row) {
            if ($row->getName() === strtoupper($name)) {
                $values[] = $row->getValues();
            }
        }
        return $values;
    }
    public function getFirstAttr(string $name, $default = null): ?array {
        $values = $this->getAttr($name);
        return (count($values) === 0) ? $default : $values[0];
    }
    public function getFirstValue(string $name, $default = null): ?string {
        $values = $this->getFirstAttr($name);
        return $values ? $values[0] : $default;
    }
    public function addRow(VcardRow $row): self {
        $this->rows[] = $row;
        return $this;
    }
    public function setProperty(string $name, $values, array $parameters = []): self {
        if (! is_array($values)) {
            $values = [$values];
        }
        $paramStr = '';
        foreach ($parameters as $key => $vals) {
            $vals = (array)$vals;
            $paramStr .= ";$key=".implode(',', $vals);
        }
        $this->addRow(new VcardRow("$name$paramStr:".implode(';', $values)));
        return $this;
    }
    public function remove(string|array $name, string ...$filters): self {
        $nameArray = is_array($name) ? $name : [$name];
        $nameArray = array_map(fn ($_) => strtoupper($_), $nameArray);
        return $this->removeWhere(function (VcardRow $row) use ($nameArray, $filters) {
            if (! in_array($row->getName(), $nameArray)) {
                return false;
            }
            if (empty($filters)) {
                return true;
            }
            foreach ($filters as $filter) {
                [$param, $value] = array_pad(explode(':', $filter, 2), 2, '');
                if ($row->hasParameter($param, $value)) {
                    return true;
                }
            }
            return false;
        });
    }
    public function removeWhere(callable $predicate): self {
        $this->rows = array_values(array_filter($this->rows, fn ($row) => ! $predicate($row)));
        return $this;
    }
    public function removeByParam(string $name, string $paramKey, string $paramValue): self {
        return $this->remove($name, "$paramKey:$paramValue");
    }
    public function mergeWith(self $other): self {
        foreach ($other->rows as $row) {
            $this->rows[] = $row;
        }
        return $this;
    }
    public static function fromStrings(?string ...$vcards): self {
        $result = new self;
        foreach ($vcards as $vcard) {
            if ($vcard) {
                $result->mergeWith(new self($vcard));
            }
        }
        return $result;
    }
    public function compact(): self {
        return $this->removeWhere(function (VcardRow $row) {
            if (! in_array($row->getName(), ['FN', 'N', 'TEL', 'EMAIL'])) {
                return true;
            }
            if ($row->getName() === 'TEL' && $row->hasParameter('TYPE', 'emergency')) {
                return true;
            }
            return false;
        });
    }
    public function forCardDAV(): self {
        return $this->removeWhere(function (VcardRow $row) {
            if (str_starts_with($row->getName(), 'X-')) {
                return true;
            }
            if ($row->getName() === 'TEL' && $row->hasParameter('TYPE', 'emergency')) {
                return true;
            }
            if ($row->getName() === 'RELATED' && $row->hasParameter('TYPE', 'emergency')) {
                return true;
            }
            return false;
        });
    }
    public function toCardArray($reference): array {
        $rev    = Carbon::parse($reference->updated_at)->format('YmdHis');
        $cardId = "$reference->class-$reference->id";
        $etag   = $cardId.'_'.$rev;
        $vcard  = $this->forCardDAV()->toVCardString();
        return [
            'id'            => $cardId,
            'addressbookid' => $cardId,
            'carddata'      => $vcard,
            'uri'           => "$etag.vcf",
            'etag'          => $etag,
            'size'          => strlen($vcard),
        ];
    }
    public function getPhoto(): string {
        $photo = $this->getFirstValue('PHOTO');
        if ($photo) {
            return ltrim($photo, ',');
        }

        $defaultPath = public_path('icons/company.jpg');
        if (file_exists($defaultPath)) {
            return base64_encode(file_get_contents($defaultPath));
        }

        return 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAANSURBVHhe7cExAQAAAMKg9U9tCU+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOBvA8YgAAFNr4A0AAAAAElFTkSuQmCC';
    }
    public function getPhotoResponse($defaultPath = null) {
        $binary = base64_decode($this->getPhoto());
        $etag   = '"'.hash('sha256', $binary).'"';

        $headers = [
            'Content-Type'  => 'image/png',
            'Cache-Control' => 'private, max-age='.self::PHOTO_CACHE_SECONDS.', stale-while-revalidate=604800',
            'ETag'          => $etag,
        ];

        if (trim(request()->header('If-None-Match', '')) === $etag) {
            return response()->noContent(304, $headers);
        }

        return response()->make($binary, 200, $headers + ['Content-Length' => strlen($binary)]);
    }
    public function wrapped(string $vcard): string {
        return "BEGIN:VCARD\nVERSION:3.0\n$vcard\nEND:VCARD";
    }
    public function unwrapped(string $vcard): string {
        return preg_replace("/^BEGIN:VCARD\n|VERSION:.*\n|END:VCARD\n?$/i", '', $vcard);
    }
    public function cleaned(): string {
        return $this->toVCardString(false);
    }
    public function getAddressBookOnly(): string {
        return $this->cleaned();
    }
    public function getCountryCode(): ?string {
        $adr = $this->getFirstAttr('ADR');
        if (! $adr || count($adr) < 7) {
            return null;
        }
        return strtoupper(trim($adr[6] ?? ''));
    }
    public function needsVatHandling(): bool {
        $countryCode = $this->getCountryCode();
        if (! $countryCode) {
            return true;
        }
        $euCountries = collect(config('eu.countries'));
        return $euCountries->contains($countryCode);
    }
    public function toVCardString(bool $includeEnvelope = true): string {
        $content = implode("\n", array_map('strval', $this->rows));
        return $includeEnvelope ? $this->wrapped($content) : $content;
    }
    public function __toString(): string {
        return $this
            ->remove(['PHOTO', 'VERSION', 'UID', 'REV', 'CLASS'])
            ->toVCardString(false);
    }
    public function jsonSerialize(): mixed {
        return $this->__toString();
    }
    public function toArray(): array|string {
        return $this->__toString();
    }
}
