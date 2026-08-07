#!/bin/sh
set -e

envsubst '${API_URL} ${REVERB_HOST} ${REVERB_PORT} ${REVERB_APP_KEY}' \
    < /usr/share/nginx/html/env.template.js \
    > /usr/share/nginx/html/env.js

exec "$@"
