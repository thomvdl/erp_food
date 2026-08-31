<?php

/**
 * Force les variables de test dans $_ENV/$_SERVER avant que Laravel ne boote — indispensable ici
 * car il n'existe aucun fichier .env dans le conteneur (docker-compose.yml injecte DB_CONNECTION/
 * DB_HOST/... comme vraies variables d'environnement du process, voir "environment:" du service
 * api) : ces valeurs sont déjà dans $_ENV/$_SERVER avant que PHPUnit ne démarre.
 *
 * phpunit.xml (<php><env ... force="true">) NE SUFFIT PAS pour ça : PHPUnit force="true" réécrit
 * getenv()/putenv(), mais Laravel (Illuminate\Support\Env) lit $_ENV/$_SERVER en priorité, qu'il
 * force="true" ne touche pas. Résultat vécu : RefreshDatabase tournait réellement contre MySQL
 * (la vraie base de dev) au lieu de sqlite :memory:, et vidait erp_food à chaque run de la suite —
 * incident constaté deux fois de suite (voir git blame de ce fichier). Écrire directement dans
 * $_ENV/$_SERVER ici, avant `require vendor/autoload.php`, est la seule façon fiable de gagner sur
 * les variables déjà injectées par Docker.
 */
$testEnv = [
    'APP_ENV' => 'testing',
    'APP_MAINTENANCE_DRIVER' => 'file',
    'BCRYPT_ROUNDS' => '4',
    'BROADCAST_CONNECTION' => 'null',
    'CACHE_STORE' => 'array',
    'DB_CONNECTION' => 'sqlite',
    'DB_DATABASE' => ':memory:',
    'DB_HOST' => '',
    'DB_PORT' => '',
    'DB_URL' => '',
    'MAIL_MAILER' => 'array',
    'QUEUE_CONNECTION' => 'sync',
    'SESSION_DRIVER' => 'array',
    'PULSE_ENABLED' => 'false',
    'TELESCOPE_ENABLED' => 'false',
    'NIGHTWATCH_ENABLED' => 'false',
];

foreach ($testEnv as $key => $value) {
    putenv("{$key}={$value}");
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
}

require __DIR__ . '/../vendor/autoload.php';
