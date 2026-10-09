<?php

namespace App\Console\Commands;

use Database\Seeders\DemoSeeder;
use Database\Seeders\DemoSeederData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

class SeedDemoData extends Command {
    protected $signature   = 'demo:seed {--fresh : Drop all tables and re-run all migrations first} {--force : Skip the confirmation prompt}';
    protected $description = 'Seed a running demo company: 5 employees, ~25 customers and '.DemoSeeder::HISTORY_MONTHS.' months of projects, time tracking, invoices and absences';

    public function handle(): int {
        DemoSeeder::ensureAllowedEnvironment();
        $database = config('database.connections.'.config('database.default').'.database');
        $this->warn($this->option('fresh')
            ? "This will WIPE the database \"$database\" and fill it with demo data."
            : "This will insert demo data into the database \"$database\" (it must be freshly migrated).");

        if (! $this->option('force') && ! $this->confirm('Proceed?', ! $this->option('fresh'))) {
            $this->info('Aborted.');
            return self::FAILURE;
        }
        if ($this->option('fresh')) {
            Artisan::call('migrate:fresh', ['--force' => true], $this->output);
        }

        if (DemoSeeder::hasExistingData()) {
            $this->error(DemoSeeder::EXISTING_DATA_MESSAGE);
            return self::FAILURE;
        }

        $this->info('Seeding demo data — this takes a few minutes...');
        $start  = microtime(true);
        $seeder = new DemoSeeder;
        $seeder->setContainer(app());
        $seeder->setCommand($this);
        $seeder->__invoke();

        $this->info(sprintf('Done in %ds.', microtime(true) - $start));
        $this->info('Login: '.DemoSeederData::users()['owner']['email'].' / '.DemoSeederData::PASSWORD.' (all demo users share this password)');
        return self::SUCCESS;
    }
}
