import { describe, expect, test } from "vitest"
import { createBoundedSeenSet } from "@/lib/bounded-seen-set"

describe("createBoundedSeenSet", () => {
  test("has() is false for a value never added", () => {
    const seen = createBoundedSeenSet<string>(3)
    expect(seen.has("a")).toBe(false)
  })

  test("add() then has() is true", () => {
    const seen = createBoundedSeenSet<string>(3)
    seen.add("a")
    expect(seen.has("a")).toBe(true)
  })

  test("adding the same value twice is a no-op (still just one entry)", () => {
    const seen = createBoundedSeenSet<string>(2)
    seen.add("a")
    seen.add("a")
    seen.add("b")
    expect(seen.has("a")).toBe(true)
    expect(seen.has("b")).toBe(true)
    expect(seen.size()).toBe(2)
  })

  test("stays within capacity, evicting the OLDEST entry once capacity is exceeded", () => {
    const seen = createBoundedSeenSet<string>(2)
    seen.add("a")
    seen.add("b")
    seen.add("c")

    expect(seen.has("a")).toBe(false)
    expect(seen.has("b")).toBe(true)
    expect(seen.has("c")).toBe(true)
    expect(seen.size()).toBe(2)
  })

  test("re-adding an evicted value is treated as new again (not still considered seen)", () => {
    const seen = createBoundedSeenSet<string>(2)
    seen.add("a")
    seen.add("b")
    seen.add("c")
    expect(seen.has("a")).toBe(false)

    seen.add("a")
    expect(seen.has("a")).toBe(true)
    // "b" was the oldest remaining entry, so it is the one evicted now.
    expect(seen.has("b")).toBe(false)
    expect(seen.size()).toBe(2)
  })

  test("never exceeds capacity across many insertions", () => {
    const seen = createBoundedSeenSet<number>(5)
    for (let i = 0; i < 100; i++) {
      seen.add(i)
    }
    expect(seen.size()).toBe(5)
    // Only the most recent 5 remain.
    for (let i = 95; i < 100; i++) {
      expect(seen.has(i)).toBe(true)
    }
    expect(seen.has(94)).toBe(false)
  })
})
