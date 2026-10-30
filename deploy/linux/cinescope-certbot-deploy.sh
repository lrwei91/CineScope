#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/movie.lrwei91.cn ]; then
    /usr/sbin/nginx -t
    /usr/bin/systemctl reload nginx
fi
