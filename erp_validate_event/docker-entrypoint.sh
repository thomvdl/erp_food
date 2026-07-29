#!/bin/sh
set -e

if [ ! -d node_modules ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    npm install
fi

exec npx ng serve --host 0.0.0.0 --port 4200 --poll 2000
