// @vitest-environment node
import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findForWidget = vi.fn()
const buildLinks = vi.fn()
const checkGuestRateLimit = vi.fn()
const getGuestClientIp = vi.fn()

const TENANT = {
  name: "AcmeChat",
  appUrl: "https://chat.acme.test",
  faviconUrl: "https://cdn.acme.test/icon.png",
}

vi.mock("@chatbotx.io/business", () => ({
  reflinkService: { findForWidget },
}))

vi.mock("@/features/reflinks/lib/reflink-links", () => ({
  createReflinkLinkBuilder: vi.fn(async () => ({
    tenant: TENANT,
    buildLinks,
  })),
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit,
  getGuestClientIp,
  UNKNOWN_CLIENT_IP: "unknown",
}))

vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))

const { GET } = await import("../src/app/api/reflink-widget/[reflinkId]/route")

const REFLINK = {
  id: "10",
  name: "summer",
  workspaceId: "ws-1",
  widgetAuthorizedDomains: [] as string[],
  widgetHiddenInboxIds: [] as string[],
}

const LINKS = [
  {
    inboxId: "1",
    inboxName: "Page",
    channel: "messenger",
    url: "https://m.me/1?ref=summer",
    receivesRef: true,
  },
  {
    inboxId: "2",
    inboxName: "Phone",
    channel: "whatsapp",
    url: "https://wa.me/84?text=%2Fref-summer",
    receivesRef: true,
  },
]

const request = (origin?: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/reflink-widget/10", {
    headers: origin ? { ...headers, origin } : headers,
  }) as unknown as NextRequest

const callGet = (
  origin?: string,
  reflinkId = "10",
  headers: Record<string, string> = {},
) => GET(request(origin, headers), { params: Promise.resolve({ reflinkId }) })

beforeEach(() => {
  vi.clearAllMocks()
  checkGuestRateLimit.mockResolvedValue({ limited: false, retryAfter: 0 })
  findForWidget.mockResolvedValue(REFLINK)
  buildLinks.mockReturnValue(LINKS)
  getGuestClientIp.mockReturnValue("203.0.113.9")
})

describe("GET /api/reflink-widget/[reflinkId]", () => {
  test("allows any origin when no domain is authorized and brands by tenant", async () => {
    const res = await callGet("https://shop.example.com")

    expect(res.status).toBe(200)
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://shop.example.com",
    )
    expect(await res.json()).toEqual({
      channels: [
        {
          channel: "messenger",
          name: "Page",
          url: "https://m.me/1?ref=summer",
        },
        {
          channel: "whatsapp",
          name: "Phone",
          url: "https://wa.me/84?text=%2Fref-summer",
        },
      ],
      brand: {
        name: "AcmeChat",
        url: "https://chat.acme.test",
        logoUrl: "https://cdn.acme.test/icon.png",
        poweredByLabel: "by",
      },
    })
  })

  test("allows an authorized domain and its subdomains", async () => {
    findForWidget.mockResolvedValue({
      ...REFLINK,
      widgetAuthorizedDomains: ["example.com"],
    })

    expect((await callGet("https://example.com")).status).toBe(200)
    expect((await callGet("https://shop.example.com")).status).toBe(200)
  })

  test("rejects an origin outside the authorized domains", async () => {
    findForWidget.mockResolvedValue({
      ...REFLINK,
      widgetAuthorizedDomains: ["example.com"],
    })

    const res = await callGet("https://evil.test")

    expect(res.status).toBe(403)
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
    expect(buildLinks).not.toHaveBeenCalled()
  })

  test("leaves hidden inboxes out", async () => {
    findForWidget.mockResolvedValue({ ...REFLINK, widgetHiddenInboxIds: ["1"] })

    const body = await (await callGet("https://example.com")).json()

    expect(body.channels).toEqual([
      expect.objectContaining({ channel: "whatsapp" }),
    ])
  })

  test("returns 404 for a missing ref link or a non-numeric id", async () => {
    findForWidget.mockResolvedValue(null)
    expect((await callGet("https://example.com")).status).toBe(404)

    expect((await callGet("https://example.com", "abc")).status).toBe(404)
  })

  test("returns 429 when rate limited", async () => {
    checkGuestRateLimit.mockResolvedValue({ limited: true, retryAfter: 4 })

    const res = await callGet("https://example.com")

    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBe("4")
    expect(findForWidget).not.toHaveBeenCalled()
  })

  test("skips the rate limit when the visitor IP is unknown", async () => {
    getGuestClientIp.mockReturnValue("unknown")

    const res = await callGet("https://example.com")

    expect(res.status).toBe(200)
    expect(checkGuestRateLimit).not.toHaveBeenCalled()
  })

  test("translates the powered-by label to the visitor's language", async () => {
    const res = await callGet("https://example.com", "10", {
      "accept-language": "vi-VN,vi;q=0.9,en;q=0.8",
    })

    expect((await res.json()).brand.poweredByLabel).toBe("bởi")
  })
})
