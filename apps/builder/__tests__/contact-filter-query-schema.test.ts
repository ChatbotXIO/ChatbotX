// @vitest-environment node
import { describe, expect, test } from "vitest"
import { listContactsRequest } from "@/features/contacts/schemas/query"

describe("listContactsRequest contactFilter search param", () => {
  test("parses a JSON contactFilter query value", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      contactFilter: JSON.stringify({
        operator: "and",
        conditions: [
          {
            field: "inbox",
            operator: "eq",
            value: ["123"],
          },
        ],
      }),
    })

    expect(parsed.contactFilter).toEqual({
      operator: "and",
      conditions: [
        {
          field: "inbox",
          operator: "eq",
          value: ["123"],
        },
      ],
    })
  })

  test("falls back when contactFilter query value is invalid", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      contactFilter: "{invalid",
    })

    expect(parsed.contactFilter).toBeUndefined()
  })

  test("accepts valueless operators without a value", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      contactFilter: JSON.stringify({
        operator: "and",
        conditions: [
          {
            field: "fullName",
            operator: "isNotEmpty",
          },
        ],
      }),
    })

    expect(parsed.contactFilter?.conditions[0]).toEqual({
      field: "fullName",
      operator: "isNotEmpty",
    })
  })

  test("accepts locale and timezone select values", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      contactFilter: JSON.stringify({
        operator: "and",
        conditions: [
          {
            field: "locale",
            operator: "eq",
            value: ["vi_VN"],
          },
          {
            field: "timezone",
            operator: "eq",
            value: ["Asia/Ho_Chi_Minh"],
          },
        ],
      }),
    })

    expect(parsed.contactFilter?.conditions).toHaveLength(2)
  })

  test("rejects disabled operators for a field", () => {
    const parsed = listContactsRequest.parse({
      workspaceId: "1",
      contactFilter: JSON.stringify({
        operator: "and",
        conditions: [
          {
            field: "blocked",
            operator: "contains",
            value: "true",
          },
        ],
      }),
    })

    expect(parsed.contactFilter).toBeUndefined()
  })
})
