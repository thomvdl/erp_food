#!/bin/sh
set -e

echo "En attente de la base de données (${DB_HOST}:${DB_PORT})..."
until php -r "new PDO('mysql:host=${DB_HOST};port=${DB_PORT}', getenv('DB_USERNAME'), getenv('DB_PASSWORD'));" 2>/dev/null; do
  sleep 2
done
echo "Base de données prête."

php artisan migrate --force
php artisan db:seed --force

if [ "$APP_ENV" = "production" ]; then
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
fi

exec "$@"
