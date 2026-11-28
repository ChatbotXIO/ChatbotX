import { describe, expect, test } from "vitest"
import { listTagsSearchParamsCache } from "@/features/tags/schema/query"

describe("tags page search params", () => {
  test("pages the table by default so the list is never loaded whole", async () => {
    const search = await listTagsSearchParamsCache.parse({})
    expect(search.page).toBe(1)
    expect(search.perPage).toBe(10)
  })

  test("reads page, perPage and the name search from the URL", async () => {
    const search = await listTagsSearchParamsCache.parse({
      page: "3",
      perPage: "20",
      name: "vip",
    })
    expect(search).toMatchObject({ page: 3, perPage: 20, name: "vip" })
  })
})
