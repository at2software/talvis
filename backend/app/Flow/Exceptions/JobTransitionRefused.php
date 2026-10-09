<?php

namespace App\Flow\Exceptions;

use App\Flow\Models\Job;
use Illuminate\Http\JsonResponse;
use RuntimeException;

class JobTransitionRefused extends RuntimeException {
    public function __construct(string $message, private readonly int $status = 409) {
        parent::__construct($message);
    }

    public function render(): JsonResponse {
        return response()->json(['message' => $this->getMessage()], $this->status);
    }
    public static function notAllowed(string $from, string $to): self {
        return new self("A job cannot move from {$from} to {$to}.");
    }
    public static function alreadyClaimed(?Job $job): self {
        return new self($job?->claimed_by ? "The job is already claimed by {$job->claimed_by}." : 'The job is not open.');
    }
    public static function notYours(): self {
        return new self('This job is claimed by another machine.', 403);
    }
}
