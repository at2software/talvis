<?php

namespace App\Flow\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

class ApprovalRefused extends RuntimeException {
    public function __construct(string $message, private readonly int $status = 403) {
        parent::__construct($message);
    }

    public function render(): JsonResponse {
        return response()->json(['message' => $this->getMessage()], $this->status);
    }
    public static function notPending(): self {
        return new self('This approval has already been decided.', 409);
    }
    public static function ownRequest(): self {
        return new self('You cannot decide an approval you requested.');
    }
    public static function missingRole(string $role): self {
        return new self("Deciding this approval requires the role {$role}.");
    }
    public static function alreadyVoted(): self {
        return new self('You have already decided on this approval; a second approval must come from someone else.', 409);
    }
    public static function changesNotApplicable(): self {
        return new self('Changes can only be requested on approvals of a job.', 422);
    }
    public static function unknownOption(): self {
        return new self('The selected option is not one of the offered options.', 422);
    }
}
