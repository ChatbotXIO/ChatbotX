import { describe, expect, test } from "vitest"
import {
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
    const appliedTagIds = new Set(["t1"])
    expect(
      isTagShownApplied({
        tagId: "t1",
        appliedTagIds,
        unsettled: new Map([["t1", "remove"]]),
      }),
    ).toBe(false)
    expect(
      isTagShownApplied({
        tagId: "t2",
        appliedTagIds,
        unsettled: new Map([["t2", "add"]]),
      }),
    ).toBe(true)
    expect(
      isTagShownApplied({ tagId: "t1", appliedTagIds, unsettled: new Map() }),
    ).toBe(true)
  })
})
