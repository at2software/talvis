<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain'   => env('MAILGUN_DOMAIN'),
        'secret'   => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme'   => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key'    => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],
    'openai' => [
        'endpoint'     => env('OPENAI_ENDPOINT'),
        'access_token' => env('OPENAI_ACCESS_TOKEN'),
    ],
    'slack' => [
        'api_endpoint' => env('SLACK_API_ENDPOINT', ''),
        'access_token' => env('SLACK_ACCESS_TOKEN', ''),
        'endpoint'     => env('SLACK_ENDPOINT', env('SLACK_API_ENDPOINT', '')),
        'team_id'      => env('SLACK_TEAM_ID', ''),
        'team_name'    => env('SLACK_TEAM_NAME', ''),
        'login_id'     => env('SLACK_LOGIN_ID', ''),
        'password'     => env('SLACK_PASSWORD', ''),
    ],
    'gitlab' => [
        'url' => env('GITLAB_URL', ''),
    ],
    'fints' => [
        'driver' => env('FINTS_DRIVER', 'external'),
    ],
    'admin' => [
        'email'    => env('ADMIN_EMAIL', 'admin@example.com'),
        'password' => env('ADMIN_PASSWORD', 'changeme'),
    ],

];
