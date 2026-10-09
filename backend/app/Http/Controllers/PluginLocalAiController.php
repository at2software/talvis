<?php

namespace App\Http\Controllers;

use App\Helpers\NLog;
use App\Jobs\ChatSendMessageJob;
use App\Models\PluginLink;
use App\Traits\HasVaultCredentials;
use Illuminate\Http\Request;

class PluginLocalAiController extends PluginController {
    use HasVaultCredentials;

    public static function getKey(): string {
        return 'localai';
    }
    public function vaultPrefix(): string {
        return 'LOCALAI';
    }
    public function checkCredentials(): bool {
        return $this->checkResponse(fn () => $this->getModels());
    }
    public function __construct($credentials = null) {
        $this->credentials = $credentials ?: $this->getCredentials();
        if (! $credentials) {
            $this->middleware('has_plugin:'.$this->vaultPrefix());
        }
        if ($endpoint = $this->env('ENDPOINT')) {
            $this->init($endpoint);
        } else {
            return null;
        }
        $this->init('');
    }
    protected function getToken(): string {
        return '';
    }
    protected function getHeaders(): array {
        $credentials = base64_encode($this->env('USERNAME').':'.$this->env('PASSWORD'));
        return [
            'Content-Type'  => 'application/json',
            'Authorization' => 'Basic '.$credentials,
        ];
    }
    protected function getUrl(): string {
        return $this->env('ENDPOINT');
    }
    private function extractJson(string $input): ?array {
        if (preg_match('/```json\s*(.*?)\s*```/s', $input, $matches)) {
            $jsonString = trim($matches[1]);
            $data       = json_decode($jsonString, true);

            if (json_last_error() === JSON_ERROR_NONE) {
                return $data;
            }
        } else {
            $data = json_decode($input, true);

            if (json_last_error() === JSON_ERROR_NONE) {
                return $data;
            }
        }
        return null;
    }

    // ############ Incoming
    public function onWebhook(Request $data): void {
        $data->validate(['object_kind' => 'required|string']);
        $projectUrl = $this->projectPathWithId($data->project);
        $links      = PluginLink::where('url', $projectUrl)->with('parent')->get();
        switch ($data->object_kind) {
            case 'push':
                if (! ($data->project_id == 669 || $data->project_id == 603)) {
                    break;
                }
                foreach ($data->commits as $commit) {
                    $git         = app(PluginGitController::class);
                    $diffContent = $git->getCommitDiff($data->project_id, $commit['id']);
                    $prompt      = "please rate this commit-diff on a scale from 0 (very bad) to 5 (very good)
                        and give improvement tipps. Return in JSON-Format [{file:string, quality: int, improvements:string[]}]:\n".$diffContent;

                    $data    = $this->sendToAI($prompt);
                    $message = $data['choices'][0]['message']['content'];
                    $answer  = $this->extractJson($message);

                    foreach ($links->siblingsOfType(PluginChatController::class) as $chatInfo) {

                        $message = 'New commit by '.$commit['author']['name'].":\n";
                        foreach ($answer as $answerParts) {
                            $message .= $answerParts['file'].' '.str_repeat(':star:', $answerParts['quality'])."\n";
                            $message .= implode("\n", $answerParts['improvements']);
                        }
                        $props = [
                            ...$git->props('GitLab Commit Review'),
                        ];
                        ChatSendMessageJob::dispatch($message, $props, channelId: $chatInfo['channelId'], chatKey: $chatInfo['controller']::getKey());
                    }
                }
                break;
            default:
                break;
        }
    }

    // ########### Outgoing
    private function getModels() {
        $response = $this->get($this->getUrl().'v1/models');
        NLog::info($response);
        return $response;
    }
    private function sendToAI(string $content) {
        $payload = [
            'model'    => 'gpt-4o',
            'messages' => [
                [
                    'role'    => 'user',
                    'content' => $content,
                    'image'   => '',
                ],
            ],
            'stream' => false,
        ];

        $data = $this->post($this->getUrl().'v1/chat/completions', $payload);
        return $data;
    }
}
