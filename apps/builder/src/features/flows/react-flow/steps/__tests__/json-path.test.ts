import { getProperty } from "dot-prop"
import { describe, expect, test } from "vitest"
import {
  buildDotPropPath,
  parseJsonSafely,
} from "../external-request/components/json-path"

describe("buildDotPropPath", () => {
  test("joins nested object keys with dots", () => {
    expect(buildDotPropPath(["data", "user", "name"])).toBe("data.user.name")
  })

  test("renders array indices as dot-numeric segments", () => {
    expect(buildDotPropPath(["items", 0, "name"])).toBe("items.0.name")
  })

  test("handles an array of primitives", () => {
    expect(buildDotPropPath(["tags", 0])).toBe("tags.0")
  })

  test("escapes a literal dot inside a key", () => {
    expect(buildDotPropPath(["foo.bar", "baz"])).toBe("foo\\.bar.baz")
  })

  test("round-trips through dot-prop getProperty", () => {
    const sample = {
      data: { user: { name: "Ada" } },
      items: [{ name: "first" }, { name: "second" }],
      tags: ["a", "b"],
      "foo.bar": { baz: 42 },
    }

    expect(
      getProperty(sample, buildDotPropPath(["data", "user", "name"])),
    ).toBe("Ada")
    expect(getProperty(sample, buildDotPropPath(["items", 1, "name"]))).toBe(
      "second",
    )
    expect(getProperty(sample, buildDotPropPath(["tags", 0]))).toBe("a")
    expect(getProperty(sample, buildDotPropPath(["foo.bar", "baz"]))).toBe(42)
  })
})

describe("parseJsonSafely", () => {
  test("parses a valid JSON object", () => {
    const result = parseJsonSafely('{"a":1}')
    expect(result).toEqual({ ok: true, value: { a: 1 } })
  })

  test("returns an error for invalid JSON", () => {
    const result = parseJsonSafely("{not json}")
    expect(result.ok).toBe(false)
  })

  test("returns an error for empty input", () => {
    const result = parseJsonSafely("   ")
    expect(result.ok).toBe(false)
  })
})
