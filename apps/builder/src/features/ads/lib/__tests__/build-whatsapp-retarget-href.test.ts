import { describe, expect, test } from "vitest"
import { buildWhatsappRetargetHref } from "../build-whatsapp-retarget-href"

describe("buildWhatsappRetargetHref", () => {
  test("builds a deep-link with channel, integration, and a single ctwaRetarget condition per segment", () => {
    const href = buildWhatsappRetargetHref({
      workspaceId: "81399851597824",
      segment: "purchases",
      adId: "238512000000102",
      range: { from: "2026-07-13", to: "2026-08-12" },
      integrationWhatsappId: "999",
    })

    const url = new URL(href, "https://example.test")
    expect(url.pathname).toBe("/space/81399851597824/broadcasts/create")
    expect(url.searchParams.get("channel")).toBe("whatsapp")
    expect(url.searchParams.get("integrationWhatsappId")).toBe("999")

    const contactFilter = JSON.parse(
      url.searchParams.get("contactFilter") ?? "null",
    )
    expect(contactFilter).toEqual({
      operator: "and",
      conditions: [
        {
          field: "ctwaRetarget",
          segment: "purchases",
          adId: "238512000000102",
          // Carried inside the condition (scopes the segment to this
          // integration for parity with the Facebook path), not only in the URL.
          integrationWhatsappId: "999",
          since: "2026-07-13",
          until: "2026-08-12",
        },
      ],
    })
  })

  test("omits adId when unattributed and integrationWhatsappId when not selected", () => {
    const href = buildWhatsappRetargetHref({
      workspaceId: "81399851597824",
      segment: "conversations",
      adId: null,
      range: { from: "2026-07-13", to: "2026-08-12" },
      integrationWhatsappId: null,
    })

    const url = new URL(href, "https://example.test")
    expect(url.searchParams.has("integrationWhatsappId")).toBe(false)

    const contactFilter = JSON.parse(
      url.searchParams.get("contactFilter") ?? "null",
    )
    expect(contactFilter.conditions[0]).toEqual({
      field: "ctwaRetarget",
      segment: "conversations",
      since: "2026-07-13",
      until: "2026-08-12",
    })
    expect(contactFilter.conditions[0]).not.toHaveProperty("adId")
  })

  test.each([
    "conversations",
    "leads",
    "purchases",
  ] as const)("encodes the %s segment", (segment) => {
    const href = buildWhatsappRetargetHref({
      workspaceId: "ws-1",
      segment,
      range: { from: "2026-01-01", to: "2026-01-31" },
    })
    const url = new URL(href, "https://example.test")
    const contactFilter = JSON.parse(
      url.searchParams.get("contactFilter") ?? "null",
    )
    expect(contactFilter.conditions[0].segment).toBe(segment)
  })
})
