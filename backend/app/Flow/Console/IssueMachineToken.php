<?php

namespace App\Flow\Console;

use App\Flow\MachineAbility;
use App\Flow\Models\Machine;
use Illuminate\Console\Command;

class IssueMachineToken extends Command {
    protected $signature   = 'flow:token:issue {name : Machine name, also the token name shown as claimed_by} {--ability=* : One or more of '.MachineAbility::JOBS_READ.', '.MachineAbility::JOBS_WRITE.', '.MachineAbility::GATES_READ.'} {--expires-days= : Days until the token expires; omit for no expiry}';
    protected $description = 'Issue a flow machine token for an external orchestrator. The token is shown exactly once.';

    public function handle(): int {
        $abilities = array_values(array_unique($this->option('ability')));
        if (! MachineAbility::onlyGrantable($abilities)) {
            $this->error('Abilities must be a non-empty subset of: '.implode(', ', MachineAbility::ALL));
            return self::FAILURE;
        }
        $days = $this->option('expires-days');
        if ($days !== null && (! ctype_digit((string)$days) || (int)$days < 1)) {
            $this->error('--expires-days must be a positive whole number.');
            return self::FAILURE;
        }

        $name    = $this->argument('name');
        $machine = Machine::firstOrCreate(['name' => $name]);
        $token   = $machine->createToken($name, $abilities, $days !== null ? now()->addDays((int)$days) : null);

        $this->info("Token for machine \"{$name}\" (".implode(', ', $abilities).'):');
        $this->line($token->plainTextToken);
        $this->warn('Store it now — it cannot be shown again.');
        return self::SUCCESS;
    }
}
