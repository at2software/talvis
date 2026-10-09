<?php

namespace App\Actions\User;

use App\Helpers\NLog;
use App\Models\M365MirrorItem;
use App\Models\User;
use App\Services\CompanyCalendar;
use App\Services\MicrosoftGraph;
use App\Support\GraphContact;
use App\Support\GraphEvent;

class MirrorToMicrosoft365Action {
    public const FOLDER_NAME = 'TALVIS';
    public const SETTINGS    = [
        MicrosoftGraph::CALENDAR => ['toggle' => 'M365_SYNC_CALENDAR', 'folder' => 'M365_CALENDAR_ID'],
        MicrosoftGraph::CONTACTS => ['toggle' => 'M365_SYNC_CONTACTS', 'folder' => 'M365_CONTACT_FOLDER_ID'],
    ];

    public function __construct(private CompanyCalendar $calendar) {}

    /** @return array{created: int, updated: int, deleted: int, failed: int} */
    public function execute(User $user, string $kind, MicrosoftGraph $graph): array {
        $stats       = ['created' => 0, 'updated' => 0, 'deleted' => 0, 'failed' => 0];
        $settings    = self::SETTINGS[$kind];
        $mailbox     = $user->microsoft365Mailbox();
        $folderParam = $user->param($settings['folder']);
        $items       = M365MirrorItem::where('user_id', $user->id)->where('kind', $kind);

        if (! $user->usesMicrosoft365($settings['toggle'])) {
            $stats['deleted'] = $this->detach($user, $kind, $graph, $mailbox);
            return $stats;
        }

        $folderId = $graph->ensureFolder($mailbox, $kind, $folderParam->value ?: null, self::FOLDER_NAME);
        if ($folderId !== $folderParam->value) {
            (clone $items)->delete();
            $folderParam->value = $folderId;
            $folderParam->save();
        }

        $mirrored = $items->get()->keyBy('source_id');
        $source   = $this->source($user, $kind);
        foreach ($source as $sourceId => $payload) {
            $hash     = hash('sha256', json_encode($payload));
            $existing = $mirrored->get($sourceId);
            if ($existing?->hash === $hash) {
                continue;
            }
            try {
                $externalId = $graph->upsertItem($mailbox, $kind, $folderId, $existing?->external_id, $payload);
                M365MirrorItem::updateOrCreate(['user_id' => $user->id, 'kind' => $kind, 'source_id' => $sourceId], ['external_id' => $externalId, 'hash' => $hash]);
                $stats[$existing ? 'updated' : 'created']++;
            } catch (\Throwable $e) {
                $stats['failed']++;
                NLog::warning('Microsoft 365 mirror failed', ['user' => $user->id, 'kind' => $kind, 'source' => $sourceId, 'error' => $e->getMessage()]);
            }
        }

        foreach ($mirrored->reject(fn (M365MirrorItem $item, string $sourceId) => isset($source[$sourceId])) as $orphan) {
            try {
                $graph->deleteItem($mailbox, $kind, $orphan->external_id);
                $orphan->delete();
                $stats['deleted']++;
            } catch (\Throwable $e) {
                $stats['failed']++;
            }
        }
        return $stats;
    }

    public function detachAll(User $user, ?MicrosoftGraph $graph, ?string $mailbox): void {
        foreach (array_keys(self::SETTINGS) as $kind) {
            $this->detach($user, $kind, $graph, $mailbox);
        }
    }
    private function detach(User $user, string $kind, ?MicrosoftGraph $graph, ?string $mailbox): int {
        $folderParam = $user->param(self::SETTINGS[$kind]['folder']);
        if ($folderParam->value && $mailbox && $graph) {
            $graph->deleteFolder($mailbox, $kind, $folderParam->value);
        }
        if ($folderParam->value) {
            $folderParam->value = '';
            $folderParam->save();
        }
        return M365MirrorItem::where('user_id', $user->id)->where('kind', $kind)->delete();
    }

    /** @return array<string, array> */
    private function source(User $user, string $kind): array {
        $source = [];
        if ($kind === MicrosoftGraph::CALENDAR) {
            foreach ($this->calendar->events() as $event) {
                $source[$event->objectId] = GraphEvent::fromEvent($event);
            }
            return $source;
        }
        foreach ($user->getAddressBook() as $card) {
            if ($contact = GraphContact::fromVCard($card['carddata'])) {
                $source[$card['id']] = $contact;
            }
        }
        return $source;
    }
}
