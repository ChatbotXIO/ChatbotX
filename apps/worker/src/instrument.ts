/**
 * Sentry initialization for the worker.
 *
 * This file MUST be loaded before any other module so Sentry can hook into
 * the runtime early. In production it is wired via node's `--import` flag in
 * `docker/rootfs/usr/local/bin/docker-entrypoint.sh`, so it runs ahead of every
 * worker entrypoint.
 *
 * It reads configuration straight from `process.env` (not the validated `env`
 * module) on purpose: this runs before anything else, and a missing DSN simply
 * disables Sentry rather than throwing.
 */
import { init } from "@sentry/node"

const dsn = process.env.SENTRY_DSN

if (dsn) {
  const tracesSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE
    ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0

  init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    // Errors are the priority. Performance tracing is sampled low (default off)
    // to protect the Sentry quota — raise SENTRY_TRACES_SAMPLE_RATE when needed.
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    // Identify which worker process emitted the event (set per container).
    serverName: process.env.WORKER_NAME,
  })
}
