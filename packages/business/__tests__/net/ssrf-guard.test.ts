import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { assertPublicUrl, checkSsrfSafety, isSsrfUnsafeUrl } = await import(
  "../../src/net/ssrf-guard"
)

const dohJsonResponse = (records: { type: number; data: string }[]) =>
  new Response(JSON.stringify({ Answer: records }), {
    status: 200,
    headers: { "content-type": "application/dns-json" },
  })

const A_RECORD = 1
const IMAGE_URL_CONTEXT_PATTERN = /image URL/

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("isSsrfUnsafeUrl", () => {
  test("rejects non-http(s) schemes", async () => {
    expect(await isSsrfUnsafeUrl("ftp://example.com")).toBe(true)
    expect(await isSsrfUnsafeUrl("file:///etc/passwd")).toBe(true)
    expect(await isSsrfUnsafeUrl("not a url")).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("rejects localhost", async () => {
    expect(await isSsrfUnsafeUrl("http://localhost/")).toBe(true)
    expect(await isSsrfUnsafeUrl("http://localhost:8080/")).toBe(true)
  })

  test("rejects loopback and cloud metadata IPs directly", async () => {
    expect(await isSsrfUnsafeUrl("http://127.0.0.1/")).toBe(true)
    expect(
      await isSsrfUnsafeUrl("http://169.254.169.254/latest/meta-data"),
    ).toBe(true)
    expect(await isSsrfUnsafeUrl("http://[::1]/")).toBe(true)
  })

  test("rejects private IPv4 ranges directly", async () => {
    expect(await isSsrfUnsafeUrl("http://10.0.0.5/")).toBe(true)
    expect(await isSsrfUnsafeUrl("http://172.16.0.5/")).toBe(true)
    expect(await isSsrfUnsafeUrl("http://192.168.1.1/")).toBe(true)
  })

  test("rejects a hostname that resolves to a private IP (DNS rebinding)", async () => {
    fetchMock.mockResolvedValue(
      dohJsonResponse([{ type: A_RECORD, data: "169.254.169.254" }]),
    )
    expect(await isSsrfUnsafeUrl("http://attacker.example.com/")).toBe(true)
  })

  test("rejects when DNS resolution fails", async () => {
    fetchMock.mockRejectedValue(new Error("network error"))
    expect(await isSsrfUnsafeUrl("http://does-not-resolve.example.com/")).toBe(
      true,
    )
  })

  test("rejects when the DoH response is not ok", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }))
    expect(await isSsrfUnsafeUrl("http://does-not-resolve.example.com/")).toBe(
      true,
    )
  })

  test("rejects when DNS returns no records", async () => {
    fetchMock.mockResolvedValue(dohJsonResponse([]))
    expect(await isSsrfUnsafeUrl("http://no-records.example.com/")).toBe(true)
  })

  test("allows a public IP resolved via DNS", async () => {
    fetchMock.mockResolvedValue(
      dohJsonResponse([{ type: A_RECORD, data: "93.184.216.34" }]),
    )
    expect(await isSsrfUnsafeUrl("https://public.example.com/")).toBe(false)
  })

  test("allows a public IP passed directly", async () => {
    expect(await isSsrfUnsafeUrl("https://93.184.216.34/")).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("respects private range boundaries precisely", async () => {
    // 172.16.0.0/12 spans 172.16.0.0 - 172.31.255.255
    expect(await isSsrfUnsafeUrl("http://172.15.255.255/")).toBe(false)
    expect(await isSsrfUnsafeUrl("http://172.31.255.255/")).toBe(true)
    expect(await isSsrfUnsafeUrl("http://172.32.0.0/")).toBe(false)
  })

  test("rejects IPv4-mapped IPv6 literals for loopback and private ranges", async () => {
    // Node's URL parser canonicalizes these to hex form (e.g. "::ffff:7f00:1")
    // before the guard ever sees them — regression test for the bypass where
    // the guard only matched the un-normalized dotted-quad string form.
    expect(await isSsrfUnsafeUrl("http://[::ffff:127.0.0.1]/")).toBe(true)
    expect(await isSsrfUnsafeUrl("http://[::ffff:10.0.0.1]/")).toBe(true)
    expect(await isSsrfUnsafeUrl("http://[::ffff:169.254.169.254]/")).toBe(true)
  })

  test("allows an IPv4-mapped IPv6 literal for a public address", async () => {
    expect(await isSsrfUnsafeUrl("http://[::ffff:93.184.216.34]/")).toBe(false)
  })
})

describe("checkSsrfSafety", () => {
  test("returns the resolved IPs alongside a safe verdict", async () => {
    fetchMock.mockResolvedValue(
      dohJsonResponse([{ type: A_RECORD, data: "93.184.216.34" }]),
    )
    const result = await checkSsrfSafety("https://public.example.com/")
    expect(result).toEqual({ unsafe: false, resolvedIps: ["93.184.216.34"] })
  })

  test("returns the literal IP when the URL already contains one", async () => {
    const result = await checkSsrfSafety("https://93.184.216.34/")
    expect(result).toEqual({ unsafe: false, resolvedIps: ["93.184.216.34"] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("assertPublicUrl", () => {
  test("resolves without throwing for a public URL", async () => {
    await expect(
      assertPublicUrl("https://93.184.216.34/"),
    ).resolves.toBeUndefined()
  })

  test("throws with the given context for a blocked URL", async () => {
    await expect(
      assertPublicUrl("http://127.0.0.1/", "image URL"),
    ).rejects.toThrow(IMAGE_URL_CONTEXT_PATTERN)
  })
})
