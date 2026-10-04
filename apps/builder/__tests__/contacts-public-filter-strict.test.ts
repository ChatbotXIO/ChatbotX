// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  countContactsPublicRequest,
  listContactsPublicRequest,
} from "@/features/contacts/schema/public/crud"

const validFilter = {
  operator: "and",
  conditions: [{ field: "inbox", operator: "eq", value: ["123"] }],
}

describe.each([
  ["list", listContactsPublicRequest],
  ["count", countContactsPublicRequest],
])("public contacts %s contactFilter", (_name, schema) => {
  test("parses a valid JSON contactFilter", () => {
    const parsed = schema.parse({ contactFilter: JSON.stringify(validFilter) })

    expect(parsed.contactFilter).toEqual(validFilter)
  })

  test("rejects malformed JSON instead of dropping the filter", () => {
    expect(schema.safeParse({ contactFilter: "{invalid" }).success).toBe(false)
  })

  test("rejects a JSON value that fails the filter schema", () => {
    const result = schema.safeParse({
      contactFilter: JSON.stringify({ operator: "and", conditions: [{}] }),
    })

    expect(result.success).toBe(false)
  })

  test("still accepts a request without a contactFilter", () => {
    expect(schema.safeParse({}).success).toBe(true)
  })

  test("accepts the audience-style keys", () => {
    const parsed = schema.parse({
      channels: ["whatsapp"],
      inboxIds: ["1"],
      subaction: "whatsappWithin24Hours",
    })

    expect(parsed.channels).toEqual(["whatsapp"])
    expect(parsed.inboxIds).toEqual(["1"])
  })
})
