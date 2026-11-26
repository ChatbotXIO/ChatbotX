import { describe, expect, test, vi } from "vitest"

vi.mock("../src/logger", () => ({ logger: { warn: vi.fn() } }))
vi.mock("../src/media-library/service", () => ({
  mediaLibraryService: { createFile: vi.fn(), deleteFile: vi.fn() },
}))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findById: vi.fn(), findByPath: vi.fn() },
}))
vi.mock("../src/social-post/hash", () => ({
  requestHash: async (value: string) =>
    Buffer.from(value).toString("hex").padEnd(64, "0"),
}))

const { evaluateItemFilters, foldText } = await import(
  "../src/social-post-feed/item-filter"
)
const { partitionDestinations, providerCarries, resolveFeedShape } =
  await import("../src/social-post-feed/feed-shape")
const { ImageBudget, pictureCandidates, stableImagePath } = await import(
  "../src/social-post-feed/feed-media"
)

const NOW = new Date("2026-03-10T12:00:00Z")
const base = {
  categories: ["Du lịch", "Ẩm thực"],
  publishedAt: new Date("2026-03-10T10:00:00Z"),
  summary: "Món ăn ngon ở Đà Nẵng",
  title: "Khám phá Hội An",
}
const verdict = (
  filters: Parameters<typeof evaluateItemFilters>[0],
  item = base,
  hasImage = true,
) => evaluateItemFilters(filters, item, { hasImage, now: NOW })

describe("evaluateItemFilters", () => {
  test("no filters pass everything", () => {
    expect(verdict(null)).toEqual({ pass: true })
  })

  test("keywords ignore case and diacritics, on title, summary and categories", () => {
    expect(foldText("Đà Nẵng ÂM")).toBe("da nang am")
    expect(verdict({ includeAny: ["HOI AN"] })).toEqual({ pass: true })
    expect(verdict({ includeAny: ["da nang"] })).toEqual({ pass: true })
    expect(verdict({ includeAny: ["am thuc"] })).toEqual({ pass: true })
    expect(verdict({ includeAny: ["sapa"] })).toEqual({
      pass: false,
      reason: "missingKeyword",
    })
    expect(verdict({ excludeAny: ["hoi an"] })).toEqual({
      pass: false,
      reason: "excludedKeyword",
    })
  })

  test("categories match only the categories", () => {
    expect(verdict({ categoriesAny: ["du lich"] })).toEqual({ pass: true })
    expect(verdict({ categoriesAny: ["hoi an"] })).toEqual({
      pass: false,
      reason: "category",
    })
  })

  test("requireImage needs a named picture", () => {
    expect(verdict({ requireImage: true }, base, false)).toEqual({
      pass: false,
      reason: "noImage",
    })
  })

  test("maxAgeHours: old fails, undated fails, future counts as just published", () => {
    expect(verdict({ maxAgeHours: 1 })).toEqual({
      pass: false,
      reason: "tooOldForFilter",
    })
    expect(verdict({ maxAgeHours: 3 })).toEqual({ pass: true })
    expect(verdict({ maxAgeHours: 3 }, { ...base, publishedAt: null })).toEqual(
      {
        pass: false,
        reason: "undatedForFilter",
      },
    )
    expect(
      verdict(
        { maxAgeHours: 1 },
        { ...base, publishedAt: new Date("2026-03-11T00:00:00Z") },
      ),
    ).toEqual({ pass: true })
  })
})

describe("feed post shape and destinations", () => {
  test("the shape follows postAs and the no-picture fallback", () => {
    const ask = (
      postAs: "photo" | "link" | "text",
      hasImage: boolean,
      noImageFallback: "link" | "text" | "skip" = "link",
    ) => resolveFeedShape({ hasImage, noImageFallback, postAs })
    expect(ask("photo", true)).toBe("photo")
    expect(ask("photo", false)).toBe("link")
    expect(ask("photo", false, "text")).toBe("text")
    expect(ask("photo", false, "skip")).toBe("skip")
    expect(ask("link", true)).toBe("link")
    expect(ask("text", true)).toBe("text")
  })

  test("networks that cannot carry the shape are dropped (from the publishing rules)", () => {
    expect(providerCarries("facebook", "photo")).toBe(true)
    expect(providerCarries("instagram", "photo")).toBe(true)
    expect(providerCarries("instagram", "text")).toBe(false)
    expect(providerCarries("instagram", "link")).toBe(false)
    expect(providerCarries("threads", "text")).toBe(true)
    expect(providerCarries("tiktok", "photo")).toBe(false)
    expect(providerCarries("tiktok", "text")).toBe(false)
    const destinations = [
      { id: "1", provider: "facebook" as const },
      { id: "2", provider: "instagram" as const },
      { id: "3", provider: "tiktok" as const },
    ]
    const { dropped, kept } = partitionDestinations(destinations, "text")
    expect(kept.map((d) => d.id)).toEqual(["1"])
    expect(dropped.map((d) => d.id)).toEqual(["2", "3"])
  })
})

describe("feed pictures", () => {
  const item = {
    author: null,
    categories: [],
    content: null,
    feedLink: null,
    feedTitle: null,
    fields: { "g:image_link": "https://cdn.test/p.jpg" },
    image: "https://cdn.test/a.jpg",
    images: [{ source: "enclosure" as const, url: "https://cdn.test/a.jpg" }],
    link: "https://shop.test/p1",
    publishedAt: null,
    summary: null,
    title: "P",
  }

  test("none: no pictures; auto: the feed's candidates; field: the template's address", () => {
    expect(
      pictureCandidates({ mediaField: null, mediaMode: "none" }, item, "UTC"),
    ).toEqual([])
    expect(
      pictureCandidates({ mediaField: null, mediaMode: "auto" }, item, "UTC"),
    ).toEqual(item.images)
    expect(
      pictureCandidates(
        { mediaField: '{{ raw["g:image_link"] }}', mediaMode: "field" },
        item,
        "UTC",
      ),
    ).toEqual([{ source: "field", url: "https://cdn.test/p.jpg" }])
    expect(
      pictureCandidates(
        { mediaField: "javascript:{{ title }}", mediaMode: "field" },
        item,
        "UTC",
      ),
    ).toEqual([])
    expect(
      pictureCandidates(
        { mediaField: "{{ broken", mediaMode: "field" },
        item,
        "UTC",
      ),
    ).toEqual([])
  })

  test("the storage path of an item is stable per feed and item", async () => {
    const one = await stableImagePath({
      feedId: "f1",
      itemKey: "k",
      workspaceId: "w1",
    })
    expect(one).toBe(
      await stableImagePath({ feedId: "f1", itemKey: "k", workspaceId: "w1" }),
    )
    expect(one).not.toBe(
      await stableImagePath({ feedId: "f1", itemKey: "k2", workspaceId: "w1" }),
    )
    expect(one.startsWith("public/space/w1/media-library/feed-f1-")).toBe(true)
  })

  test("the image budget caps attempts per run and per host", () => {
    const budget = new ImageBudget(10)
    expect([1, 2, 3, 4].map(() => budget.take("https://a.test/x.jpg"))).toEqual(
      [true, true, true, false],
    )
    expect(budget.take("https://b.test/x.jpg")).toBe(true)
    expect(budget.take("not a url")).toBe(false)
    const small = new ImageBudget(1)
    expect(small.take("https://a.test/1")).toBe(true)
    expect(small.take("https://c.test/1")).toBe(false)
  })
})
