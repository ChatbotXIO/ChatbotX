// @vitest-environment node
import { describe, expect, test } from "vitest"
import { isCrossSiteRequest } from "../src/lib/http/same-site-request"

const buildRequest = (headers: Record<string, string>) =>
  new Request("http://localhost/api/whatever", {
    method: "POST",
    headers,
  })

describe("isCrossSiteRequest", () => {
  test("Sec-Fetch-Site: same-origin is trusted directly", () => {
    expect(
      isCrossSiteRequest(buildRequest({ "sec-fetch-site": "same-origin" })),
    ).toBe(false)
  })

  test("Sec-Fetch-Site: cross-site is trusted directly, even with a matching Origin", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          "sec-fetch-site": "cross-site",
          origin: "http://localhost",
          host: "localhost",
        }),
      ),
    ).toBe(true)
  })

  test("Sec-Fetch-Site absent, Origin host matches Host header — accepted", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "localhost",
          origin: "http://localhost",
        }),
      ),
    ).toBe(false)
  })

  test("Sec-Fetch-Site absent, Origin host does not match Host header — rejected", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "localhost",
          origin: "https://evil.example.com",
        }),
      ),
    ).toBe(true)
  })

  test("Sec-Fetch-Site and Origin absent, Referer host matches Host header — accepted", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "localhost",
          referer: "http://localhost/space/1/inbox",
        }),
      ),
    ).toBe(false)
  })

  test("Sec-Fetch-Site and Origin absent, Referer host does not match Host header — rejected", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "localhost",
          referer: "https://evil.example.com/phish",
        }),
      ),
    ).toBe(true)
  })

  test("nothing verifiable (no Sec-Fetch-Site, Origin, or Referer) — fails closed", () => {
    expect(isCrossSiteRequest(buildRequest({ host: "localhost" }))).toBe(true)
  })

  test("no Host header at all — fails closed", () => {
    expect(isCrossSiteRequest(buildRequest({}))).toBe(true)
  })

  test("a malformed Origin header cannot be parsed as same-origin — rejected", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({ host: "localhost", origin: "not-a-url" }),
      ),
    ).toBe(true)
  })

  // Item 4: the same reverse-proxy-aware host resolution as every other
  // caller of `getPublicHostFromRequest`/`getRawPublicHostFromRequest`
  // (`@chatbotx.io/utils`), not a raw `Host` header comparison — a
  // white-label deployment behind a proxy sets `Host` to an internal
  // value, and only Forwarded/X-Forwarded-Host carry the real public host
  // the browser used.
  test("Forwarded header's host wins over a mismatched plain Host header", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "internal-service:3123",
          forwarded: "host=app.example.com;proto=https",
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(false)
  })

  test("X-Forwarded-Host is used, taking only the first of a comma-separated list", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "internal-service:3123",
          "x-forwarded-host": "app.example.com, other.example.com",
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(false)
  })

  test("port is part of the host comparison — same hostname, different port, is rejected", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "app.example.com:8443",
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(true)
  })

  test("port is part of the host comparison — matching hostname AND port is accepted", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "app.example.com:8443",
          origin: "https://app.example.com:8443",
        }),
      ),
    ).toBe(false)
  })

  test("mismatched Forwarded host is still rejected (not just a raw Host mismatch)", () => {
    expect(
      isCrossSiteRequest(
        buildRequest({
          host: "internal-service:3123",
          forwarded: "host=app.example.com;proto=https",
          origin: "https://evil.example.com",
        }),
      ),
    ).toBe(true)
  })
})
