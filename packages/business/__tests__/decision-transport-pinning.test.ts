import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const ssrf = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock("../src/net/ssrf-guard", () => ({ checkSsrfSafety: ssrf.check }))

const { postDecisionRequest } = await import("../src/decision/transport")

describe("postDecisionRequest connects to the validated address", () => {
  let server: Server
  let port: number
  let hosts: Array<string | undefined>

  beforeEach(async () => {
    hosts = []
    server = createServer((request, response) => {
      hosts.push(request.headers.host)
      response.setHeader("content-type", "application/json")
      response.end('{"ok":true}')
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    port = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  test("the socket goes to the pinned IP and Host stays the hostname", async () => {
    ssrf.check.mockResolvedValue({
      unsafe: false,
      resolvedIps: ["127.0.0.1"],
    })

    const result = await postDecisionRequest({
      authorization: "key",
      body: { questions: {} },
      endpoint: `http://decision.pinned.test:${port}/v1`,
      providerKind: "systemOneCompatible",
    })

    expect(result).toEqual({ body: '{"ok":true}', status: 200 })
    expect(hosts).toEqual([`decision.pinned.test:${port}`])
  })
})
