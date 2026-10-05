<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route access for owner-scoped resources: the authenticated user may act on a
 * record they own, while everyone else needs one of the listed roles.
 *
 * Usage:
 *   ->middleware('owner:user_id')                    owner (or admin) only
 *   ->middleware('owner:id,project_manager|hr')      owner, listed roles, or admin
 *   ->middleware('owner:vacation_grant.user_id,hr')  owner via a related model
 *
 * First argument: a dot-path to the owning user id. The final segment is an
 * attribute; any preceding segments are foreign-key relation hops resolved by
 * convention, e.g. `vacation_grant` loads App\Models\VacationGrant via the
 * `vacation_grant_id` key. Use `id` as the final segment to compare a model's
 * own key (e.g. the User model itself).
 *
 * The starting foreign key / attribute is read from the route's bound model
 * (show/update/destroy) and otherwise from the request body, so the same
 * declaration also guards `store`, where the record does not yet exist.
 *
 * Second argument (optional): pipe-separated roles allowed regardless of
 * ownership. Admins always pass (see User::hasAnyRole()).
 */
class OwnerMiddleware {
    public function handle(Request $request, Closure $next, string $column = 'user_id', ?string $roles = null): Response {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        $allowedRoles = $roles !== null && $roles !== '' ? explode('|', $roles) : [];
        if ($user->hasAnyRole(array_merge(['admin'], $allowedRoles))) {
            return $next($request);
        }

        if ($this->ownsResource($request, $column, $user->getKey())) {
            return $next($request);
        }

        abort(403, 'Unauthorized');
    }
    private function ownsResource(Request $request, string $column, mixed $userId): bool {
        $segments  = explode('.', $column);
        $attribute = array_pop($segments);
        $current   = $this->routeModel($request); // null on store

        foreach ($segments as $segment) {
            $foreignKey = $this->readValue($current, $request, $segment.'_id');
            if ($foreignKey === null) {
                return false;
            }
            $modelClass = 'App\\Models\\'.Str::studly(Str::singular($segment));
            if (! class_exists($modelClass)) {
                return false;
            }
            $current = $modelClass::find($foreignKey);
            if (! $current) {
                return false;
            }
        }

        $ownerId = $attribute === 'id' && $current instanceof Model
            ? $current->getKey()
            : $this->readValue($current, $request, $attribute);

        return $ownerId !== null && (string)$ownerId === (string)$userId;
    }
    private function readValue(?Model $model, Request $request, string $key): mixed {
        if ($model) {
            return $model->getAttribute($key);
        }
        return $request->input($key);
    }
    private function routeModel(Request $request): ?Model {
        foreach ($request->route()->parameters() as $parameter) {
            if ($parameter instanceof Model) {
                return $parameter;
            }
        }
        return null;
    }
}
