<?php

namespace App\Console\Commands;

use App\Models\Company;
use Illuminate\Console\Command;

class CustomersFixMissingNumbers extends Command {
    protected $signature   = 'customers:fixMissingNumbers';
    protected $description = 'Automatically adds customer numbers to thos companies without ';

    public function handle() {
        Company::assignMissingCustomerNumbers();
        return Company::whereCustomerNumberIsMissing()->exists() ? Command::INVALID : Command::SUCCESS;
    }
}
