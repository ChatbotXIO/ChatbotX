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

describe("IPv6 literals", () => {
  test.each([
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["febf::1", "link-local, top of fe80::/10"],
    ["fe81::1", "link-local"],
    ["fec0::1", "site-local (deprecated)"],
    ["fc00::1", "unique local"],
    ["fd12:3456:789a::1", "unique local"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:7f00:1", "IPv4-mapped loopback in hex"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
    ["::ffff:169.254.169.254", "IPv4-mapped cloud metadata"],
    ["0:0:0:0:0:ffff:c0a8:1", "IPv4-mapped private, long form"],
    ["::127.0.0.1", "IPv4-compatible loopback"],
    ["64:ff9b::7f00:1", "NAT64 to loopback"],
    ["64:ff9b::a00:1", "NAT64 to private 10/8"],
    ["64:ff9b::169.254.169.254", "NAT64 to cloud metadata"],
    ["64:ff9b:1::1", "NAT64 local-use"],
    ["2002:7f00:1::1", "6to4 of loopback"],
    ["2002:a9fe:a9fe::1", "6to4 of the metadata address"],
    ["100::1", "discard-only"],
    ["2001:db8::1", "documentation"],
  ])("blocks %s (%s)", async (address) => {
    const result = await checkSsrfSafety(`http://[${address}]/`)

    expect(result).toEqual({ unsafe: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([
    ["2606:4700:4700::1111", "public"],
    ["2001:4860:4860::8888", "public"],
    ["::ffff:8.8.8.8", "IPv4-mapped public"],
    ["64:ff9b::808:808", "NAT64 to a public address"],
    ["2002:808:808::1", "6to4 of a public address"],
    ["fe7f::1", "just below fe80::/10"],
  ])("does not block %s (%s)", async (address) => {
    // The URL parser rewrites the literal to its canonical form, so only the verdict is compared.
    expect((await checkSsrfSafety(`http://[${address}]/`)).unsafe).toBe(false)
  })

  test("a DNS answer carrying a link-local or mapped address blocks the host", async () => {
    for (const data of ["febf::1", "::ffff:192.168.0.10"]) {
      fetchMock.mockResolvedValueOnce(dohJsonResponse([{ data, type: 28 }]))

      expect(await isSsrfUnsafeUrl("http://rebind.example/")).toBe(true)
    }
  })
})
