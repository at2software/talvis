<?php

namespace App\Http\Middleware;

use App\Models\InvoiceItem;
use App\Models\Project;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Spatie\Permission\Exceptions\UnauthorizedException;
use Symfony\Component\HttpFoundation\Response;

/**
 * CRUD gate for invoice items.
 *
 *  - Any authenticated user may update only their own my_prediction.
 *  - admin / invoicing: may create, update and delete invoice items unconditionally.
 *  - project_manager:    may only do so on projects they manage. The project is taken
 *                        from the bound item (update/destroy) or from project_id in the
 *                        request body (store). A project without a manager is open to
 *                        every project_manager; no project at all => denied.
 */
class HasPermissionsForInvoiceItemMiddleware {
    public function handle(Request $request, Closure $next): Response {
        $user = $request->user();
        if (! $user) {
            throw UnauthorizedException::forRolesOrPermissions([]);
        }

        if ($request->isMethod('PUT') && $this->isOnlyMyPrediction($request)) {
            return $next($request);
        }

        if ($user->hasAnyRole(['admin', 'invoicing'])) {
            return $next($request);
        }

        if ($user->hasRole('project_manager') && $this->managesProject($request, $user)) {
            return $next($request);
        }

        throw UnauthorizedException::forRolesOrPermissions([]);
    }
    private function isOnlyMyPrediction(Request $request): bool {
        return count($request->all()) === 1 && $request->has('my_prediction');
    }
    private function managesProject(Request $request, User $user): bool {
        $project = $this->resolveProject($request);
        if (! $project) {
            return false;
        }
        return $project->project_manager_id === null || $project->project_manager_id == $user->id;
    }
    private function resolveProject(Request $request): ?Project {
        if ($invoiceItem = $request->route('invoice_item')) {
            if (! is_a($invoiceItem, InvoiceItem::class)) {
                $invoiceItem = InvoiceItem::find($invoiceItem);
            }
            return $invoiceItem?->project;
        }
        if ($projectId = $request->input('project_id')) {
            return Project::find($projectId);
        }
        return null;
    }
}
