// @vitest-environment node
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { PassThrough } from "node:stream"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  checkSsrfSafety: vi.fn(),
  deleteObject: vi.fn(),
  stored: [] as Buffer[],
}))

vi.mock("@chatbotx.io/business/net/ssrf-guard", () => ({
  checkSsrfSafety: mocks.checkSsrfSafety,
}))
vi.mock("@chatbotx.io/business", () => ({
  MediaImportRefusedError: class MediaImportRefusedError extends Error {},
}))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))
vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
  createUpload: () => {
    const stream = new PassThrough()
    const done = new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => mocks.stored.push(chunk))
      stream.on("end", () => resolve())
      stream.on("error", reject)
    })
    return { done, stream }
  },
}))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn() } }))

const { importMediaFromUrl, pinnedLookup } = await import(
  "@/lib/media/import-media-from-url"
)

const ALLOWED = ["image/png"]
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const LOOPBACK = "127.0.0.1"

let server: Server
let hostsSeen: (string | undefined)[]
let port: number

const input = (url: string, maxBytes = 1024) => ({
  allowedMimeTypes: ALLOWED,
  maxBytes,
  path: "public/space/ws/media-library/x",
  signal: AbortSignal.timeout(5000),
  url,
})

beforeEach(async () => {
  vi.resetAllMocks()
  mocks.stored.length = 0
  mocks.deleteObject.mockResolvedValue(undefined)
  hostsSeen = []
  server = createServer((request, response) => {
    hostsSeen.push(request.headers.host)
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "http://internal.example/secret" })
      response.end()
      return
    }
    response.writeHead(200, { "content-type": "image/png" })
    response.end(PNG)
  })
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve))
  port = (server.address() as AddressInfo).port
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe("pinnedLookup", () => {
  test("answers with the vetted addresses in both lookup shapes and never asks DNS", () => {
    const lookup = pinnedLookup(["203.0.113.7", "2001:4860:4860::8888"])
    const single = vi.fn()
    const all = vi.fn()

    lookup("anything.example", {}, single)
    lookup("anything.example", { all: true }, all)

    expect(single).toHaveBeenCalledWith(null, "203.0.113.7", 4)
    expect(all).toHaveBeenCalledWith(null, [
      { address: "203.0.113.7", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ])
  })
})

describe("importMediaFromUrl", () => {
  test("connects to the vetted address even when the name would resolve elsewhere, keeping the Host header", async () => {
    // The name resolves nowhere in DNS (and would answer differently the second
    // time a rebinding host is asked); only the vetted address is reachable.
    mocks.checkSsrfSafety.mockResolvedValue({
      resolvedIps: [LOOPBACK],
      unsafe: false,
    })

    const result = await importMediaFromUrl(
      input(`http://rebind.invalid:${port}/a.png`),
    )

    expect(result).toMatchObject({ mimeType: "image/png", size: PNG.length })
    expect(hostsSeen).toEqual([`rebind.invalid:${port}`])
    expect(Buffer.concat(mocks.stored)).toEqual(PNG)
    // The guard is asked once per request, and it is the guard's answer that is dialled.
    expect(mocks.checkSsrfSafety).toHaveBeenCalledTimes(1)
  })

  test("a redirect is vetted again and refused when it points inside", async () => {
    mocks.checkSsrfSafety.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("internal.example")
          ? { unsafe: true }
          : { resolvedIps: [LOOPBACK], unsafe: false },
      ),
    )

    await expect(
      importMediaFromUrl(input(`http://public.invalid:${port}/redirect`)),
    ).rejects.toThrow("The provided URL is not allowed")
    expect(mocks.checkSsrfSafety).toHaveBeenCalledTimes(2)
    expect(hostsSeen).toEqual([`public.invalid:${port}`])
  })

  test("a URL the guard refuses is never requested", async () => {
    mocks.checkSsrfSafety.mockResolvedValue({ unsafe: true })

    await expect(
      importMediaFromUrl(input(`http://localhost:${port}/a.png`)),
    ).rejects.toThrow("not allowed")
    expect(hostsSeen).toEqual([])
  })

  test("a body larger than the cap is refused and its object dropped", async () => {
    mocks.checkSsrfSafety.mockResolvedValue({
      resolvedIps: [LOOPBACK],
      unsafe: false,
    })

    await expect(
      importMediaFromUrl(input(`http://big.invalid:${port}/a.png`, 2)),
    ).rejects.toThrow("larger")
  })

  test("a content type outside the allowed set is refused", async () => {
    mocks.checkSsrfSafety.mockResolvedValue({
      resolvedIps: [LOOPBACK],
      unsafe: false,
    })

    await expect(
      importMediaFromUrl({
        ...input(`http://t.invalid:${port}/a.png`),
        allowedMimeTypes: ["image/jpeg"],
      }),
    ).rejects.toThrow("not an image or video")
    expect(mocks.stored).toEqual([])
  })
})
