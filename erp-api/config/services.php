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

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Connexion Google du compte client erp_public_shop (voir ShopCustomerController). `redirect`
    // pointe toujours vers cette API elle-même (jamais vers erp_public_shop) : c'est ici que Google
    // renvoie l'utilisateur après consentement, avant que le contrôleur ne redirige à son tour vers
    // `config('app.shop_url')` — même APP_URL déjà utilisé comme URL publique de l'API en dev
    // comme en prod (voir docker-compose.prod.yml).
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => rtrim(env('APP_URL', 'http://localhost:19001'), '/') . '/api/shop/customer/google/callback',
    ],

];
