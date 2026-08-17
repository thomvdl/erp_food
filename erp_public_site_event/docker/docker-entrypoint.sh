#!/bin/sh
set -e

envsubst '${API_URL}' \
    < /usr/share/nginx/html/env.template.js \
    > /usr/share/nginx/html/env.js

exec "$@"
