import { describe, expect, test } from "vitest"
import { buildUpdateTagPayload } from "@/features/tags/lib/update-tag-payload"

describe("buildUpdateTagPayload", () => {
  const values = { name: "VIP", color: "#112233" }

  test("sends only the dirty fields", () => {
    expect(
      buildUpdateTagPayload({
        values,
        dirtyFields: { color: true },
        isLocked: false,
      }),
    ).toEqual({ color: "#112233" })
    expect(
      buildUpdateTagPayload({
        values,
        dirtyFields: { name: true },
        isLocked: false,
      }),
    ).toEqual({ name: "VIP" })
    expect(
      buildUpdateTagPayload({
        values,
        dirtyFields: { name: true, color: true },
        isLocked: false,
      }),
    ).toEqual({ name: "VIP", color: "#112233" })
  })

  test("a cleared color is sent as null, an untouched one is omitted", () => {
    expect(
      buildUpdateTagPayload({
        values: { name: "VIP", color: null },
        dirtyFields: { color: true },
        isLocked: false,
      }),
    ).toEqual({ color: null })
    expect(
      buildUpdateTagPayload({ values, dirtyFields: {}, isLocked: false }),
    ).toEqual({})
  })

  test("a View-only copy never sends the name, even if it looks dirty", () => {
    expect(
      buildUpdateTagPayload({
        values,
        dirtyFields: { name: true, color: true },
        isLocked: true,
      }),
    ).toEqual({ color: "#112233" })
  })
})
