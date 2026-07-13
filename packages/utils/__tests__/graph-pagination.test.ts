import { describe, expect, test, vi } from "vitest"
import { fetchAllCursorPages } from "../src/graph-pagination"

describe("fetchAllCursorPages", () => {
  test("follows cursor pages and sends the configured limit", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "first" }],
        paging: {
          cursors: { after: "next-cursor" },
          next: "https://graph.example/page?after=next-cursor",
        },
      })
      .mockResolvedValueOnce({ data: [{ id: "second" }] })

    const result = await fetchAllCursorPages({
      endpoint: "v23.0/me/accounts",
      fields: "id,name",
      accessToken: "token",
      get,
      limit: 50,
    })

    expect(result).toEqual([{ id: "first" }, { id: "second" }])
    expect(get).toHaveBeenNthCalledWith(1, "v23.0/me/accounts", {
      searchParams: {
        fields: "id,name",
        access_token: "token",
        limit: "50",
      },
    })
    expect(get).toHaveBeenNthCalledWith(2, "v23.0/me/accounts", {
      searchParams: {
        fields: "id,name",
        access_token: "token",
        limit: "50",
        after: "next-cursor",
      },
    })
  })

  test("stops at maxPages even when Graph keeps returning cursors", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ id: "page" }],
      paging: {
        cursors: { after: "cursor" },
        next: "https://graph.example/page?after=cursor",
      },
    })

    const result = await fetchAllCursorPages({
      endpoint: "v23.0/me/accounts",
      fields: "id",
      accessToken: "token",
      get,
      maxPages: 2,
    })

    expect(result).toEqual([{ id: "page" }, { id: "page" }])
    expect(get).toHaveBeenCalledTimes(2)
  })
})
