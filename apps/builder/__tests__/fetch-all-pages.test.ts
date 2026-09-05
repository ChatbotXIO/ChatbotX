// @vitest-environment node

import { describe, expect, test, vi } from "vitest"
import { fetchAllPages } from "@/lib/query/fetch-all-pages"

describe("fetchAllPages", () => {
  test("loops cursor-based pages and stops when nextPageParam is undefined", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        items: ["a", "b"],
        nextPageParam: "cursor-2",
      })
      .mockResolvedValueOnce({
        items: ["c"],
        nextPageParam: undefined,
      })

    const result = await fetchAllPages<string | undefined, string>({
      initialPageParam: undefined,
      maxPages: 10,
      fetchPage,
    })

    expect(result).toEqual(["a", "b", "c"])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined)
    expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-2")
  })

  test("loops page-number-based pages and stops at the last page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], nextPageParam: 2 })
      .mockResolvedValueOnce({ items: [3, 4], nextPageParam: undefined })

    const result = await fetchAllPages<number, number>({
      initialPageParam: 1,
      maxPages: 10,
      fetchPage,
    })

    expect(result).toEqual([1, 2, 3, 4])
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  test("never fetches more than maxPages, even if nextPageParam keeps returning", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      items: ["x"],
      nextPageParam: "always-more",
    })

    const result = await fetchAllPages<string, string>({
      initialPageParam: "start",
      maxPages: 3,
      fetchPage,
    })

    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(result).toEqual(["x", "x", "x"])
  })

  test("returns an empty array when the first page has no items and no next page", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue({ items: [], nextPageParam: undefined })

    const result = await fetchAllPages<number, unknown>({
      initialPageParam: 1,
      maxPages: 5,
      fetchPage,
    })

    expect(result).toEqual([])
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })
})
