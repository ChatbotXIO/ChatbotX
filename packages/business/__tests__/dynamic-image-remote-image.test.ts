import { createCanvas } from "@napi-rs/canvas"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { loadRemoteImage } from "../src/dynamic-image/render"

const undiciMock = vi.hoisted(() => ({
  agentOptions: [] as Array<{
    connect?: {
      lookup?: (
        hostname: string,
        options: { all?: boolean },
        callback: (error: null, address: unknown, family?: number) => void,
      ) => void
      servername?: string
    }
  }>,
  closes: { count: 0 },
  fetch: vi.fn(),
}))
const ssrfMock = vi.hoisted(() => ({ check: vi.fn() }))

vi.mock("undici", () => ({
  Agent: class {
    constructor(options: (typeof undiciMock.agentOptions)[number]) {
      undiciMock.agentOptions.push(options)
    }
    close = () => {
      undiciMock.closes.count += 1
      return Promise.resolve()
    }
  },
  fetch: undiciMock.fetch,
}))
vi.mock("../src/net/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/net/ssrf-guard")>()
  ssrfMock.check.mockImplementation(actual.checkSsrfSafety)
  return { ...actual, checkSsrfSafety: ssrfMock.check }
})

const STORAGE_URL = "http://localhost:9000/storage"
const PUBLIC_IP_URL = "http://93.184.216.34/logo.png"

const pngBytes = (): Buffer => createCanvas(2, 2).toBuffer("image/png")

const imageResponse = (): Response =>
  new Response(new Uint8Array(pngBytes()), { status: 200 })

const redirectTo = (location: string): Response =>
  new Response(null, { status: 307, headers: { location } })

describe("loadRemoteImage SSRF guard", () => {
  const fetchMock = undiciMock.fetch
  const storageFetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    storageFetchMock.mockReset()
    undiciMock.agentOptions.length = 0
    undiciMock.closes.count = 0
    vi.stubGlobal("fetch", storageFetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test.each([
    "http://127.0.0.1/a.png",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/a.png",
    "http://localhost/a.png",
    "http://[::1]/a.png",
    "file:///etc/passwd",
  ])("refuses %s without fetching it", async (url) => {
    await expect(loadRemoteImage(url)).rejects.toThrow("not allowed")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("loads an image from a public address", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse())

    const image = await loadRemoteImage(PUBLIC_IP_URL)

    expect(image.width).toBe(2)
    expect(fetchMock).toHaveBeenCalledWith(
      PUBLIC_IP_URL,
      expect.objectContaining({ redirect: "manual" }),
    )
    const lookup = undiciMock.agentOptions[0]?.connect?.lookup
    const single = vi.fn()
    const all = vi.fn()
    lookup?.("anything.test", {}, single)
    lookup?.("anything.test", { all: true }, all)
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4)
    expect(all).toHaveBeenCalledWith(null, [
      { address: "93.184.216.34", family: 4 },
    ])
  })

  test("closes the dispatcher after a redirect with a body", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response("redirect body", {
          status: 307,
          headers: { location: "http://93.184.216.35/real.png" },
        }),
      )
      .mockResolvedValueOnce(imageResponse())

    await loadRemoteImage(PUBLIC_IP_URL)

    expect(undiciMock.agentOptions).toHaveLength(2)
    expect(undiciMock.closes.count).toBe(2)
  })

  test("closes the dispatcher on a non-OK response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }))

    await expect(loadRemoteImage(PUBLIC_IP_URL)).rejects.toThrow("500")
    expect(undiciMock.closes.count).toBe(1)
  })

  test("refuses a redirect to a private address", async () => {
    fetchMock.mockResolvedValueOnce(redirectTo("http://10.0.0.1/secret.png"))

    await expect(loadRemoteImage(PUBLIC_IP_URL)).rejects.toThrow("not allowed")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("follows a redirect between public addresses", async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo("http://93.184.216.35/real.png"))
      .mockResolvedValueOnce(imageResponse())

    await expect(loadRemoteImage(PUBLIC_IP_URL)).resolves.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("loads the workspace's own storage even when it is private", async () => {
    storageFetchMock.mockResolvedValueOnce(imageResponse())

    await expect(
      loadRemoteImage(`${STORAGE_URL}/public/a.png`, {
        trustedStorageUrl: STORAGE_URL,
      }),
    ).resolves.toBeDefined()
  })

  test("does not trust another path or port on the storage host", async () => {
    await expect(
      loadRemoteImage("http://localhost:9000/other/a.png", {
        trustedStorageUrl: STORAGE_URL,
      }),
    ).rejects.toThrow("not allowed")
    await expect(
      loadRemoteImage("http://localhost:9001/storage/a.png", {
        trustedStorageUrl: STORAGE_URL,
      }),
    ).rejects.toThrow("not allowed")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("still refuses a redirect from the storage to a private address", async () => {
    storageFetchMock.mockResolvedValueOnce(
      redirectTo("http://169.254.169.254/latest/meta-data"),
    )

    await expect(
      loadRemoteImage(`${STORAGE_URL}/public/a.png`, {
        trustedStorageUrl: STORAGE_URL,
      }),
    ).rejects.toThrow("not allowed")
  })

  test("refuses an image larger than the size cap", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(1), {
        status: 200,
        headers: { "content-length": String(50 * 1024 * 1024) },
      }),
    )

    await expect(loadRemoteImage(PUBLIC_IP_URL)).rejects.toThrow("larger than")
  })

  describe("DNS rebinding", () => {
    test("connects to the validated address, keeping the hostname for SNI", async () => {
      ssrfMock.check.mockResolvedValueOnce({
        resolvedIps: ["93.184.216.34"],
        unsafe: false,
      })
      fetchMock.mockResolvedValueOnce(imageResponse())

      await loadRemoteImage("https://cdn.example.com/logo.png")

      expect(ssrfMock.check).toHaveBeenCalledTimes(1)
      expect(undiciMock.agentOptions).toHaveLength(1)
      expect(undiciMock.agentOptions[0]?.connect?.servername).toBe(
        "cdn.example.com",
      )
      expect(undiciMock.agentOptions[0]?.connect).not.toHaveProperty("host")
      expect(fetchMock).toHaveBeenCalledWith(
        "https://cdn.example.com/logo.png",
        expect.objectContaining({ dispatcher: expect.anything() }),
      )
    })

    test("pins each redirect hop to its own validated address", async () => {
      ssrfMock.check
        .mockResolvedValueOnce({
          resolvedIps: ["93.184.216.34"],
          unsafe: false,
        })
        .mockResolvedValueOnce({
          resolvedIps: ["93.184.216.99"],
          unsafe: false,
        })
      fetchMock
        .mockResolvedValueOnce(redirectTo("https://img.example.org/real.png"))
        .mockResolvedValueOnce(imageResponse())

      await loadRemoteImage("https://cdn.example.com/logo.png")

      const pinned = undiciMock.agentOptions.map((o) => {
        const callback = vi.fn()
        o.connect?.lookup?.("ignored.test", {}, callback)
        return {
          address: callback.mock.calls[0]?.[1],
          servername: o.connect?.servername,
        }
      })
      expect(pinned).toEqual([
        { address: "93.184.216.34", servername: "cdn.example.com" },
        { address: "93.184.216.99", servername: "img.example.org" },
      ])
    })

    test("refuses a hostname whose resolution is private, without connecting", async () => {
      ssrfMock.check.mockResolvedValueOnce({ unsafe: true })

      await expect(
        loadRemoteImage("https://rebind.example.com/logo.png"),
      ).rejects.toThrow("not allowed")
      expect(fetchMock).not.toHaveBeenCalled()
      expect(undiciMock.agentOptions).toHaveLength(0)
    })
  })
})
