import { afterEach, describe, expect, test } from "vitest"
import {
  getPublicProtocolFromRequest,
  getPublicUrlFromRequest,
} from "../src/request"

const originalForcePublicHttps = process.env.FORCE_PUBLIC_HTTPS

afterEach(() => {
  if (originalForcePublicHttps === undefined) {
    delete process.env.FORCE_PUBLIC_HTTPS
  } else {
    process.env.FORCE_PUBLIC_HTTPS = originalForcePublicHttps
  }
})

describe("getPublicProtocolFromRequest", () => {
  test("forces HTTPS before inspecting forwarded protocol headers", () => {
    process.env.FORCE_PUBLIC_HTTPS = "true"
    const request = new Request("http://internal.test/path", {
      headers: {
        forwarded: "for=192.0.2.1;proto=http",
        "x-forwarded-proto": "http",
      },
    })

    expect(getPublicProtocolFromRequest(request)).toBe("https")
  })

  test("uses the first valid Forwarded protocol when forcing is disabled", () => {
    process.env.FORCE_PUBLIC_HTTPS = "false"
    const request = new Request("https://internal.test/path", {
      headers: {
        forwarded: "for=192.0.2.1;proto=http, for=192.0.2.2;proto=https",
        "x-forwarded-proto": "https",
      },
    })

    expect(getPublicProtocolFromRequest(request)).toBe("http")
  })

  test("falls back to X-Forwarded-Proto and then the request URL", () => {
    delete process.env.FORCE_PUBLIC_HTTPS

    expect(
      getPublicProtocolFromRequest(
        new Request("http://internal.test", {
          headers: { "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe("https")
    expect(
      getPublicProtocolFromRequest(new Request("http://internal.test")),
    ).toBe("http")
  })
})

describe("getPublicUrlFromRequest", () => {
  test("applies forced HTTPS to the returned public URL", () => {
    process.env.FORCE_PUBLIC_HTTPS = "true"

    expect(
      getPublicUrlFromRequest(new Request("http://internal.test/callback"))
        .protocol,
    ).toBe("https:")
  })
})
