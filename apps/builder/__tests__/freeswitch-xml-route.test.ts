// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const renderFreeswitchXml = vi.fn()
const checkFreeswitchXmlRateLimit = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()

// Only the renderer is mocked; the node parsing / per-node credential
// resolution run for real so node-secret isolation is exercised end to end.
vi.mock("@chatbotx.io/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/business")>()
  return {
    parseFreeswitchNodes: actual.parseFreeswitchNodes,
    resolveFreeswitchNodeXmlCredentials:
      actual.resolveFreeswitchNodeXmlCredentials,
    renderFreeswitchXml,
  }
})

vi.mock("@/lib/log", () => ({
  logger: { error: loggerError, warn: loggerWarn, info: vi.fn() },
}))

// Only `checkFreeswitchXmlRateLimit` is mocked — `getFreeswitchClientIp`
// (the trusted-proxy-aware IP resolver) runs for real so the security
// property under test (spoofed XFF never trusted) is exercised end to end.
vi.mock(
  "@/lib/rate-limit/freeswitch-xml-rate-limit",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/lib/rate-limit/freeswitch-xml-rate-limit")
      >()
    return { ...actual, checkFreeswitchXmlRateLimit }
  },
)

let mockedEnv: {
  FS_XML_BASIC_USER?: string
  FS_XML_BASIC_PASS?: string
  FS_XML_ALLOWED_IPS?: string[]
  FS_XML_TRUSTED_PROXY_CIDRS?: string[]
  FS_NODES?: string
  FS_SIP_DOMAIN?: string
  FS_WSS_URL?: string
  TURN_URL?: string
  FS_MAX_RING_TARGETS?: number
  FS_RECORDINGS_DIR?: string
}

vi.mock("@/env", () => ({
  get env() {
    return mockedEnv
  },
}))

const AUTH_HEADER = `Basic ${Buffer.from("fsuser:fspass").toString("base64")}`

beforeEach(() => {
  mockedEnv = {
    FS_XML_BASIC_USER: "fsuser",
    FS_XML_BASIC_PASS: "fspass",
    FS_XML_ALLOWED_IPS: ["203.0.113.9"],
    FS_XML_TRUSTED_PROXY_CIDRS: undefined,
    FS_NODES: undefined,
    FS_SIP_DOMAIN: "sip.example.com",
    FS_WSS_URL: "wss://sip.example.com",
    TURN_URL: "turn:sip.example.com",
    FS_MAX_RING_TARGETS: 8,
    FS_RECORDINGS_DIR: "/recordings",
  }
  renderFreeswitchXml.mockReset()
  checkFreeswitchXmlRateLimit.mockReset()
  checkFreeswitchXmlRateLimit.mockResolvedValue({
    limited: false,
    retryAfter: 0,
  })
  loggerError.mockReset()
  loggerWarn.mockReset()
})

// Several tests stub NODE_ENV=production; never let that leak forward.
afterEach(() => {
  vi.unstubAllEnvs()
})

const { POST } = await import("../src/app/api/freeswitch/xml/route")
const { isIpAllowlisted } = await import(
  "@/lib/rate-limit/freeswitch-xml-rate-limit"
)

const makeRequest = (
  init: { auth?: string; xff?: string; body?: string; proto?: string } = {},
) =>
  new Request("http://localhost/api/freeswitch/xml", {
    method: "POST",
    headers: {
      authorization: init.auth ?? AUTH_HEADER,
      ...(init.xff === undefined ? {} : { "x-forwarded-for": init.xff }),
      ...(init.proto ? { "x-forwarded-proto": init.proto } : {}),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: init.body ?? "section=dialplan&hostname=default",
  })

test("returns 401 when basic auth is missing", async () => {
  const req = makeRequest({ auth: "" })
  const res = await POST(req as never)
  expect(res.status).toBe(401)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("returns 401 when basic auth credentials are wrong", async () => {
  const wrong = `Basic ${Buffer.from("fsuser:wrong").toString("base64")}`
  const req = makeRequest({ auth: wrong })
  const res = await POST(req as never)
  expect(res.status).toBe(401)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("with no trusted-proxy config, a spoofed left-most XFF is ignored and the request is allowed through (auth is the real gate)", async () => {
  // No FS_XML_TRUSTED_PROXY_CIDRS: the allowlist check is inactive by
  // design, so a request presenting a fake allowlisted-looking XFF must
  // still succeed ONLY because Basic auth is valid — not because of the
  // spoofed header.
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")
  const req = makeRequest({ xff: "203.0.113.9, 9.9.9.9" })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
  expect(loggerWarn).toHaveBeenCalledWith(
    expect.stringContaining("FS_XML_TRUSTED_PROXY_CIDRS"),
  )
})

test("an allowlisted spoof still fails without valid Basic auth", async () => {
  const wrong = `Basic ${Buffer.from("fsuser:wrong").toString("base64")}`
  const req = makeRequest({ auth: wrong, xff: "203.0.113.9" })
  const res = await POST(req as never)
  expect(res.status).toBe(401)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("with trusted proxy CIDRs configured, the right-most untrusted hop is used and an unallowlisted real client is rejected", async () => {
  mockedEnv.FS_XML_TRUSTED_PROXY_CIDRS = ["10.0.0.0/8"]
  mockedEnv.FS_XML_ALLOWED_IPS = ["198.51.100.1"]
  // Chain: <spoofed-leftmost>, <trusted-proxy-hop>, <real-peer-that-talked-to-proxy>
  const req = makeRequest({ xff: "198.51.100.1, 10.1.2.3, 203.0.113.55" })
  const res = await POST(req as never)
  expect(res.status).toBe(403)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("with trusted proxy CIDRs configured, the right-most untrusted hop matching the allowlist is accepted", async () => {
  mockedEnv.FS_XML_TRUSTED_PROXY_CIDRS = ["10.0.0.0/8"]
  mockedEnv.FS_XML_ALLOWED_IPS = ["203.0.113.55"]
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")
  const req = makeRequest({ xff: "198.51.100.1, 10.1.2.3, 203.0.113.55" })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
})

test("returns 429 once repeated FAILED auth attempts exceed the rate limit", async () => {
  checkFreeswitchXmlRateLimit.mockResolvedValue({
    limited: true,
    retryAfter: 7,
  })
  const req = makeRequest({ auth: "Basic d3Jvbmc6d3Jvbmc=" })
  const res = await POST(req as never)
  expect(res.status).toBe(429)
  expect(res.headers.get("Retry-After")).toBe("7")
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("authenticated FreeSWITCH traffic is never rate limited", async () => {
  checkFreeswitchXmlRateLimit.mockResolvedValue({
    limited: true,
    retryAfter: 7,
  })
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")
  const req = makeRequest({ body: "section=dialplan&hostname=default" })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
  expect(checkFreeswitchXmlRateLimit).not.toHaveBeenCalled()
})

test("happy path returns the service's XML with no-store", async () => {
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")
  const req = makeRequest({ body: "section=dialplan&hostname=default" })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
  expect(res.headers.get("Content-Type")).toContain("text/xml")
  expect(res.headers.get("Cache-Control")).toBe("no-store")
  const text = await res.text()
  expect(text).toBe("<document>ok</document>")
  expect(renderFreeswitchXml).toHaveBeenCalledWith(
    expect.objectContaining({ section: "dialplan", hostname: "default" }),
    expect.objectContaining({ maxRingTargets: 8 }),
  )
})

test("a bad section still returns a not-found XML document with 200", async () => {
  renderFreeswitchXml.mockResolvedValue(
    '<document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>',
  )
  const req = makeRequest({
    body: "section=configuration&key_value=bogus&hostname=default",
  })
  const res = await POST(req as never)
  const text = await res.text()
  expect(text).toContain("not found")
})

test("production without any proof of TLS (no proxy config, no header) is rejected", async () => {
  vi.stubEnv("NODE_ENV", "production")
  const req = makeRequest()
  const res = await POST(req as never)
  expect(res.status).toBe(403)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("production accepts x-forwarded-proto=https only from a configured trusted proxy", async () => {
  vi.stubEnv("NODE_ENV", "production")
  mockedEnv.FS_XML_TRUSTED_PROXY_CIDRS = ["10.0.0.0/8"]
  mockedEnv.FS_XML_ALLOWED_IPS = ["203.0.113.9"]
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")
  const req = makeRequest({ proto: "https", xff: "203.0.113.9, 10.1.2.3" })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
})

test("a node's credentials cannot fetch another node's XML (node-secret isolation)", async () => {
  mockedEnv.FS_NODES = JSON.stringify({
    a: {
      sipDomain: "a.example.com",
      wssUrl: "wss://a",
      turnUrl: "turn:a",
      xmlBasicUser: "node-a",
      xmlBasicPass: "pass-a",
    },
    b: {
      sipDomain: "b.example.com",
      wssUrl: "wss://b",
      turnUrl: "turn:b",
      xmlBasicUser: "node-b",
      xmlBasicPass: "pass-b",
    },
  })
  const authA = `Basic ${Buffer.from("node-a:pass-a").toString("base64")}`
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")

  const crossNode = await POST(
    makeRequest({
      auth: authA,
      body: "section=configuration&key_value=sofia.conf&hostname=b",
    }) as never,
  )
  expect(crossNode.status).toBe(401)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()

  const ownNode = await POST(
    makeRequest({
      auth: authA,
      body: "section=configuration&key_value=sofia.conf&hostname=a",
    }) as never,
  )
  expect(ownNode.status).toBe(200)
})

test("multi-node FS_NODES without per-node credentials fails closed", async () => {
  mockedEnv.FS_NODES = JSON.stringify({
    a: { sipDomain: "a.example.com", wssUrl: "wss://a", turnUrl: "turn:a" },
    b: { sipDomain: "b.example.com", wssUrl: "wss://b", turnUrl: "turn:b" },
  })
  const res = await POST(
    makeRequest({ body: "section=dialplan&hostname=a" }) as never,
  )
  expect(res.status).toBe(401)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("HTTPS-only guard rejects plain HTTP in production", async () => {
  vi.stubEnv("NODE_ENV", "production")
  const req = makeRequest({ proto: "http" })
  const res = await POST(req as never)
  expect(res.status).toBe(403)
  vi.unstubAllEnvs()
})

test("with trusted proxy CIDRs configured, a CIDR entry in FS_XML_ALLOWED_IPS matching the real client is accepted", async () => {
  mockedEnv.FS_XML_TRUSTED_PROXY_CIDRS = ["10.0.0.0/8"]
  mockedEnv.FS_XML_ALLOWED_IPS = ["203.0.113.0/24"]
  renderFreeswitchXml.mockResolvedValue("<document>ok</document>")
  const req = makeRequest({ xff: "198.51.100.1, 10.1.2.3, 203.0.113.55" })
  const res = await POST(req as never)
  expect(res.status).toBe(200)
})

test("with trusted proxy CIDRs configured, a real client outside every allowlisted CIDR is rejected", async () => {
  mockedEnv.FS_XML_TRUSTED_PROXY_CIDRS = ["10.0.0.0/8"]
  mockedEnv.FS_XML_ALLOWED_IPS = ["31.13.0.0/16"]
  const req = makeRequest({ xff: "198.51.100.1, 10.1.2.3, 203.0.113.55" })
  const res = await POST(req as never)
  expect(res.status).toBe(403)
  expect(renderFreeswitchXml).not.toHaveBeenCalled()
})

test("never logs the request body or the rendered XML", async () => {
  renderFreeswitchXml.mockResolvedValue(
    '<gateway><param name="password" value="super-secret"/></gateway>',
  )
  const req = makeRequest({
    body: "section=configuration&key_value=sofia.conf&password=super-secret",
  })
  await POST(req as never)

  const allLoggedText = JSON.stringify([
    ...loggerError.mock.calls,
    ...loggerWarn.mock.calls,
  ])
  expect(allLoggedText).not.toContain("super-secret")
})

describe("isIpAllowlisted", () => {
  test("matches a bare IP entry exactly", () => {
    expect(isIpAllowlisted("203.0.113.9", ["203.0.113.9"])).toBe(true)
    expect(isIpAllowlisted("203.0.113.10", ["203.0.113.9"])).toBe(false)
  })

  test("matches an IP inside a CIDR entry", () => {
    expect(isIpAllowlisted("31.13.24.1", ["31.13.0.0/16"])).toBe(true)
  })

  test("rejects an IP outside every CIDR entry", () => {
    expect(isIpAllowlisted("8.8.8.8", ["31.13.0.0/16", "10.0.0.0/8"])).toBe(
      false,
    )
  })
})
