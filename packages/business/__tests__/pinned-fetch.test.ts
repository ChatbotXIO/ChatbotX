import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { Agent } from "undici"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { pinnedGet } from "../src/net/pinned-fetch"

type Seen = { host: string | undefined; url: string | undefined }

// undici's promise-form close() re-enters close(callback); count only the
// outer, callback-less calls.
const closeCalls = (spy: { mock: { calls: unknown[][] } }): number =>
  spy.mock.calls.filter((args) => args.length === 0).length

describe("pinnedGet with a real undici connection", () => {
  let server: Server
  let port: number
  let seen: Seen[]
  let respond: (response: import("node:http").ServerResponse) => void

  beforeEach(async () => {
    seen = []
    respond = (response) => {
      response.statusCode = 200
      response.end("ok")
    }
    server = createServer((request: IncomingMessage, response) => {
      seen.push({ host: request.headers.host, url: request.url })
      respond(response)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    port = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  test("dials the pinned address while Host keeps the original hostname", async () => {
    // `pinned.test` does not resolve (reserved TLD): reaching the local server
    // proves the socket went to the pinned IP, not to the URL hostname.
    const response = await pinnedGet({
      address: "127.0.0.1",
      url: `http://pinned.test:${port}/x`,
    })

    expect(await response.text()).toBe("ok")
    expect(seen).toEqual([{ host: `pinned.test:${port}`, url: "/x" }])
  })

  test("without the pin the hostname does not reach the local server", async () => {
    const { fetch: undiciFetch } = await import("undici")
    const unpinned = new Agent()
    await expect(
      undiciFetch(`http://pinned.test:${port}/x`, { dispatcher: unpinned }),
    ).rejects.toThrow()
    await unpinned.close()
    expect(seen).toEqual([])
  })

  test("closes the dispatcher once when the body is read, and on error", async () => {
    const close = vi.spyOn(Agent.prototype, "close")
    const response = await pinnedGet({
      address: "127.0.0.1",
      url: `http://pinned.test:${port}/x`,
    })
    await response.text()
    expect(closeCalls(close)).toBe(1)

    await expect(
      pinnedGet({ address: "127.0.0.1", url: "http://pinned.test:1/x" }),
    ).rejects.toThrow()
    expect(closeCalls(close)).toBe(2)
  })

  test("closes the dispatcher when the request is aborted", async () => {
    respond = () => undefined
    const close = vi.spyOn(Agent.prototype, "close")
    const controller = new AbortController()
    const pending = pinnedGet({
      address: "127.0.0.1",
      signal: controller.signal,
      url: `http://pinned.test:${port}/hang`,
    })
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    controller.abort()
    await expect(pending).rejects.toThrow()
    expect(closeCalls(close)).toBe(1)
  })
})
