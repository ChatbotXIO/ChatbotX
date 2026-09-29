// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  linkContactsPublicRequest,
  linkStatsPublicRequest,
} from "@/features/analytics/schema/public"

// `analytics.magicLinkStats`/`refLinkStats`/`magicLinkContacts`/`refLinkContacts`
// originally took `startDate`/`endDate`; a later revision renamed them to
// `from`/`to` for consistency with every other analytics time-range operation
// (`timeRangeQuerySchema`). That rename is otherwise a breaking change for any
// existing caller — these schemas alias the old names so both keep working.

describe("linkStatsPublicRequest — startDate/endDate back-compat alias", () => {
  test("accepts the current from/to shape", () => {
    const result = linkStatsPublicRequest.parse({
      from: "2026-01-01",
      to: "2026-01-31",
      linkId: "link-1",
      timezone: "UTC",
    })

    expect(result).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      linkId: "link-1",
      timezone: "UTC",
    })
  })

  test("accepts the legacy startDate/endDate shape and normalizes to from/to", () => {
    const result = linkStatsPublicRequest.parse({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      linkId: "link-1",
      timezone: "UTC",
    })

    expect(result).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      linkId: "link-1",
      timezone: "UTC",
    })
  })

  test("prefers from/to when both spellings are sent", () => {
    const result = linkStatsPublicRequest.parse({
      from: "2026-02-01",
      to: "2026-02-28",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      linkId: "link-1",
      timezone: "UTC",
    })

    expect(result).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
      linkId: "link-1",
      timezone: "UTC",
    })
  })

  test("still requires a start and end of the range under either spelling", () => {
    expect(() =>
      linkStatsPublicRequest.parse({ linkId: "link-1", timezone: "UTC" }),
    ).toThrow()
  })
})

describe("linkContactsPublicRequest — startDate/endDate back-compat alias", () => {
  test("accepts the legacy startDate/endDate shape and normalizes to from/to", () => {
    const result = linkContactsPublicRequest.parse({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      linkId: "link-1",
      page: 1,
      perPage: 20,
    })

    expect(result).toEqual(
      expect.objectContaining({
        from: "2026-01-01",
        to: "2026-01-31",
        linkId: "link-1",
      }),
    )
  })

  test("from/to remain optional, matching the current shape", () => {
    const result = linkContactsPublicRequest.parse({
      linkId: "link-1",
      page: 1,
      perPage: 20,
    })

    expect(result.from).toBeUndefined()
    expect(result.to).toBeUndefined()
  })
})
