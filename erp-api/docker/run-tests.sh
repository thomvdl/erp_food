#!/bin/sh
set -e

# À utiliser TOUJOURS pour lancer la suite de tests dans le conteneur `api` — jamais
# `php artisan test` directement là-dedans.
#
# docker-compose.yml fixe DB_CONNECTION/DB_HOST/DB_PORT/SESSION_DRIVER/CACHE_STORE/
# QUEUE_CONNECTION comme vraies variables d'environnement du conteneur (voir "environment:" du
# service `api`), pour l'usage normal en dev. phpunit.xml essaie de les remplacer par sqlite/array
# via <env force="true">, mais `force` ne réécrit que $_ENV/getenv() — PAS $_SERVER, et Laravel
# (Illuminate\Support\Env) lit $_SERVER en priorité. Résultat vérifié : `php artisan test` dans ce
# conteneur tournait réellement contre la vraie base MySQL de dev (`erp_v2`) au lieu de sqlite
# :memory:, et RefreshDatabase a fini par la vider complètement (users, products, tout — plus
# aucune connexion possible tant qu'elle n'est pas reseedée).
#
# Fix : désinscrire ces variables du shell AVANT de lancer PHP, pour que $_SERVER ne les
# contienne jamais — <env force="true"> dans phpunit.xml prend alors le relai normalement.
exec env \
  -u DB_CONNECTION \
  -u DB_HOST \
  -u DB_PORT \
  -u SESSION_DRIVER \
  -u CACHE_STORE \
  -u QUEUE_CONNECTION \
  php artisan test "$@"
