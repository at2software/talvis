<?php

namespace App\Flow\Console;

use App\Flow\Models\Machine;
use Illuminate\Console\Command;

class RevokeMachineToken extends Command {
    protected $signature   = 'flow:token:revoke {name : Machine name}';
    protected $description = 'Revoke every token of a flow machine.';

    public function handle(): int {
        $machine = Machine::where('name', $this->argument('name'))->first();
        if (! $machine) {
            $this->error('No machine with that name.');
            return self::FAILURE;
        }
        $count = $machine->tokens()->delete();
        $this->info("Revoked {$count} token(s) of machine \"{$machine->name}\".");
        return self::SUCCESS;
    }
}
