import { describe, expect, test } from "vitest"
import { withIdTieBreak } from "../src/utils"

describe("withIdTieBreak", () => {
  test("settles ties in the direction of the requested sort", () => {
    expect(withIdTieBreak({ createdAt: "desc" })).toEqual({
      createdAt: "desc",
      id: "desc",
    })
    expect(withIdTieBreak({ createdAt: "asc" })).toEqual({
      createdAt: "asc",
      id: "asc",
    })
  })

  test("the requested sort stays first", () => {
    expect(Object.keys(withIdTieBreak({ name: "asc" }))).toEqual(["name", "id"])
  })

  test("a requested id sort is kept", () => {
    expect(withIdTieBreak({ createdAt: "desc", id: "asc" })).toEqual({
      createdAt: "desc",
      id: "asc",
    })
  })

  test("with no sort, newest first", () => {
    expect(withIdTieBreak({})).toEqual({ id: "desc" })
  })
})
