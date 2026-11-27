// @vitest-environment node

import { TEMPLATE_STORE_MAX_LISTINGS } from "@chatbotx.io/database/partials"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/platform/settings", () => ({ resolveWorkspaceAppUrl: vi.fn() }))

const {
  effectiveNowMicros,
  hasVisible,
  isSnapshotOverCap,
  projectPublished,
  toPublishedTemplate,
} = await import("../src/template/store-snapshot")

const APP_URL = "https://app.example.test"
const NOW = "1000000"

type Row = {
  listingId: string
  templateId: string
  name: string
  description: string | null
  imageUrl: string | null
  publisherName: string | null
  shareToken: string
  categoryIds: string[]
  languages: string[]
  channels: string[]
  shareExpiresAtMicros: string | null
  searchName: string
  searchPublisherName: string | null
}

const row = (id: string, overrides: Partial<Row> = {}): Row => ({
  listingId: `l${id}`,
  templateId: id,
  name: `Name ${id}`,
  description: null,
  imageUrl: null,
  publisherName: null,
  shareToken: `tok${id}`,
  categoryIds: [],
  languages: [],
  channels: [],
  shareExpiresAtMicros: null,
  searchName: `name ${id}`,
  searchPublisherName: null,
  ...overrides,
})

const snapshotOf = (
  rows: Row[],
  categories: { id: string; name: string }[] = [],
  loadedAtMicros = NOW,
) =>
  ({
    tenantId: "1",
    version: "1",
    loadedAtMicros,
    rows,
    categories,
  }) as Parameters<typeof projectPublished>[0]

const ids = (snapshot: Parameters<typeof projectPublished>[0], filters = {}) =>
  projectPublished(snapshot, filters, NOW, APP_URL).templates.map(
    (template) => template.templateId,
  )

describe("effectiveNowMicros", () => {
  test("is the later of the request clock and the snapshot's load time", () => {
    expect(effectiveNowMicros({ loadedAtMicros: "5" }, "9")).toBe(9n)
    expect(effectiveNowMicros({ loadedAtMicros: "9" }, "5")).toBe(9n)
    expect(effectiveNowMicros({ loadedAtMicros: "7" }, "7")).toBe(7n)
  })

  test("compares exactly above 2^53 and at the int64 maximum", () => {
    const max = "9223372036854775807"
    expect(
      effectiveNowMicros(
        { loadedAtMicros: "9007199254740993" },
        "9007199254740992",
      ),
    ).toBe(9007199254740993n)
    expect(
      effectiveNowMicros({ loadedAtMicros: max }, "9223372036854775806"),
    ).toBe(9223372036854775807n)
  })
})

describe("share expiry", () => {
  test("no expiry and an expiry at or after now are visible; one microsecond before is not", () => {
    const snapshot = snapshotOf([
      row("never"),
      row("exact", { shareExpiresAtMicros: NOW }),
      row("later", { shareExpiresAtMicros: "1000001" }),
      row("earlier", { shareExpiresAtMicros: "999999" }),
    ])
    expect(ids(snapshot)).toEqual(["never", "exact", "later"])
    expect(hasVisible(snapshot, NOW)).toBe(true)
  })

  test("a snapshot loaded after the request's clock is evaluated at its own load time", () => {
    const snapshot = snapshotOf(
      [row("a", { shareExpiresAtMicros: "1000500" })],
      [],
      "1001000",
    )
    expect(ids(snapshot)).toEqual([])
    expect(hasVisible(snapshot, NOW)).toBe(false)
  })

  test("hasVisible is false with no rows or only expired rows", () => {
    expect(hasVisible(snapshotOf([]), NOW)).toBe(false)
    expect(
      hasVisible(snapshotOf([row("a", { shareExpiresAtMicros: "1" })]), NOW),
    ).toBe(false)
  })

  test("handles expiries beyond 2^53 exactly", () => {
    const snapshot = snapshotOf([
      row("a", { shareExpiresAtMicros: "9007199254740993" }),
    ])
    expect(
      projectPublished(snapshot, {}, "9007199254740993", APP_URL).templates,
    ).toHaveLength(1)
    expect(
      projectPublished(snapshot, {}, "9007199254740994", APP_URL).templates,
    ).toHaveLength(0)
  })
})

describe("category rules", () => {
  const categories = [
    { id: "1", name: "A" },
    { id: "2", name: "B" },
    { id: "3", name: "C" },
  ]
  const snapshot = snapshotOf(
    [
      row("x", { categoryIds: ["1", "2"] }),
      row("y", { categoryIds: ["2"], shareExpiresAtMicros: "1" }),
      row("z", { categoryIds: ["99"] }),
    ],
    categories,
  )

  test("lists only categories with a visible row, in snapshot order, ignoring other filters", () => {
    const result = projectPublished(
      snapshot,
      { keywordLiteral: "no-match", language: "vi" },
      NOW,
      APP_URL,
    )
    expect(result.categories).toEqual([
      { id: "1", name: "A" },
      { id: "2", name: "B" },
    ])
  })

  test("a leading-zero id matches as a bigint", () => {
    expect(ids(snapshot, { categoryId: "0001" })).toEqual(["x"])
    expect(ids(snapshot, { categoryId: "2" })).toEqual(["x"])
  })

  test("a missing, non-bigint or beyond-int64 id matches nothing but categories stay", () => {
    for (const categoryId of [
      "7",
      "abc",
      "",
      "9223372036854775808",
      "99999999999999999999",
    ]) {
      const result = projectPublished(snapshot, { categoryId }, NOW, APP_URL)
      expect(result.templates, categoryId).toEqual([])
      expect(result.categories).toHaveLength(2)
    }
  })

  test("the int64 maximum is a valid id", () => {
    const max = "9223372036854775807"
    const big = snapshotOf(
      [row("m", { categoryIds: [max] })],
      [{ id: max, name: "Max" }],
    )
    expect(ids(big, { categoryId: max })).toEqual(["m"])
  })
})

describe("language, channel and keyword filters", () => {
  test("language keeps untagged rows and rows listing it", () => {
    const snapshot = snapshotOf([
      row("none"),
      row("vi", { languages: ["vi"] }),
      row("en", { languages: ["en", "xx-gone"] }),
    ])
    expect(ids(snapshot, { language: "vi" })).toEqual(["none", "vi"])
    expect(ids(snapshot, { language: "en" })).toEqual(["none", "en"])
  })

  test("channel keeps rows naming no known channel and rows listing it", () => {
    const snapshot = snapshotOf([
      row("none"),
      row("zalo", { channels: ["zalo"] }),
      row("bogus", { channels: ["bogus"] }),
      row("mixed", { channels: ["whatsapp", "bogus"] }),
    ])
    expect(ids(snapshot, { channel: "zalo" })).toEqual([
      "none",
      "zalo",
      "bogus",
    ])
    expect(ids(snapshot, { channel: "whatsapp" })).toEqual([
      "none",
      "bogus",
      "mixed",
    ])
  })

  test("keyword matches the lowered name or publisher as a substring", () => {
    const snapshot = snapshotOf([
      row("a", { searchName: "shop bot" }),
      row("b", { searchName: "x", searchPublisherName: "acme shop" }),
      row("c", { searchName: "x", searchPublisherName: null }),
    ])
    expect(ids(snapshot, { keywordLiteral: "shop" })).toEqual(["a", "b"])
    expect(ids(snapshot, { keywordLiteral: "nothing" })).toEqual([])
    expect(ids(snapshot, { keywordLiteral: null })).toEqual(["a", "b", "c"])
    expect(ids(snapshot, { keywordLiteral: "" })).toEqual(["a", "b", "c"])
  })

  test("filters combine with AND", () => {
    const snapshot = snapshotOf([
      row("a", { languages: ["vi"], searchName: "shop" }),
      row("b", { languages: ["en"], searchName: "shop" }),
      row("c", { languages: ["vi"], searchName: "other" }),
    ])
    expect(ids(snapshot, { language: "vi", keywordLiteral: "shop" })).toEqual([
      "a",
    ])
  })
})

describe("order and cap", () => {
  test("keeps the snapshot order and cuts to the cap after filtering", () => {
    const rows = Array.from(
      { length: TEMPLATE_STORE_MAX_LISTINGS + 1 },
      (_, i) => row(String(i + 1), { searchName: i === 0 ? "first" : "rest" }),
    )
    const snapshot = snapshotOf(rows)
    expect(isSnapshotOverCap(snapshot)).toBe(true)
    const all = ids(snapshot)
    expect(all).toHaveLength(TEMPLATE_STORE_MAX_LISTINGS)
    expect(all[0]).toBe("1")
    expect(ids(snapshot, { keywordLiteral: "rest" })[0]).toBe("2")
    expect(isSnapshotOverCap(snapshotOf(rows.slice(1)))).toBe(false)
  })
})

describe("output", () => {
  test("uses known languages and channels, the viewer's section and the share link", () => {
    const source = row("9", {
      languages: ["vi", "xx-gone"],
      channels: ["zalo", "bogus"],
      categoryIds: ["1"],
    })
    const mapped = toPublishedTemplate(source, "en", APP_URL)
    expect(mapped).toMatchObject({
      languages: ["vi"],
      channels: ["zalo"],
      section: "hidden",
      shareUrl: `${APP_URL}/t/template?id=9&key=tok9`,
    })
    expect(toPublishedTemplate(source, undefined, APP_URL).section).toBe(
      "primary",
    )
  })

  test("never shares arrays with the cached snapshot", () => {
    const source = row("1", { categoryIds: ["1"] })
    const snapshot = snapshotOf([source], [{ id: "1", name: "A" }])
    const result = projectPublished(snapshot, {}, NOW, APP_URL)
    expect(result.templates[0].categoryIds).not.toBe(source.categoryIds)
    expect(result.categories[0]).not.toBe(snapshot.categories[0])
    result.templates[0].categoryIds.push("2")
    result.categories[0].name = "changed"
    expect(source.categoryIds).toEqual(["1"])
    expect(snapshot.categories[0].name).toBe("A")
  })
})
