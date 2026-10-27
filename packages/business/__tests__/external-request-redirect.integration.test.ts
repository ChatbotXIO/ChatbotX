import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { externalRequestService } from "../src/external-request/service"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(async () => ({
    unsafe: false,
    resolvedIps: ["127.0.0.1"],
  })),
}))

vi.mock("../src/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))

const closeServer = (server: Server) => {
  const { promise, reject, resolve } = Promise.withResolvers<void>()
  server.close((error) => {
    if (error) {
      reject(error)
      return
    }
    resolve()
  })
  return promise
}

const listenOnLoopback = (server: Server) => {
  const { promise, resolve } = Promise.withResolvers<void>()
  server.listen(0, "127.0.0.1", resolve)
  return promise
}

describe("externalRequestService redirect integration", () => {
  let server: Server
  // Real loopback HTTP: this workspace does not boot MSW globally, so the
  // request reaches the local server without any interceptor in the way.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await closeServer(server)
  })

  test("follows an Apps Script-style POST redirect with a GET", async () => {
    let echoMethod: string | undefined
    server = createServer((request, response) => {
      if (request.url === "/exec" && request.method === "POST") {
        response.writeHead(302, { Location: "/echo" })
        response.end()
        return
      }

      if (request.url === "/echo") {
        echoMethod = request.method
        if (request.method !== "GET") {
          response.writeHead(405)
          response.end()
          return
        }
        response.writeHead(200, { "content-type": "text/plain" })
        response.end("OK")
        return
      }

      response.writeHead(404)
      response.end()
    })
    await listenOnLoopback(server)
    const { port } = server.address() as AddressInfo

    const result = await externalRequestService.execute(
      {
        method: "POST",
        url: `http://127.0.0.1:${port}/exec`,
        headers: [{ key: "Content-Type", value: "application/json" }],
        body: { bodyType: "json", jsonBody: '{"name":"Ada"}' },
      },
      { workspaceId: "workspace-1" },
    )

    expect(echoMethod).toBe("GET")
    expect(result).toMatchObject({ statusCode: 200, responseBody: "OK" })
  })
})
