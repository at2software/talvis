<?php

namespace App\Helpers;

class ModelRelationship {
    public const RELATIONSHIPS = [
        [
            'table'     => 'assignments',
            'relations' => [
                'role'     => ['type' => 'belongsTo', 'model' => 'roles'],
                'parent'   => ['type' => 'morphTo'],
                'assignee' => ['type' => 'morphTo'],
            ],
        ],
        [
            'table'     => 'assignment_roles',
            'relations' => [
                'assignments' => ['type' => 'hasMany', 'model' => 'assignments'],
            ],
        ],
        [
            'table'     => 'calendar_entries',
            'relations' => [
                'user' => ['type' => 'belongsTo', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'cash',
            'relations' => [
                'entries' => ['type' => 'belongsTo', 'model' => 'cash_registers'],
            ],
        ],
        [
            'table'     => 'cash_registers',
            'relations' => [
                'entries' => ['type' => 'hasMany', 'model' => 'cash'],
            ],
        ],
        [
            'table'     => 'comments',
            'relations' => [
                'parent' => ['type' => 'belongsTo', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'companies',
            'relations' => [
                'companyContacts'                 => ['type' => 'hasMany', 'model' => 'company_contacts'],
                'connections'                     => ['type' => 'hasMany', 'model' => 'connections'],
                'invoicedInvoiceItems'            => ['type' => 'hasManyThrough', 'model' => 'invoice_items'],
                'invoiceItems'                    => ['type' => 'hasMany', 'model' => 'invoice_items'],
                'earliestInvoice'                 => ['type' => 'hasOne', 'model' => 'invoices'],
                'invoices'                        => ['type' => 'hasMany', 'model' => 'invoices'],
                'invoicesUnpaid'                  => ['type' => 'hasMany', 'model' => 'invoices'],
                'projectInvoiceItems'             => ['type' => 'hasManyThrough', 'model' => 'invoice_items'],
                'projects'                        => ['type' => 'hasMany', 'model' => 'projects'],
                'defaultContact'                  => ['type' => 'hasOne', 'model' => 'company_contacts'],
                'projectsUnfinished'              => ['type' => 'hasMany', 'model' => 'projects'],
                'source'                          => ['type' => 'morphTo'],
                'assignees'                       => ['type' => 'morphMany', 'model' => 'assignments'],
                'assignedContacts'                => ['type' => 'morphToMany', 'model' => 'company_contacts'],
                'assigned_users'                  => ['type' => 'morphToMany', 'model' => 'users'],
                'timeBasedFoci'                   => ['type' => 'hasManyThrough', 'model' => 'foci'],
                'timeBasedProjects'               => ['type' => 'hasMany', 'model' => 'projects'],
                'getRevenueAttribute'             => ['type' => 'hasManyThrough (scoped)', 'model' => 'invoice_items'],
                'getProjectCountAttribute'        => ['type' => 'hasMany (scoped)', 'model' => 'projects'],
                'getRunningProjectCountAttribute' => ['type' => 'hasMany (scoped)', 'model' => 'projects'],
                'getInvoiceCountAttribute'        => ['type' => 'hasMany (scoped)', 'model' => 'invoices'],
                'getUnpaidInvoiceCountAttribute'  => ['type' => 'hasMany (scoped)', 'model' => 'invoices'],
                'getUnpaidInvoiceValueAttribute'  => ['type' => 'hasMany (scoped)', 'model' => 'invoices'],
                'precomputeNetAttribute'          => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
                'employees'                       => ['type' => 'hasMany (scoped)', 'model' => 'company_contacts'],
                'latestInvoicedInvoiceItems'      => ['type' => 'hasManyThrough (scoped)', 'model' => 'invoice_items'],
                'upcomingRepeatingInvoiceItems'   => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
                'invoicesLast12m'                 => ['type' => 'hasMany (scoped)', 'model' => 'invoices'],
                'baseProjects'                    => ['type' => 'hasMany (scoped)', 'model' => 'projects'],
                'indexedItems'                    => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
                'preparedInvoiceItems'            => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
            ],
        ],
        [
            'table'     => 'company_contacts',
            'relations' => [
                'company'              => ['type' => 'belongsTo', 'model' => 'companies'],
                'contact'              => ['type' => 'belongsTo', 'model' => 'contacts'],
                '_getAddressBookVcard' => ['type' => 'forwarded', 'via' => 'vcardCleaned'],
                'activeProjects'       => ['type' => 'forwarded', 'via' => 'projects'],
            ],
        ],
        [
            'table'     => 'connections',
            'relations' => [
                'company1'               => ['type' => 'belongsTo', 'model' => 'companies'],
                'company2'               => ['type' => 'belongsTo', 'model' => 'companies'],
                'projects'               => ['type' => 'hasMany', 'model' => 'connection_projects'],
                'invoiceItems'           => ['type' => 'hasMany (scoped)', 'model' => 'connection_projects'],
                'precomputeNetAttribute' => ['type' => 'forwarded', 'via' => 'invoiceItems'],
            ],
        ],
        [
            'table'     => 'connection_projects',
            'relations' => [
                'connection' => ['type' => 'belongsTo', 'model' => 'connections'],
                'project'    => ['type' => 'belongsTo', 'model' => 'projects'],
            ],
        ],
        [
            'table'     => 'contacts',
            'relations' => [
                'companyContacts'       => ['type' => 'hasMany', 'model' => 'company_contacts'],
                'activeCompanyContacts' => ['type' => 'hasMany', 'model' => 'company_contacts'],
                'companies'             => ['type' => 'belongsToMany', 'model' => 'companies'],
                'active_companies'      => ['type' => 'belongsToMany', 'model' => 'companies'],
                'assignments'           => ['type' => 'hasMany', 'model' => 'assignments'],
            ],
        ],
        [
            'table'     => 'encryptions',
            'relations' => [
                'user' => ['type' => 'belongsTo', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'expenses',
            'relations' => [
                'category'    => ['type' => 'belongsTo', 'model' => 'expense_categories'],
                'invoiceItem' => ['type' => 'belongsTo', 'model' => 'invoice_items'],
            ],
        ],
        [
            'table'     => 'expense_categories',
            'relations' => [
                'category' => ['type' => 'hasMany', 'model' => 'expenses'],
            ],
        ],
        [
            'table'     => 'files',
            'relations' => [
                'parent' => ['type' => 'morphTo'],
            ],
        ],
        [
            'table'     => 'foci',
            'relations' => [
                'parent'      => ['type' => 'morphTo'],
                'user'        => ['type' => 'belongsTo', 'model' => 'users'],
                'invoiceItem' => ['type' => 'belongsTo', 'model' => 'invoice_items'],
                'itemFocus'   => ['type' => 'belongsTo', 'model' => 'invoice_items'],
            ],
        ],
        [
            'table'     => 'invoices',
            'relations' => [
                'company'                           => ['type' => 'belongsTo', 'model' => 'companies'],
                'cancelledBy'                       => ['type' => 'hasOne', 'model' => 'invoices'],
                'cancelles'                         => ['type' => 'hasOne', 'model' => 'invoices'],
                'reminders'                         => ['type' => 'hasMany', 'model' => 'invoice_reminders'],
                'precomputeNetAttribute'            => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'precomputeGrossAttribute'          => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'precomputeGrossRemainingAttribute' => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'getReminderCountAttribute'         => ['type' => 'hasMany (scoped)', 'model' => 'invoice_reminders'],
                'indexedItems'                      => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'statsKeyVal'                       => ['type' => 'forwarded', 'via' => 'withItems'],
            ],
        ],
        [
            'table'     => 'invoice_items',
            'relations' => [
                'project'                  => ['type' => 'belongsTo', 'model' => 'projects'],
                'invoice'                  => ['type' => 'belongsTo', 'model' => 'invoices'],
                'invoiceItem'              => ['type' => 'belongsTo', 'model' => 'invoice_items'],
                'itemFocus'                => ['type' => 'belongsTo', 'model' => 'foci'],
                'company'                  => ['type' => 'belongsTo', 'model' => 'companies'],
                'product'                  => ['type' => 'belongsTo', 'model' => 'products'],
                'productSource'            => ['type' => 'belongsTo', 'model' => 'products'],
                'companyContact'           => ['type' => 'belongsTo', 'model' => 'company_contacts'],
                'predictions'              => ['type' => 'hasMany', 'model' => 'invoice_item_predictions'],
                'setMyPredictionAttribute' => ['type' => 'forwarded', 'via' => 'fresh'],
                'getProgressAttribute'     => ['type' => 'belongsTo (scoped)', 'model' => 'foci'],
            ],
        ],
        [
            'table'     => 'invoice_item_predictions',
            'relations' => [
                'user'        => ['type' => 'belongsTo', 'model' => 'users'],
                'invoiceItem' => ['type' => 'belongsTo', 'model' => 'invoice_items'],
            ],
        ],
        [
            'table'     => 'invoice_reminders',
            'relations' => [
                'invoice' => ['type' => 'belongsTo', 'model' => 'invoices'],
            ],
        ],
        [
            'table'     => 'milestones',
            'relations' => [
                'project'              => ['type' => 'belongsTo', 'model' => 'projects'],
                'dependants'           => ['type' => 'belongsToMany', 'model' => 'milestones'],
                'dependees'            => ['type' => 'belongsToMany', 'model' => 'milestones'],
                'getChildrenAttribute' => ['type' => 'belongsToMany (scoped)', 'model' => 'milestones'],
            ],
        ],
        // [
        //     'table' => 'params',
        //     'relations' => [
        //         'latestFor' => ['type' => 'hasOne', 'model' => $this->type],
        //     ],
        // ],
        [
            'table'     => 'products',
            'relations' => [
                'group'                  => ['type' => 'belongsTo', 'model' => 'product_groups'],
                'refs'                   => ['type' => 'hasMany', 'model' => 'invoice_items'],
                'invoiceItems'           => ['type' => 'hasMany', 'model' => 'invoice_items'],
                'precomputeNetAttribute' => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
                'customers'              => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
                'indexedItems'           => ['type' => 'hasMany (scoped)', 'model' => 'invoice_items'],
            ],
        ],
        [
            'table'     => 'product_groups',
            'relations' => [
                'parent_group'           => ['type' => 'belongsTo', 'model' => 'product_groups'],
                'child_groups'           => ['type' => 'hasMany', 'model' => 'product_groups'],
                'products'               => ['type' => 'hasMany', 'model' => 'products'],
                'products_min'           => ['type' => 'hasMany (scoped)', 'model' => 'products'],
                'precomputeNetAttribute' => ['type' => 'hasMany (scoped)', 'model' => 'products'],
            ],
        ],
        [
            'table'     => 'projects',
            'relations' => [
                'company'                         => ['type' => 'belongsTo', 'model' => 'companies'],
                'invoiceItemsRaw'                 => ['type' => 'hasMany', 'model' => 'invoice_items'],
                'milestones'                      => ['type' => 'hasMany', 'model' => 'milestones'],
                'parentProject'                   => ['type' => 'belongsTo', 'model' => 'projects'],
                'predictions'                     => ['type' => 'hasManyThrough', 'model' => 'invoice_item_predictions'],
                'projectManager'                  => ['type' => 'belongsTo', 'model' => 'users'],
                'subProjects'                     => ['type' => 'hasMany', 'model' => 'projects'],
                'companysActiveProjects'          => ['type' => 'hasManyThrough', 'model' => 'projects'],
                'states'                          => ['type' => 'belongsToMany', 'model' => 'project_states'],
                'assignees'                       => ['type' => 'morphMany', 'model' => 'assignments'],
                'assignedContacts'                => ['type' => 'morphToMany', 'model' => 'company_contacts'],
                'assigned_users'                  => ['type' => 'morphToMany', 'model' => 'users'],
                'desicionAt'                      => ['type' => 'belongsToMany', 'model' => 'project_states'],
                'precomputeNetAttribute'          => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'precomputeGrossAttribute'        => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'precomputeNetRemainingAttribute' => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'getStateAttribute'               => ['type' => 'belongsToMany (scoped)', 'model' => 'project_states'],
                'getHoursInvestedAttribute'       => ['type' => 'forwarded', 'via' => 'foci'],
                'getCompanyAttribute'             => ['type' => 'belongsTo (scoped)', 'model' => 'companies'],
                'getFociSumAttribute'             => ['type' => 'forwarded', 'via' => 'foci'],
                'unbilledInvoiceItems'            => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'supportItems'                    => ['type' => 'forwarded', 'via' => 'invoiceItems'],
                'latestState'                     => ['type' => 'belongsToMany (scoped)', 'model' => 'project_states'],
                'finishedAt'                      => ['type' => 'belongsToMany (scoped)', 'model' => 'project_states'],
                'startedAt'                       => ['type' => 'belongsToMany (scoped)', 'model' => 'project_states'],
                'runningStates'                   => ['type' => 'belongsToMany (scoped)', 'model' => 'project_states'],
                'finishedStates'                  => ['type' => 'belongsToMany (scoped)', 'model' => 'project_states'],
                'statsKeyVal'                     => ['type' => 'forwarded', 'via' => 'withItems'],
                'whereHasSupportItems'            => ['type' => 'forwarded', 'via' => 'whereRunning'],
            ],
        ],
        [
            'table'     => 'project_states',
            'relations' => [
                'projects' => ['type' => 'belongsToMany', 'model' => 'projects'],
            ],
        ],
        [
            'table'     => 'project_project_state',
            'relations' => [
                'project'      => ['type' => 'belongsTo', 'model' => 'projects'],
                'projectState' => ['type' => 'belongsTo', 'model' => 'project_states'],
            ],
        ],
        [
            'table'     => 'sentinels',
            'relations' => [
                'subscribers'             => ['type' => 'belongsToMany', 'model' => 'users'],
                'user'                    => ['type' => 'belongsTo', 'model' => 'users'],
                'getSubscribersAttribute' => ['type' => 'belongsToMany (scoped)', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'tasks',
            'relations' => [
                'parent'   => ['type' => 'morphTo'],
                'assignee' => ['type' => 'hasOne', 'model' => 'assignments'],
            ],
        ],
        [
            'table'     => 'users',
            'relations' => [
                'comments'                     => ['type' => 'hasMany', 'model' => 'comments'],
                'foci'                         => ['type' => 'hasMany', 'model' => 'focuses'],
                'current_focus'                => ['type' => 'morphTo'],
                'group'                        => ['type' => 'belongsTo', 'model' => 'user_groups'],
                'sentinels'                    => ['type' => 'hasMany', 'model' => 'sentinels'],
                'subscribedSentinels'          => ['type' => 'belongsToMany', 'model' => 'sentinels'],
                'predictions'                  => ['type' => 'hasMany', 'model' => 'invoice_item_predictions'],
                'encryptions'                  => ['type' => 'hasMany', 'model' => 'encryptions'],
                'vacation_grants'              => ['type' => 'hasMany', 'model' => 'vacation_grants'],
                'vacations'                    => ['type' => 'hasManyThrough', 'model' => 'vacations'],
                'employments'                  => ['type' => 'hasMany', 'model' => 'user_employments'],
                'timePayments'                 => ['type' => 'hasMany', 'model' => 'user_paid_times'],
                'getActiveEmploymentAttribute' => ['type' => 'forwarded', 'via' => 'activeEmployments'],
                'getIsSickAttribute'           => ['type' => 'forwarded', 'via' => 'active_sick_notes'],
                'getIsOnVacationAttribute'     => ['type' => 'forwarded', 'via' => 'activeVacations'],
                'getRoleNamesAttribute'        => ['type' => 'forwarded', 'via' => 'getRoleNames'],
                'activeProjects'               => ['type' => 'forwarded', 'via' => 'projects'],
                'activeVacations'              => ['type' => 'forwarded', 'via' => 'approvedVacations'],
                'active_sick_notes'            => ['type' => 'hasManyThrough (scoped)', 'model' => 'vacations'],
                'assigned_projects'            => ['type' => 'forwarded', 'via' => 'projects'],
                'activeEmployments'            => ['type' => 'hasMany (scoped)', 'model' => 'user_employments'],
            ],
        ],
        [
            'table'     => 'user_employments',
            'relations' => [
                'user' => ['type' => 'belongsTo', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'user_groups',
            'relations' => [
                'users' => ['type' => 'hasMany', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'user_paid_times',
            'relations' => [
                'user'       => ['type' => 'belongsTo', 'model' => 'users'],
                'granted_by' => ['type' => 'belongsTo', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'vacations',
            'relations' => [
                'approved_by' => ['type' => 'belongsTo', 'model' => 'users'],
                'grant'       => ['type' => 'belongsTo', 'model' => 'vacation_grants'],
                'user'        => ['type' => 'hasOneThrough', 'model' => 'users'],
            ],
        ],
        [
            'table'     => 'vacation_grants',
            'relations' => [
                'user'      => ['type' => 'belongsTo', 'model' => 'users'],
                'vacations' => ['type' => 'hasMany', 'model' => 'vacations'],
            ],
        ],
    ];
    public const ACCESSORS = [
        'companies' => [
            'name'                  => 'string',        // VcardTrait - shortcut to vcard.name
            'email'                 => 'string',       // VcardTrait - shortcut to vcard.email
            'vcard'                 => 'object',       // VcardTrait - parsed vcard data
            'icon'                  => 'string',        // Icon path
            'address'               => 'string',     // Formatted address
            'revenue'               => 'number',     // Calculated total revenue
            'project_count'         => 'number',
            'running_project_count' => 'number',
            'running_project_value' => 'number',
            'invoice_count'         => 'number',
            'unpaid_invoice_count'  => 'number',
            'unpaid_invoice_value'  => 'number',
            'needs_vat_handling'    => 'boolean',
            'is_domestic'           => 'boolean',
        ],
        'company_contacts' => [
            'name'       => 'string',        // Forwarded from contact
            'email'      => 'string',       // Forwarded from contact
            'icon'       => 'string',
            'gender'     => 'string',      // VcardGenderTrait
            'salutation' => 'string',  // VcardGenderTrait
        ],
        'contacts' => [
            'name'    => 'string',        // VcardTrait
            'email'   => 'string',       // VcardTrait
            'vcard'   => 'object',       // VcardTrait
            'qr_code' => 'string',
        ],
        'users' => [
            'name'              => 'string',        // VcardTrait
            'email'             => 'string',       // VcardTrait
            'vcard'             => 'object',       // VcardTrait
            'gender'            => 'string',      // VcardGenderTrait
            'salutation'        => 'string',  // VcardGenderTrait
            'is_sick'           => 'boolean',
            'is_on_vacation'    => 'boolean',
            'role_names'        => 'array',
            'active_employment' => 'object',
        ],
        'projects' => [
            'state'          => 'object',       // Current project state
            'hours_invested' => 'number',
            'foci_sum'       => 'number',
        ],
        'invoices' => [
            'reminder_count' => 'number',
        ],
        'invoice_items' => [
            'progress' => 'number',
        ],
        'tasks' => [
            'icon'  => 'string',
            'class' => 'string',
            'path'  => 'string',
        ],
        'assignments' => [
            'allocated_time_remaining' => 'number',
        ],
        'files' => [
            'thumbnail' => 'string',
        ],
    ];
}
