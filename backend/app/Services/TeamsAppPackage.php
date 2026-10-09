<?php

namespace App\Services;

use ZipArchive;

class TeamsAppPackage {
    public const FILENAME = 'talvis-teams.zip';

    /**
     * @see https://learn.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema
     */
    public static function manifest(string $appId, string $version = '1.0.0'): array {
        return [
            '$schema'         => 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json',
            'manifestVersion' => '1.17',
            'version'         => $version,
            'id'              => $appId,
            'developer'       => [
                'name'          => 'at² software',
                'websiteUrl'    => config('app.url'),
                'privacyUrl'    => config('app.url'),
                'termsOfUseUrl' => config('app.url'),
            ],
            'name'        => ['short' => 'TALVIS', 'full' => 'TALVIS'],
            'description' => [
                'short' => 'Project notifications from TALVIS',
                'full'  => 'Posts project, pipeline, issue and uptime notifications from TALVIS into the project channels and sends personal notifications as direct messages.',
            ],
            'icons'       => ['color' => 'color.png', 'outline' => 'outline.png'],
            'accentColor' => '#E020E0',
            'bots'        => [[
                'botId'              => $appId,
                'scopes'             => ['team', 'personal'],
                'supportsFiles'      => false,
                'isNotificationOnly' => true,
            ]],
            'permissions'  => ['identity', 'messageTeamMembers'],
            'validDomains' => array_filter([parse_url(config('app.url'), PHP_URL_HOST)]),
        ];
    }

    public static function build(string $appId, string $path, string $version = '1.0.0'): string {
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('manifest.json', json_encode(self::manifest($appId, $version), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $zip->addFile(base_path('deploy/teams-app/color.png'), 'color.png');
        $zip->addFile(base_path('deploy/teams-app/outline.png'), 'outline.png');
        $zip->close();
        return $path;
    }
}
