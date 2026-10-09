<?php

namespace App\Console\Commands;

use App\Models\AssignmentRole;
use App\Models\Param;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;

class InsertBasicRoles extends Command {
    protected $signature   = 'db:insert-basic-roles';
    protected $description = 'Seed roles and initial admin user for RBAC system';

    public function handle() {
        $roleDefinitions = [
            ['name' => 'admin',           'description' => 'Full system access. Can manage users, roles, and system settings.'],
            ['name' => 'project_manager', 'description' => 'Can create and manage projects, access HR overview, and manage companies.'],
            ['name' => 'user',            'description' => 'Basic access to projects, companies, and calendar.'],
            ['name' => 'guest',           'description' => 'Limited access. Read-only on available content.'],
            ['name' => 'invoicing',       'description' => 'Can create, manage, and send invoices and payment reminders.'],
            ['name' => 'financial',       'description' => 'Access to financial reports, cost management, and cash registers.'],
            ['name' => 'marketing',       'description' => 'Access to marketing initiatives, prospects, and workflow management.'],
            ['name' => 'hr',              'description' => 'Access to HR employment records, vacation management, and team data.'],
            ['name' => 'product_manager', 'description' => 'Can manage products and product groups.'],
        ];

        foreach ($roleDefinitions as $roleData) {
            Role::firstOrCreate(['name' => $roleData['name']], $roleData);
        }

        AssignmentRole::firstOrCreate(['name' => 'project manager']);
        AssignmentRole::firstOrCreate(['name' => 'developer']);
        AssignmentRole::firstOrCreate(['name' => 'customer']);

        if (Param::get('SYS_SEED_ADMIN_RETIRED')->value) {
            $this->info('Roles seeded successfully, seed admin is retired.');
            return;
        }

        $admin = User::firstOrCreate(
            ['email' => config('services.admin.email')],
            [
                'name'     => 'Super Admin',
                'password' => Hash::make(config('services.admin.password')),
                'vcard'    => "BEGIN:VCARD\nFN:Super Admin\nN:Admin;Admin;;;\nEND:VCARD",
            ]
        );
        $admin->assignRole('admin');
        $admin->save();
        $admin->ensureDefaultDashboard();

        $this->info('Roles and admin user seeded successfully.');
    }
}
