// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  getGuestClientIp,
  resolveGuestRateLimitKey,
  UNKNOWN_CLIENT_IP,
} from "@/lib/rate-limit/guest-rate-limit"

const headers = (entries: Record<string, string> = {}) => new Headers(entries)

describe("resolveGuestRateLimitKey", () => {
  test("uses the client IP when a proxy header identifies the caller", () => {
    expect(
      resolveGuestRateLimitKey(
        headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" }),
        "contact-inbox:1",
      ),
    ).toBe("203.0.113.9")

    expect(
      resolveGuestRateLimitKey(
        headers({ "x-real-ip": "203.0.113.10" }),
        "contact-inbox:1",
      ),
    ).toBe("203.0.113.10")
  })

  // Without a header-setting proxy every caller resolves to the same
  // `UNKNOWN_CLIENT_IP`, which would collapse them into one shared bucket and
  // 429 an entire minigame at once.
  test("falls back to the caller-supplied identity when no header is present", () => {
    expect(getGuestClientIp(headers())).toBe(UNKNOWN_CLIENT_IP)

    expect(resolveGuestRateLimitKey(headers(), "contact-inbox:1")).toBe(
      "contact-inbox:1",
    )
  })

  test("keeps two identities in separate buckets", () => {
    expect(resolveGuestRateLimitKey(headers(), "contact-inbox:1")).not.toBe(
      resolveGuestRateLimitKey(headers(), "contact-inbox:2"),
    )
  })

  // An empty or whitespace-only header is no identification at all.
  test("treats a blank forwarding header as unidentified", () => {
    expect(
      resolveGuestRateLimitKey(
        headers({ "x-forwarded-for": "   " }),
        "contact-inbox:1",
      ),
    ).toBe("contact-inbox:1")
  })
})
