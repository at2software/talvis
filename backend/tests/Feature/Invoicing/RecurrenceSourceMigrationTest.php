<?php

namespace Tests\Feature\Invoicing;

use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * No DatabaseTransactions here: MySQL commits DDL implicitly. The test leaves the schema as it found it.
 */
#[Group('database')]
class RecurrenceSourceMigrationTest extends TestCase {
    private function migration(): object {
        return require database_path('migrations/2026_11_20_200001_add_recurrence_source_id_to_invoice_items.php');
    }
    private function hasForeignKey(): bool {
        return collect(Schema::getForeignKeys('invoice_items'))->contains(fn (array $fk) => $fk['columns'] === ['recurrence_source_id']
            && $fk['foreign_table'] === 'invoice_items'
            && $fk['foreign_columns'] === ['id']
            && strtolower((string)$fk['on_delete']) === 'set null');
    }
    public function test_migration_runs_down_and_up(): void {
        $this->assertTrue(Schema::hasColumn('invoice_items', 'recurrence_source_id'));
        $this->assertTrue($this->hasForeignKey());

        $migration = $this->migration();
        $migration->down();
        $this->assertFalse(Schema::hasColumn('invoice_items', 'recurrence_source_id'));

        $migration->up();
        $this->assertTrue(Schema::hasColumn('invoice_items', 'recurrence_source_id'));
        $this->assertTrue($this->hasForeignKey());
    }
}
