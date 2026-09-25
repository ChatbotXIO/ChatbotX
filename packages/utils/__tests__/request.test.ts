import { afterEach, describe, expect, test } from "vitest"
import {
  getPublicHostFromRequest,
  getPublicProtocolFromRequest,
  getPublicUrlFromRequest,
  getRawPublicHostFromRequest,
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

describe("getRawPublicHostFromRequest", () => {
  test("prefers the Forwarded header's host over everything else", () => {
    const request = new Request("http://internal.test", {
      headers: {
        forwarded: "for=192.0.2.1;host=forwarded.example.com;proto=https",
        "x-forwarded-host": "xfh.example.com",
        host: "plain.example.com",
      },
    })

    expect(getRawPublicHostFromRequest(request)).toBe("forwarded.example.com")
  })

  test("falls back to X-Forwarded-Host, taking only the first of a comma-separated list", () => {
    const request = new Request("http://internal.test", {
      headers: {
        "x-forwarded-host": "first.example.com, second.example.com",
        host: "plain.example.com",
      },
    })

    expect(getRawPublicHostFromRequest(request)).toBe("first.example.com")
  })

  test("falls back to the plain Host header when nothing is forwarded", () => {
    const request = new Request("http://internal.test", {
      headers: { host: "plain.example.com:8443" },
    })

    expect(getRawPublicHostFromRequest(request)).toBe("plain.example.com:8443")
  })

  test("returns null when no host can be resolved at all — no invented default", () => {
    const request = new Request("http://internal.test")

    expect(getRawPublicHostFromRequest(request)).toBeNull()
  })

  test("lowercases and trims whatever it resolves", () => {
    const request = new Request("http://internal.test", {
      headers: { host: "  Plain.Example.COM  " },
    })

    expect(getRawPublicHostFromRequest(request)).toBe("plain.example.com")
  })
})

describe("getPublicHostFromRequest", () => {
  test("keeps its existing localhost:3123 default when nothing resolves", () => {
    const request = new Request("http://internal.test")

    expect(getPublicHostFromRequest(request)).toBe("localhost:3123")
  })

  test("still resolves a real host the same way it always did", () => {
    const request = new Request("http://internal.test", {
      headers: { host: "plain.example.com" },
    })

    expect(getPublicHostFromRequest(request)).toBe("plain.example.com")
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

  test("keeps the port when the public host carries one", () => {
    delete process.env.FORCE_PUBLIC_HTTPS

    expect(
      getPublicUrlFromRequest(
        new Request("http://internal.test:3000/callback", {
          headers: { "x-forwarded-host": "localhost:3123" },
        }),
      ).toString(),
    ).toBe("http://localhost:3123/callback")
  })

  test("drops the internal port when the public host carries none", () => {
    delete process.env.FORCE_PUBLIC_HTTPS

    expect(
      getPublicUrlFromRequest(
        new Request("http://internal.test:3000/callback", {
          headers: { "x-forwarded-host": "app.example.com" },
        }),
      ).toString(),
    ).toBe("http://app.example.com/callback")
  })

  test("does not mistake a bracketed IPv6 host for one carrying a port", () => {
    delete process.env.FORCE_PUBLIC_HTTPS

    expect(
      getPublicUrlFromRequest(
        new Request("http://internal.test:3000/callback", {
          headers: { "x-forwarded-host": "[::1]" },
        }),
      ).toString(),
    ).toBe("http://[::1]/callback")
  })

  test("keeps the port of a bracketed IPv6 host that carries one", () => {
    delete process.env.FORCE_PUBLIC_HTTPS

    expect(
      getPublicUrlFromRequest(
        new Request("http://internal.test:3000/callback", {
          headers: { "x-forwarded-host": "[::1]:3123" },
        }),
      ).toString(),
    ).toBe("http://[::1]:3123/callback")
  })
})
