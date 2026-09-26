<?php

namespace App\Models;

use App\Actions\CancelInvoiceAction;
use App\Actions\CreateInvoiceAction;
use App\Actions\UpdateInvoiceStatisticsAction;
use App\Builders\InvoiceBuilder;
use App\Casts\CurrencyFormatCast;
use App\Casts\PrecomputedAuth;
use App\Enums\InvoiceItemType;
use App\Jobs\SendInvoiceMailJob;
use App\Jobs\SendInvoiceReminderJob;
use App\Services\InvoiceItemEnhancementService;
use App\Services\InvoicePdfService;
use App\Traits\HasInvoiceItemsTrait;
use App\Traits\LogsDeletionTrait;
use App\Traits\PrecomputedTrait;
use horstoeko\zugferd\codelists\ZugferdInvoiceType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Artisan;

class Invoice extends BaseModel {
    use HasFactory;
    use HasInvoiceItemsTrait;
    use LogsDeletionTrait;
    use PrecomputedTrait;
    use SoftDeletes;

    const kNET                    = 'Nettowert';
    const kGROSS                  = 'Bruttowert';
    const FLAG_SENT_TO_DATEV      = 1;
    const ITEMS_WITH_NUMBER       = [InvoiceItemType::Default, InvoiceItemType::Discount];
    const ITEMS_ADDING_TO_PROJECT = [InvoiceItemType::Default, InvoiceItemType::Discount];
    const ITEMS_ADDING_TO_INVOICE = [InvoiceItemType::Default, InvoiceItemType::Discount, InvoiceItemType::Paydown];
    const ITEMS_NEED_INFO         = [...self::ITEMS_ADDING_TO_INVOICE, InvoiceItemType::Optional];

    protected $touches           = ['company'];
    protected $appends           = ['class', 'icon', 'path', 'net', 'gross', 'gross_remaining'];
    protected $fillable          = ['due_at', 'remind_at', 'company_id', 'default_interest', 'file_dir', 'name', 'stage'];
    public array $allowedFilters = ['company_id'];

    protected function casts(): array {
        return [
            'net'             => PrecomputedAuth::class,
            'gross'           => PrecomputedAuth::class,
            'gross_remaining' => PrecomputedAuth::class,
            'created_at'      => 'date',
            'updated_at'      => 'date',
            'paid_at'         => 'date',
            'due_at'          => 'date',
            'is_booked'       => 'boolean',
            'is_cancelled'    => 'boolean',
        ];
    }
    public function precomputeNetAttribute() {
        return $this->invoiceItems()->whereIn('type', InvoiceItemType::Total)->sum('net');
    }
    public function precomputeGrossAttribute() {
        return $this->invoiceItems()->whereIn('type', InvoiceItemType::Total)->sum('gross');
    }
    public function precomputeGrossRemainingAttribute() {
        return $this->invoiceItems()->whereIn('type', InvoiceItemType::TotalRemaining)->sum('gross');
    }
    public function getIconAttribute() {
        return 'companies/'.$this->company_id.'/icon';
    }
    public function getPaymentDurationAttribute() {
        return $this->paid_at ? $this->paid_at->diffInDays($this->created_at) : null;
    }
    public function getReminderCountAttribute() {
        return $this->reminders()->count();
    }
    public function company() {
        return $this->belongsTo(Company::class);
    }
    public function cancelledBy() {
        return $this->hasOne(Invoice::class, 'cancellation_invoice_id');
    }
    public function cancelles() {
        return $this->hasOne(Invoice::class, 'id', 'cancellation_invoice_id');
    }
    public function reminders() {
        return $this->hasMany(InvoiceReminder::class);
    }
    public function indexedItems() {
        return $this->invoiceItems()->with('productSource')->oldest('position');
    }
    public function newEloquentBuilder($query) {
        return new InvoiceBuilder($query);
    }
    public static function format($value): string {
        return CurrencyFormatCast::format($value);
    }
    public static function formatQty($value): string {
        $value = (float)$value;
        if (fmod($value, 1) === 0.0) {
            return number_format($value, 0, ',', '.');
        }
        return rtrim(number_format($value, 2, ',', '.'), '0');
    }
    public function setCancelledAttributes() {
        $this->is_cancelled = true;
        $this->paid_at      = now();
        $this->resetPrecomputedAttributes();
    }
    public function cancel() {
        [$zugferdPdf, $filename] = app(CancelInvoiceAction::class)->execute($this);
        return response($zugferdPdf)->withHeaders(File::headers($filename, 'application/pdf'));
    }
    public function sendMail() {
        $this->sent = 1;
        $this->save();
        SendInvoiceMailJob::dispatch($this);
        return $this;
    }
    public function sendReminder() {
        $this->sent = 1;

        $projectId       = $this->invoiceItems()->whereNotNull('project_id')->value('project_id');
        $paymentDuration = $projectId
            ? Project::find($projectId)?->param('INVOICE_PAYMENT_DURATION', true)->value
            : Param::get('INVOICE_PAYMENT_DURATION')->value;
        $this->remind_at = now()->addDays($paymentDuration);

        $this->save();
        SendInvoiceReminderJob::dispatch($this);

        $this->load('reminders');
        return $this;
    }
    public static function getCurrentInvoiceNumber($offset = 0) {
        $prefix  = Param::get('INVOICE_NO_PREFIX')->value;
        $suffix  = Param::get('INVOICE_NO_SUFFIX')->value;
        $number  = Param::get('INVOICE_NO_DIGITS')->value;
        $current = (string)(Param::get('INVOICE_NO_CURRENT'))->value + $offset;
        while (strlen($current) < $number) {
            $current = '0'.$current;
        }
        return ['value' => $prefix.$current.$suffix];
    }
    public static function getCurrentInvoiceNumberInt() {
        return Param::get('INVOICE_NO_CURRENT')->value;
    }
    public static function batchAssign($items, $invoice_id, $company_id) {
        $ss1 = new SmartSql('invoice_items', 'invoice_id');
        $ss2 = new SmartSql('invoice_items', 'company_id');
        foreach ($items as $i) {
            $ss1->add($i->id, $invoice_id);
            $ss2->add($i->id, $company_id);
        }
        $ss1->save();
        $ss2->save();
    }
    public function releaseItems(): void {
        $this->invoiceItems()->whereNull('project_id')->update(['company_id' => $this->company_id]);
        $this->invoiceItems()->update(['invoice_id' => null]);
    }
    public static function getInvoiceBlade($items, $footers = [], $discounts = [], string $lang = 'de'): string {
        return view('InvoiceTable', ['items' => $items, 'footers' => $footers, 'discounts' => $discounts, 'lang' => $lang])->render();
    }
    public static function enhancedItemsForPdf($items, Company $company): array {
        return app(InvoiceItemEnhancementService::class)->enhanceItemsForPdf($items, $company);
    }
    public static function circledNumber(int $n): ?string {
        if ($n >= 1 && $n <= 20) {
            return mb_convert_encoding('&#'.(9311 + $n).';', 'UTF-8', 'HTML-ENTITIES');
        }
        return null;
    }
    public static function getSepaQr($amount, $title): string {
        $amount      = number_format($amount, 2, '.', '');
        $bic         = Param::get('ME_BIC')->value ?? '';
        $companyName = Company::myName();
        $iban        = Param::get('ME_IBAN')->value ?? '';
        $qr          = 'BCD'.PHP_EOL.'002'.PHP_EOL.'2'.PHP_EOL.'SCT'.PHP_EOL
                      .$bic.PHP_EOL.$companyName.PHP_EOL.$iban.PHP_EOL
                      .'EUR'.$amount.PHP_EOL.PHP_EOL.PHP_EOL.$title.PHP_EOL.PHP_EOL;
        return Document::getBase64QrCode($qr);
    }
    public static function MakeFileName($invoiceNumber) {
        return date('Y').'-'.$invoiceNumber.'.pdf';
    }
    public static function makeInvoiceFor($entity) {
        Invoice::disablePropagation();

        [$company, $project, $items, $stage] = self::extractContext($entity);

        if ($error = self::validateCompanyVat($company)) {
            return $error;
        }

        $prefix = $company->param('INVOICE_PREFIX', true)->localizedValue($company->getLanguage(), $company->getFormality()) ?? '';
        $suffix = $company->param('INVOICE_SUFFIX', true)->localizedValue($company->getLanguage(), $company->getFormality()) ?? '';

        $documentType = match ($stage) {
            2       => ZugferdInvoiceType::PREPAYMENTINVOICE,
            default => ZugferdInvoiceType::INVOICE,
        };

        if (request()->boolean('draft')) {
            Invoice::enablePropagation();
            return self::makeDraftInvoiceFor($items, $prefix, $suffix, $company, $documentType, $project);
        }

        [$invoice, $zugferdPdf, $filename] = app(CreateInvoiceAction::class)->execute(
            $items,
            'Rechnung',
            $prefix,
            $suffix,
            $company,
            $documentType,
            null,
            $project
        );

        Invoice::batchAssign($items, $invoice->id, null);
        $invoice->stage = $stage;
        $invoice->save();

        $company->invoice_correction = '';
        $company->save();

        app(UpdateInvoiceStatisticsAction::class)->execute($company);
        app(UpdateInvoiceStatisticsAction::class)->execute();

        self::activateRepeatingItems($company);

        Invoice::enablePropagation();
        $company->propagateDirty();
        return response($zugferdPdf)->withHeaders(File::headers($filename, 'application/pdf'));
    }

    private static function makeDraftInvoiceFor($items, string $prefix, string $suffix, Company $company, string $documentType, ?Project $project) {
        [$pdf, $filename] = app(InvoicePdfService::class)->generateInvoicePdf(
            $items,
            'Rechnung',
            $prefix,
            $suffix,
            $company,
            $documentType,
            null,
            $project,
            draft: true
        );
        return response($pdf)->withHeaders(File::headers($filename, 'application/pdf'));
    }

    private static function extractContext($entity): array {
        if ($entity instanceof Project) {
            $project = $entity;
            $company = $project->company;
            $stage   = intval(request('type', 0));
            $items   = self::collectProjectItems($project, $stage);
            return [$company, $project, $items, $stage];
        }
        return [$entity, null, $entity->preparedInvoiceItems()->get(), 0];
    }
    private static function collectProjectItems(Project $project, int $stage) {
        return match ($stage) {
            1       => $project->supportInvoiceItems()->get(),
            2       => $project->downpaymentInvoiceItems()->get(),
            default => $project->preparedInvoiceItems()->get(),
        };
    }
    private static function validateCompanyVat(Company $company) {
        if (! $company->vat_id) {
            return null;
        }
        Artisan::call('vat_id:check', ['company' => $company]);
        $output = json_decode(Artisan::output());
        return $output->is_valid ? null : response($output->error_description, 400);
    }
    private static function activateRepeatingItems(Company $company): void {
        $company->repeatingItems->each(fn ($item) => $item->next_recurrence_at ?: $item->update(['next_recurrence_at' => now()]));
    }
}
