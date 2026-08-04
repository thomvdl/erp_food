<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Auth Bearer (Sanctum), pas de cookie (`supports_credentials` reste false) — voir
    | erp-app/src/app/core/auth.service.ts et équivalents. Ouvert par défaut (comportement dev
    | inchangé) ; en prod, `CORS_ALLOWED_ORIGINS` est fixé par docker-compose.prod.yml aux vrais
    | sous-domaines (voir Readme.md, "Déploiement en production").
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', '*'))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
