import { describe, expect, test, vi } from "vitest"
import {
  fetchAllCursorPages,
  fetchAllNextPages,
  GraphPaginationMaxPagesReachedError,
} from "../src/graph-pagination"

const GRAPH_URL = "https://graph.facebook.com/v23.0/waba/phone_numbers"

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

describe("fetchAllNextPages", () => {
  test("follows paging.next until Graph stops offering one", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "first" }],
        paging: { next: `${GRAPH_URL}?after=b` },
      })
      .mockResolvedValueOnce({ data: [{ id: "second" }], paging: {} })

    const result = await fetchAllNextPages({ firstUrl: GRAPH_URL, get })

    expect(result).toEqual([{ id: "first" }, { id: "second" }])
    expect(get).toHaveBeenNthCalledWith(1, GRAPH_URL)
    expect(get).toHaveBeenNthCalledWith(2, `${GRAPH_URL}?after=b`)
  })

  test("returns the page when Graph omits paging entirely", async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: "only" }] })

    const result = await fetchAllNextPages({ firstUrl: GRAPH_URL, get })

    expect(result).toEqual([{ id: "only" }])
    expect(get).toHaveBeenCalledTimes(1)
  })

  test("never forwards the request to another origin", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ id: "first" }],
      paging: { next: "https://attacker.example/steal?token=1" },
    })

    const result = await fetchAllNextPages({ firstUrl: GRAPH_URL, get })

    expect(result).toEqual([{ id: "first" }])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(GRAPH_URL)
  })

  test("ignores a paging.next that is not a usable URL", async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ id: "first" }],
      paging: { next: "not-a-url" },
    })

    const result = await fetchAllNextPages({ firstUrl: GRAPH_URL, get })

    expect(result).toEqual([{ id: "first" }])
    expect(get).toHaveBeenCalledTimes(1)
  })

  test("breaks a cycle that revisits an earlier page", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "first" }],
        paging: { next: `${GRAPH_URL}?after=b` },
      })
      .mockResolvedValueOnce({
        data: [{ id: "second" }],
        paging: { next: GRAPH_URL },
      })

    const result = await fetchAllNextPages({ firstUrl: GRAPH_URL, get })

    expect(result).toEqual([{ id: "first" }, { id: "second" }])
    expect(get).toHaveBeenCalledTimes(2)
  })

  test("throws once maxPages is reached so callers cannot use a partial list", async () => {
    const get = vi.fn().mockImplementation(async (url: string) => ({
      data: [{ id: url }],
      paging: { next: `${GRAPH_URL}?after=${get.mock.calls.length}` },
    }))
    const onMaxPagesReached = vi.fn()

    await expect(
      fetchAllNextPages({
        firstUrl: GRAPH_URL,
        get,
        maxPages: 3,
        onMaxPagesReached,
      }),
    ).rejects.toThrow(GraphPaginationMaxPagesReachedError)
    expect(get).toHaveBeenCalledTimes(3)
    expect(onMaxPagesReached).toHaveBeenCalledWith(3)
  })

  test("stays quiet when the walk ends before maxPages", async () => {
    const get = vi.fn().mockResolvedValue({ data: [{ id: "only" }] })
    const onMaxPagesReached = vi.fn()

    await fetchAllNextPages({
      firstUrl: GRAPH_URL,
      get,
      maxPages: 3,
      onMaxPagesReached,
    })

    expect(onMaxPagesReached).not.toHaveBeenCalled()
  })
})
