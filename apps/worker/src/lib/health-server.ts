import { createServer } from "node:http"
import type { Worker } from "bullmq"
import { registry } from "./metrics"

/**
 * Minimal liveness + metrics HTTP server for one worker process.
 *
 * `worker all` (the default docker entrypoint mode — see
 * `docker/rootfs/usr/local/bin/docker-entrypoint.sh`) runs every queue's
 * worker as its own OS process, not threads in one process, so each process
 * needs its own port — callers pass a per-queue default (see `env.ts`) so
 * running every worker in one container never collides on the same port.
 *
 * `GET /health` is 200 while the BullMQ `Worker` in this process is running,
 * 503 once it has started closing (e.g. mid-shutdown) — orchestrators should
 * treat 503 as "stop routing new work here", not "kill immediately".
 * `GET /metrics` serves the shared prom-client registry from `./metrics.ts`.
 */
export function startHealthServer(props: {
  port: number
  worker: Worker
}): void {
  const { port, worker } = props

  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405).end()
      return
    }

    if (req.url === "/health") {
      const isRunning = worker.isRunning()
      res.writeHead(isRunning ? 200 : 503, {
        "Content-Type": "text/plain",
      })
      res.end(isRunning ? "ok" : "shutting down")
      return
    }

    if (req.url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "Content-Type": registry.contentType })
          res.end(body)
        })
        .catch((err: unknown) => {
          res.writeHead(500).end(String(err))
        })
      return
    }

    res.writeHead(404).end()
  })

  server.listen(port)
}
