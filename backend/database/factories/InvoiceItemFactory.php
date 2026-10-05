<?php

namespace Database\Factories;

use App\Enums\InvoiceItemType;
use App\Models\InvoiceItem;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InvoiceItem>
 */
class InvoiceItemFactory extends Factory {
    protected $model = InvoiceItem::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array {
        return [
            'text'            => fake()->words(3, true),
            'type'            => InvoiceItemType::Default,
            'qty'             => 1,
            'discount'        => 0,
            'unit_name'       => 'h',
            'price'           => fake()->randomFloat(2, 50, 5000),
            'vat_calculation' => 0,
        ];
    }

    public function repeating(): static {
        return $this->state(['type' => InvoiceItemType::Monthly]);
    }
    public function ofType(InvoiceItemType $type): static {
        return $this->state(['type' => $type]);
    }
    public function net(float $net): static {
        return $this->state(['price' => $net, 'qty' => 1, 'discount' => 0, 'unit_name' => 'h', 'vat_calculation' => 0]);
    }
}
