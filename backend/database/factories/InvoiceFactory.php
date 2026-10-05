<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invoice>
 */
class InvoiceFactory extends Factory {
    protected $model = Invoice::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array {
        return [
            'company_id'   => Company::factory(),
            'name'         => 'Rechnung '.fake()->numerify('####'),
            'is_cancelled' => false,
        ];
    }

    public function createdAt(\DateTimeInterface $at): static {
        return $this->state(['created_at' => $at, 'updated_at' => $at]);
    }
    public function cancelled(): static {
        return $this->state(['is_cancelled' => true]);
    }
}
