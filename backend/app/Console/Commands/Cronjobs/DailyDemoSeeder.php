<?php

namespace App\Console\Commands\Cronjobs;

use Carbon\Carbon;
use Database\Seeders\DemoSeeder;
use Illuminate\Console\Command;

class DailyDemoSeeder extends Command {
    /**
     * @var string
     */
    protected $signature = 'cron:daily-demo-seeder';

    /**
     * @var string
     */
    protected $description = 'Simulates the DemoSeeder for the current day';

    public function handle() {
        DemoSeeder::ensureAllowedEnvironment();
        $demoSeeder = new DemoSeeder;
        $demoSeeder->dailyActivity(Carbon::now());
    }
}
