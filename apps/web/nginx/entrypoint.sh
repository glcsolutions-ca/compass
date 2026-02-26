#!/bin/sh
set -eu

if [ -z "${API_BASE_URL:-}" ]; then
  echo "API_BASE_URL is required" >&2
  exit 1
fi

api_base_url="${API_BASE_URL%/}"
mkdir -p /tmp/nginx/conf.d
sed "s|__API_BASE_URL__|${api_base_url}|g" /etc/nginx/templates/default.conf.template \
  > /tmp/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
