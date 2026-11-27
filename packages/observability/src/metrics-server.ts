import { createServer, type Server } from "node:http"
import {
  ensureDefaultMetrics,
  getMetrics,
  getMetricsContentType,
} from "./metrics"

export type MetricsServer = {
  close: () => Promise<void>
  port: number
}

let runningServer: MetricsServer | null = null

const resolvePort = (port: number | string | undefined): number | undefined => {
  if (port === undefined || port === "") {
    return
  }

  const parsedPort = typeof port === "number" ? port : Number.parseInt(port, 10)
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65_535) {
    throw new Error("METRICS_PORT must be an integer between 0 and 65535")
  }

  return parsedPort
}

const listen = (server: Server, port: number): Promise<number> => {
  const { promise, reject, resolve } = Promise.withResolvers<number>()
  const handleError = (error: Error) => {
    server.off("listening", handleListening)
    reject(error)
  }
  const handleListening = () => {
    server.off("error", handleError)
    const address = server.address()
    if (!address || typeof address === "string") {
      reject(new Error("Metrics server did not expose a TCP port"))
      return
    }
    resolve(address.port)
  }

  server.once("error", handleError)
  server.once("listening", handleListening)
  server.listen(port)
  return promise
}

export const startMetricsServer = async (
  input: { port?: number | string } = {},
): Promise<MetricsServer | null> => {
  const port = resolvePort(input.port ?? process.env.METRICS_PORT)
  if (port === undefined) {
    return null
  }

  ensureDefaultMetrics()

  if (runningServer) {
    return runningServer
  }

  const server = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/metrics") {
      response.writeHead(404)
      response.end()
      return
    }

    try {
      response.writeHead(200, { "content-type": getMetricsContentType() })
      response.end(await getMetrics())
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
      response.end("Unable to collect metrics")
    }
  })

  const listeningPort = await listen(server, port)
  runningServer = {
    port: listeningPort,
    close: async () => {
      if (!server.listening) {
        return
      }
      const { promise, reject, resolve } = Promise.withResolvers<void>()
      server.close((error) => (error ? reject(error) : resolve()))
      await promise
      runningServer = null
    },
  }
  return runningServer
}
