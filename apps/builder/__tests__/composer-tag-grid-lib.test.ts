import { describe, expect, test } from "vitest"
import {
  COMPOSER_TAG_COLLAPSED_MAX_PX,
  chunkRemainderFirst,
  composerTagColumns,
  isTagShownApplied,
  nextTagPageParam,
  resolveComposerTagDisabledReason,
} from "@/features/messages/lib/composer-tag-grid"

describe("resolveComposerTagDisabledReason", () => {
  const base = { contactId: "c1", isBlocked: false, contactUnavailable: false }

  test("is null when the grid can change tags", () => {
    expect(resolveComposerTagDisabledReason(base)).toBeNull()
  })

  test.each([
    [{ contactId: null }, "noContact"],
    [{ isBlocked: true }, "blocked"],
    [{ contactUnavailable: true }, "noAccess"],
    [{ contactId: null, isBlocked: true }, "noContact"],
  ] as const)("%j -> %s", (patch, reason) => {
    expect(resolveComposerTagDisabledReason({ ...base, ...patch })).toBe(reason)
  })
})

describe("nextTagPageParam", () => {
  test("asks for the next page until pageCount is reached", () => {
    expect(nextTagPageParam({ pageCount: 3 }, [1])).toBe(2)
    expect(nextTagPageParam({ pageCount: 3 }, [1, 2])).toBe(3)
    expect(nextTagPageParam({ pageCount: 3 }, [1, 2, 3])).toBeUndefined()
  })
})

describe("isTagShownApplied", () => {
  test("an unsettled intent beats the last read", () => {
    expect(
      isTagShownApplied({
        applied: true,
        tagId: "t1",
        unsettled: new Map([["t1", "remove"]]),
      }),
    ).toBe(false)
    expect(
      isTagShownApplied({
        applied: false,
        tagId: "t2",
        unsettled: new Map([["t2", "add"]]),
      }),
    ).toBe(true)
    expect(
      isTagShownApplied({ applied: true, tagId: "t1", unsettled: new Map() }),
    ).toBe(true)
    expect(
      isTagShownApplied({ applied: false, tagId: "t1", unsettled: new Map() }),
    ).toBe(false)
  })
})

describe("composerTagColumns", () => {
  test.each([
    [0, 1],
    [87, 1],
    [88, 1],
    [264, 3],
    [879, 9],
    [880, 10],
    [4000, 10],
  ])("a %ipx container fits %i cells", (width, columns) => {
    expect(composerTagColumns(width)).toBe(columns)
  })
})

describe("chunkRemainderFirst", () => {
  const range = (count: number) => Array.from({ length: count }, (_, i) => i)

  test("puts the remainder row first, then full rows", () => {
    expect(chunkRemainderFirst(range(23), 10).map((row) => row.length)).toEqual(
      [3, 10, 10],
    )
    expect(chunkRemainderFirst(range(23), 10)[0]).toEqual([0, 1, 2])
  })

  test("has no short row when the count divides evenly", () => {
    expect(chunkRemainderFirst(range(20), 10).map((row) => row.length)).toEqual(
      [10, 10],
    )
  })

  test("one short row when fewer tags than columns", () => {
    expect(chunkRemainderFirst(range(4), 10)).toEqual([[0, 1, 2, 3]])
  })

  test("no tags, no rows; a non-positive column count means one per row", () => {
    expect(chunkRemainderFirst([], 5)).toEqual([])
    expect(chunkRemainderFirst(range(3), 0)).toEqual([[0], [1], [2]])
  })
})

describe("COMPOSER_TAG_COLLAPSED_MAX_PX", () => {
  test("is three 20px rows, two 1px gaps and 2px top padding", () => {
    expect(COMPOSER_TAG_COLLAPSED_MAX_PX).toBe(62)
  })
})
