<?php

namespace App\Console\Commands\Cronjobs;

use App\Enums\CommentType;
use App\Helpers\Bundesanzeiger;
use App\Helpers\HandelsRegister;
use App\Models\Company;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class AddCompanyNewsComments extends Command {
    /**
     * @var string
     */
    protected $signature = 'cron:add-company-news-comments';

    /**
     * @var string
     */
    protected $description = 'Adds comments to companies based on news from Handelsregister and Bundesanzeiger';

    public function handle() {
        $companies       = Company::whereNotNull('commercial_register')->whereNot('is_deprecated', true)->get();
        $handelsRegister = app(HandelsRegister::class);
        $bundesanzeiger  = app(Bundesanzeiger::class);

        foreach ($companies as $company) {
            $this->info('Processing: '.$company->name);

            try {
                $this->processCompany($company, $handelsRegister, $bundesanzeiger);
            } catch (Throwable $e) {
                Log::warning('AddCompanyNewsComments: Skipped '.$company->name.': '.$e->getMessage());
                $this->warn('  → skipped: '.$e->getMessage());
            }
        }

        $this->info('Done.');
    }
    private function processCompany(Company $company, HandelsRegister $handelsRegister, Bundesanzeiger $bundesanzeiger) {
        $commentCount = 0;

        $registerInfo = $handelsRegister->process($company->commercial_register);
        if (! empty($registerInfo) && ! empty($registerInfo['fehlerhaft'])) {
            $commentText = '[Handelsregister] Registernummer fehlerhaft: '.$company->commercial_register;

            if (! $company->comments()->where('text', $commentText)->exists()) {
                $company->comments()->create([
                    'text'    => $commentText,
                    'user_id' => null,
                    'is_mini' => true,
                    'type'    => CommentType::Warning,
                    ...$company->toPoly(),
                ]);
                $commentCount++;
            }
        }
        if (! empty($registerInfo) && ! empty($registerInfo['insolvent'])) {
            $commentText = '[Handelsregister] Insolvenz erkannt!';

            if (! $company->comments()->where('text', $commentText)->exists()) {
                $company->comments()->create([
                    'text'    => $commentText,
                    'user_id' => null,
                    'is_mini' => true,
                    'type'    => CommentType::Warning,
                    ...$company->toPoly(),
                ]);
                $commentCount++;
            }
        }

        $reports = $bundesanzeiger->process($company->name);

        if (! empty($reports)) {
            foreach ($reports as $report) {
                $parsedDate = Carbon::createFromFormat('d.m.Y', $report['date']);
                if (! $parsedDate || $parsedDate->year < 2026) {
                    continue;
                }

                $commentText = '[Bundesanzeiger] '.$report['name'];

                if (! $company->comments()->where('text', $commentText)->exists()) {
                    $company->comments()->create([
                        'text'    => $commentText,
                        'user_id' => null,
                        'is_mini' => true,
                        'type'    => CommentType::Notice,
                        ...$company->toPoly(),
                    ]);
                    $commentCount++;
                }
            }
        }

        if ($commentCount > 0) {
            $this->info('  → '.$commentCount.' comment(s) added');
        }
    }
}
