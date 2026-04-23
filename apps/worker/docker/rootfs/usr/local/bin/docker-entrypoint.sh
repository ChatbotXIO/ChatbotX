#!/bin/sh

set -eu

WORKER_DIST_DIR="/app/apps/worker/dist"
NODE_BIN="/usr/local/bin/node"
# ALL_WORKERS="chat integration ai-agent default webhook trigger analytics schedule sequence-scheduler sequence-producer sequence-consumer"
ALL_WORKERS="chat integration ai-agent default webhook trigger analytics schedule sequence-scheduler"

print_usage() {
    echo "Usage: ${0} worker [all|ai-agent|analytics|chat|default|integration|schedule|sequence-consumer|sequence-producer|sequence-scheduler|trigger|webhook]" >&2
    echo "       ${0} {bash|sh}" >&2
}

resolve_worker_script() {
  case "$1" in
    "ai-agent")
      echo "${WORKER_DIST_DIR}/ai-agent/worker.mjs"
      ;;
    "analytics")
      echo "${WORKER_DIST_DIR}/analytics/worker.mjs"
      ;;
    "chat")
      echo "${WORKER_DIST_DIR}/chat/worker.mjs"
      ;;
    "default")
      echo "${WORKER_DIST_DIR}/default/worker.mjs"
      ;;
    "integration")
      echo "${WORKER_DIST_DIR}/integration/worker.mjs"
      ;;
    "schedule")
      echo "${WORKER_DIST_DIR}/schedule/worker.mjs"
      ;;
    "sequence-consumer")
      echo "${WORKER_DIST_DIR}/sequence-scheduler/worker-consumer.mjs"
      ;;
    "sequence-producer")
      echo "${WORKER_DIST_DIR}/sequence-scheduler/worker-producer.mjs"
      ;;
    "sequence-scheduler")
      echo "${WORKER_DIST_DIR}/sequence-scheduler/worker.mjs"
      ;;
    "trigger")
      echo "${WORKER_DIST_DIR}/trigger/worker.mjs"
      ;;
    "webhook")
      echo "${WORKER_DIST_DIR}/webhook/worker.mjs"
      ;;
    "events")
      echo "${WORKER_DIST_DIR}/events/worker.mjs"
      ;;
    *)
      return 1
      ;;
  esac
}

require_script() {
  if [ ! -f "$1" ]; then
    echo "Worker script not found: $1" >&2
    exit 4
  fi
}

run_all_workers() {
  pids=""

  handle_shutdown() {
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    wait || true
    exit 0
  }

  trap 'handle_shutdown' INT TERM

  # Validate all worker entrypoints first so we never start partially.
  for worker in $ALL_WORKERS; do
    script="$(resolve_worker_script "$worker")"
    require_script "$script"
  done

  for worker in $ALL_WORKERS; do
    script="$(resolve_worker_script "$worker")"
    echo "Starting worker: $worker ($script)"
    "$NODE_BIN" "$script" &
    pids="$pids $!"
  done

  while true; do
    for pid in $pids; do
      if ! kill -0 "$pid" 2>/dev/null; then
        status=0
        wait "$pid" || status=$?
        if [ "$status" -eq 0 ]; then
          status=1
        fi
        echo "Worker process $pid exited with status $status, stopping others..."
        for other_pid in $pids; do
          if [ "$other_pid" != "$pid" ]; then
            kill -TERM "$other_pid" 2>/dev/null || true
          fi
        done
        wait || true
        exit "$status"
      fi
    done
    sleep 1
  done
}

case "${1:-}" in
    "worker")
        if [ "$#" -gt 2 ]; then
            print_usage
            exit 3
        fi

        worker="${2:-all}"
        if [ "$worker" = "all" ]; then
            run_all_workers
            exit 0
        fi

        script="$(resolve_worker_script "$worker")" || {
          print_usage
          exit 3
        }
        require_script "$script"
        exec "$NODE_BIN" "$script"
        ;;
    "/bin/sh" | "sh" | "/bin/bash" | "bash")
        exec "$@"
        ;;
    *)
        print_usage
        exit 3
        ;;
esac
