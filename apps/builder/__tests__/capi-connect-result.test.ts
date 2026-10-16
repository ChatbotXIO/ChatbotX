// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => "https://builder.example.test",
}))

const { buildCapiConnectRedirectUrl, readCapiConnectResult } = await import(
  "@/features/meta-conversions/lib/capi-connect-result"
)

describe("buildCapiConnectRedirectUrl", () => {
  test("marks success on an absolute referer", () => {
    expect(
      buildCapiConnectRedirectUrl(
        "https://app.example.test/space/1/messengers/2/ads",
        { status: "success" },
      ),
    ).toBe(
      "https://app.example.test/space/1/messengers/2/ads?capiConnect=success",
    )
  })

  test("carries the failure reason", () => {
    expect(
      buildCapiConnectRedirectUrl(
        "https://app.example.test/space/1/messengers/2/ads",
        { status: "error", reason: "pageNotFound" },
      ),
    ).toBe(
      "https://app.example.test/space/1/messengers/2/ads?capiConnect=error&capiReason=pageNotFound",
    )
  })

  test("keeps unrelated query params of the referer", () => {
    const url = new URL(
      buildCapiConnectRedirectUrl("https://app.example.test/ads?tab=capi", {
        status: "success",
      }),
    )

    expect(url.searchParams.get("tab")).toBe("capi")
    expect(url.searchParams.get("capiConnect")).toBe("success")
  })

  test("stays relative when the sanitized referer is relative", () => {
    expect(
      buildCapiConnectRedirectUrl("/space/1/messengers/2/ads", {
        status: "error",
        reason: "cancelled",
      }),
    ).toBe("/space/1/messengers/2/ads?capiConnect=error&capiReason=cancelled")
  })
})

describe("readCapiConnectResult", () => {
  test("returns null when the page was not reached from a CAPI connect", () => {
    expect(readCapiConnectResult(new URLSearchParams("tab=capi"))).toBeNull()
    expect(
      readCapiConnectResult(new URLSearchParams("capiConnect=maybe")),
    ).toBeNull()
  })

  test("reads success", () => {
    expect(
      readCapiConnectResult(new URLSearchParams("capiConnect=success")),
    ).toEqual({ status: "success" })
  })

  test("reads a known failure reason", () => {
    expect(
      readCapiConnectResult(
        new URLSearchParams("capiConnect=error&capiReason=datasetFailed"),
      ),
    ).toEqual({ status: "error", reason: "datasetFailed" })
  })

  test("reads the session-expired reason", () => {
    expect(
      readCapiConnectResult(
        new URLSearchParams("capiConnect=error&capiReason=sessionExpired"),
      ),
    ).toEqual({ status: "error", reason: "sessionExpired" })
  })

  test("falls back to a generic failure for an unknown or missing reason", () => {
    expect(
      readCapiConnectResult(
        new URLSearchParams("capiConnect=error&capiReason=<script>"),
      ),
    ).toEqual({ status: "error", reason: "failed" })
    expect(
      readCapiConnectResult(new URLSearchParams("capiConnect=error")),
    ).toEqual({ status: "error", reason: "failed" })
  })
})
