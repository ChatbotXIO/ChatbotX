import { describe, expect, test } from "vitest"
import {
  listContactInboxesAudiencePreviewRequest,
  listContactsRequest,
} from "@/features/contacts/schema/query"

const base = {
  page: 1,
  perPage: 20,
  workspaceId: "1",
}

describe("listContactInboxesAudiencePreviewRequest", () => {
  test("parses audienceRangeStart and audienceRangeEnd", () => {
    const result = listContactInboxesAudiencePreviewRequest.safeParse({
      ...base,
      audienceRangeStart: 1,
      audienceRangeEnd: 100,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.audienceRangeStart).toBe(1)
      expect(result.data.audienceRangeEnd).toBe(100)
    }
  })

  test("allows the range fields to be omitted", () => {
    const result = listContactInboxesAudiencePreviewRequest.safeParse(base)
    expect(result.success).toBe(true)
  })
})

describe("listContactsRequest (the count route input)", () => {
  test("does not carry the audience range fields", () => {
    const result = listContactsRequest.parse({
      ...base,
      audienceRangeStart: 1,
      audienceRangeEnd: 100,
    })
    expect("audienceRangeStart" in result).toBe(false)
    expect("audienceRangeEnd" in result).toBe(false)
  })
})
