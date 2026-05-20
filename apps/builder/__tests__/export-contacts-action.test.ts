// @vitest-environment node
import { describe, expect, test } from "vitest"
import { exportContactsRequest } from "@/features/contacts/schemas/action"

describe("exportContactsRequest schema", () => {
  const fields = ["sys:fullName", "sys:email"]

  test("accepts exportAll with no filter and no contactIds", () => {
    const result = exportContactsRequest.safeParse({ fields, exportAll: true })

    expect(result.success).toBe(true)
  })

  test("accepts exportAll together with a filter", () => {
    const result = exportContactsRequest.safeParse({
      fields,
      exportAll: true,
      filter: {
        keyword: "Acme",
        contactFilter: { operator: "and", conditions: [] },
      },
    })

    expect(result.success).toBe(true)
  })

  test("accepts a non-exportAll request with contactIds", () => {
    const result = exportContactsRequest.safeParse({
      fields,
      contactIds: ["1", "2"],
    })

    expect(result.success).toBe(true)
  })

  test("rejects a non-exportAll request with an empty contactIds array", () => {
    const result = exportContactsRequest.safeParse({ fields, contactIds: [] })

    expect(result.success).toBe(false)
  })

  test("rejects a non-exportAll request with no contactIds", () => {
    const result = exportContactsRequest.safeParse({ fields })

    expect(result.success).toBe(false)
  })

  test("rejects exportAll explicitly set to false with no contactIds", () => {
    const result = exportContactsRequest.safeParse({
      fields,
      exportAll: false,
    })

    expect(result.success).toBe(false)
  })

  test("rejects an empty fields array", () => {
    const result = exportContactsRequest.safeParse({
      fields: [],
      exportAll: true,
    })

    expect(result.success).toBe(false)
  })

  test("coerces numeric-string contactIds", () => {
    const parsed = exportContactsRequest.parse({
      fields,
      contactIds: ["1234567890"],
    })

    expect(parsed.contactIds).toEqual(["1234567890"])
  })

  test("rejects non-numeric contactIds", () => {
    const result = exportContactsRequest.safeParse({
      fields,
      contactIds: ["abc"],
    })

    expect(result.success).toBe(false)
  })
})
