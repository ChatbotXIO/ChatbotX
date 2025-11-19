#!/bin/sh

set -e

case "${1:-}" in
    "worker")
        exec /bin/sh -c '/usr/bin/tini -- /usr/bin/supervisord -n -c /etc/supervisord-worker.conf'
        ;;
    "/bin/sh" | "sh" | "/bin/bash" | "bash" )
        exec "$@"
        ;;
    *)
        echo "Usage: ${0} {worker|bash|sh}" >&2
        exit 3
        ;;
esac
