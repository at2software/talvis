<?php

namespace App\Flow\Chat;

use App\Flow\ApprovalService;
use App\Flow\Exceptions\ApprovalRefused;
use App\Flow\Models\Approval;
use App\Flow\Models\Job;
use App\Http\Controllers\PluginMattermostController;
use App\Jobs\ChatSendMessageJob;
use App\Models\Encryption;
use App\Models\Project;
use App\Models\User;
use App\Support\ChatProps;
use Illuminate\Support\Collection;

class ApprovalChat {
    public const APPROVE         = 'approve';
    public const REQUEST_CHANGES = 'request_changes';
    public const REJECT          = 'reject';

    public function __construct(private readonly ApprovalService $approvals) {}

    public function notify(Approval $approval): void {
        $project = $this->project($approval);
        if (! $project || $approval->gate_key === null) {
            return;
        }
        $message = $this->message($approval, $project);
        ChatSendMessageJob::dispatch($message, self::sender(), project: $project)->afterCommit();
        foreach ($this->deciders($approval) as $user) {
            ChatSendMessageJob::dispatch($message, [...self::sender(), 'attachments' => [$this->buttons($approval)]], user: $user, chatKey: PluginMattermostController::getKey())->afterCommit();
        }
    }
    public static function token(): string {
        return hash_hmac('sha256', 'flow-mattermost-actions', (string)config('app.key'));
    }
    public static function isValidToken(mixed $token): bool {
        return is_string($token) && hash_equals(self::token(), $token);
    }
    public function onAction(array $payload): array {
        $context  = $payload['context'] ?? [];
        $approval = Approval::find($context['approval_id'] ?? null);
        $user     = Encryption::userFor(PluginMattermostController::getKey(), (string)($payload['user_id'] ?? ''));
        if ($refusal = $this->refusal($approval, $user)) {
            return ['ephemeral_text' => $refusal];
        }
        $action = $context['action'] ?? null;
        if ($action === self::APPROVE) {
            return $this->decided($approval, $user, fn () => $this->approvals->approve($approval, $user, null, $context['option'] ?? null));
        }
        if (! in_array($action, [self::REQUEST_CHANGES, self::REJECT], true)) {
            return ['ephemeral_text' => 'Unknown action.'];
        }
        $opened = app(PluginMattermostController::class)?->openDialog((string)($payload['trigger_id'] ?? ''), self::url('dialog'), [
            'callback_id'  => (string)$approval->id,
            'title'        => $action === self::REJECT ? 'Reject' : 'Request changes',
            'submit_label' => $action === self::REJECT ? 'Reject' : 'Send back',
            'elements'     => [['display_name' => $action === self::REJECT ? 'Why is this rejected?' : 'What has to change?', 'name' => 'reason', 'type' => 'textarea', 'max_length' => 2000]],
            'state'        => json_encode(['token' => self::token(), 'approval_id' => $approval->id, 'action' => $action, 'post_id' => $payload['post_id'] ?? null]),
        ]);
        return $opened ? [] : ['ephemeral_text' => 'The dialog could not be opened; please decide in TALVIS.'];
    }
    public function onDialog(array $payload, array $state): array {
        if ($payload['cancelled'] ?? false) {
            return [];
        }
        $approval = Approval::find($state['approval_id'] ?? null);
        $user     = Encryption::userFor(PluginMattermostController::getKey(), (string)($payload['user_id'] ?? ''));
        if ($refusal = $this->refusal($approval, $user)) {
            return ['error' => $refusal];
        }
        $reason = trim((string)($payload['submission']['reason'] ?? ''));
        if ($reason === '') {
            return ['errors' => ['reason' => 'A reason is required.']];
        }
        $result = $this->decided($approval, $user, fn () => ($state['action'] ?? null) === self::REJECT
            ? $this->approvals->reject($approval, $user, $reason)
            : $this->approvals->requestChanges($approval, $user, $reason));
        if (isset($result['ephemeral_text'])) {
            return ['error' => $result['ephemeral_text']];
        }
        if (! empty($state['post_id'])) {
            app(PluginMattermostController::class)?->updatePost($state['post_id'], $result['update']['message'], [...self::sender(), 'attachments' => $result['update']['props']['attachments']]);
        }
        return [];
    }
    private function refusal(?Approval $approval, ?User $user): ?string {
        return match (true) {
            $approval === null => 'This approval no longer exists.',
            $user === null     => 'Your Mattermost account is not linked to a TALVIS user, so TALVIS cannot accept your decision. Link it in TALVIS under Profile → Plugins → Mattermost → Link My ID.',
            default            => null,
        };
    }
    private function decided(Approval $approval, User $user, callable $decide): array {
        try {
            $approval = $decide();
        } catch (ApprovalRefused $e) {
            return ['ephemeral_text' => $e->getMessage()];
        }
        $votes   = $approval->votes()->where('decision', Approval::APPROVED)->count();
        $outcome = match ($approval->decision) {
            Approval::PENDING           => "✅ {$user->name} approved ({$votes}/{$approval->required_approvals}) — waiting for further approvals.",
            Approval::APPROVED          => "✅ Approved by {$user->name}".($approval->selected_option ? ": {$approval->selected_option}" : '').'.',
            Approval::CHANGES_REQUESTED => "↩️ Changes requested by {$user->name}: {$approval->reason}",
            default                     => "❌ Rejected by {$user->name}: {$approval->reason}",
        };
        $attachments = [ChatProps::attachment($outcome)];
        return ['update' => ['message' => $this->message($approval, $this->project($approval)), 'props' => PluginMattermostController::postProps([...self::sender(), 'attachments' => $attachments])]];
    }
    private function deciders(Approval $approval): Collection {
        return User::whereHas('roles', fn ($q) => $q->where('name', $approval->required_role))
            ->whereHas('encryptions', fn ($q) => $q->where('key', PluginMattermostController::getKey())->whereNotNull('my_id'))
            ->when($approval->requested_by_id, fn ($q, $id) => $q->whereKeyNot($id))
            ->get();
    }
    private function buttons(Approval $approval): array {
        $action = fn (string $id, string $name, string $type, string $style, ?string $option = null) => [
            'id'          => $id,
            'name'        => $name,
            'style'       => $style,
            'integration' => ['url' => self::url('actions'), 'context' => array_filter(['token' => self::token(), 'approval_id' => $approval->id, 'action' => $type, 'option' => $option])],
        ];
        $options = $approval->options();
        $approve = $options === []
            ? [$action('approve', 'Approve', self::APPROVE, 'good')]
            : array_map(fn (string $option, int $i) => $action("approve{$i}", "Approve: {$option}", self::APPROVE, 'good', $option), $options, array_keys($options));
        return [
            'text'    => 'Decide here or in TALVIS:',
            'actions' => [
                ...$approve,
                ...($approval->subject_type === Job::class ? [$action('changes', 'Request changes', self::REQUEST_CHANGES, 'default')] : []),
                $action('reject', 'Reject', self::REJECT, 'danger'),
            ],
        ];
    }
    private function message(Approval $approval, ?Project $project): string {
        $subject = $approval->subject()->first();
        return implode("\n", array_filter([
            "#### Approval requested: `{$approval->gate_key}`",
            $subject instanceof Job ? '- **Job**: '.$subject->flowLabel() : null,
            $project ? "- **Project**: {$project->name}" : null,
            '- **Source**: '.self::source($approval),
            "- **Decided by**: {$approval->required_role} · {$approval->required_approvals}×",
            '',
            '[Open approvals]('.rtrim((string)config('app.url'), '/').'/flow/approvals)',
        ], fn ($line) => $line !== null));
    }
    private function project(Approval $approval): ?Project {
        $subject = $approval->subject()->first();
        return match (true) {
            $subject instanceof Job     => $subject->project()->withoutEagerLoads()->first(),
            $subject instanceof Project => $subject,
            default                     => null,
        };
    }
    private static function source(Approval $approval): string {
        return match (true) {
            isset($approval->context['source'])               => $approval->context['source'],
            $approval->reviewRound() !== null                 => 'review',
            isset($approval->context['requested_by_machine']) => $approval->context['requested_by_machine'],
            default                                           => $approval->requestedBy()->value('name') ?? 'team',
        };
    }
    private static function sender(): array {
        return ChatProps::sender('TALVIS Flow');
    }
    private static function url(string $endpoint): string {
        return rtrim((string)config('app.api_url'), '/').'/flow/chat/mattermost/'.$endpoint;
    }
}
