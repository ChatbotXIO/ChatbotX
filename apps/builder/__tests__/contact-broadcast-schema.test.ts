import { describe, expect, test } from "vitest"
import {
  CONTACT_BROADCAST_SEARCH_MAX_LENGTH,
  listContactBroadcastsRequest,
} from "@/features/contacts/schema/contact-broadcast"

describe("listContactBroadcastsRequest", () => {
  test("defaults the page size and leaves search out", () => {
    expect(listContactBroadcastsRequest.parse({})).toEqual({ perPage: 20 })
  })

  test("trims the search text", () => {
    expect(
      listContactBroadcastsRequest.parse({ search: "  sale " }).search,
    ).toBe("sale")
  })

  test.each([
    ["an empty search", ""],
    ["a blank search", "   "],
    [
      "a search with a NUL character, which Postgres text cannot hold",
      "sa\u0000le",
    ],
    [
      "a search longer than the limit",
      "x".repeat(CONTACT_BROADCAST_SEARCH_MAX_LENGTH + 1),
    ],
  ])("rejects %s", (_label, search) => {
    expect(listContactBroadcastsRequest.safeParse({ search }).success).toBe(
      false,
    )
  })

  test.each([[0], [101], [1.5]])("rejects the page size %s", (perPage) => {
    expect(listContactBroadcastsRequest.safeParse({ perPage }).success).toBe(
      false,
    )
  })
})
