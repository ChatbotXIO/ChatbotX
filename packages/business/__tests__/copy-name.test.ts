import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => ({
  isUniqueViolationError: (error: unknown, constraint?: string) =>
    (error as { code?: string })?.code === "23505" &&
    (constraint === undefined || constraint === "Menu_key"),
}))

const {
  copyName,
  copyNamePrefix,
  freeCopyNames,
  insertWithFreeCopyName,
  MAX_COPY_NAME_ATTEMPTS,
} = await import("../src/lib/copy-name")

const dash = { style: "dash", maxLength: 255 } as const
const underscore = { style: "underscore", maxLength: 255 } as const

describe("copy names", () => {
  test("numbers copies from the second on, per style", () => {
    expect(copyName("Menu", 1, dash)).toBe("Menu - Copy")
    expect(copyName("Menu", 3, dash)).toBe("Menu - Copy 3")
    expect(copyName("Menu", 1, underscore)).toBe("Menu _copy")
    expect(copyName("Menu", 2, underscore)).toBe("Menu _copy 2")
  })

  test("cuts the base so the suffix fits the limit", () => {
    const name = copyName("x".repeat(300), 1, { ...dash, maxLength: 20 })
    expect(name).toHaveLength(20)
    expect(name.endsWith(" - Copy")).toBe(true)
  })

  test("the prefix is shared by every copy name of a long base", () => {
    const options = { ...dash, maxLength: 30 }
    const base = "y".repeat(100)
    const prefix = copyNamePrefix(base, options)
    for (let attempt = 1; attempt <= MAX_COPY_NAME_ATTEMPTS; attempt++) {
      expect(copyName(base, attempt, options).startsWith(prefix)).toBe(true)
    }
  })

  test("an uncut base searches for its own copies, not every name that begins with it", () => {
    expect(copyNamePrefix("A", dash)).toBe("A - Copy")
    expect(copyNamePrefix("A", underscore)).toBe("A _copy")
  })

  test("lists the free names lowest number first", () => {
    const free = freeCopyNames(
      "Menu",
      new Set(["Menu - Copy", "Menu - Copy 3"]),
      dash,
    )
    expect(free.slice(0, 3)).toEqual([
      "Menu - Copy 2",
      "Menu - Copy 4",
      "Menu - Copy 5",
    ])
  })
})

describe("insertWithFreeCopyName", () => {
  const conflict = Object.assign(new Error("taken"), { code: "23505" })

  test("moves to the next candidate when a concurrent copy took the name", async () => {
    const insert = vi
      .fn<(name: string) => Promise<string>>()
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async (name) => name)

    const result = await insertWithFreeCopyName({
      base: "Menu",
      taken: new Set(),
      options: dash,
      insert,
    })

    expect(result).toBe("Menu - Copy 2")
    expect(insert).toHaveBeenCalledTimes(2)
  })

  test("gives up with undefined after the bounded insert attempts", async () => {
    const insert = vi.fn().mockRejectedValue(conflict)

    await expect(
      insertWithFreeCopyName({
        base: "Menu",
        taken: new Set(),
        options: dash,
        insert,
      }),
    ).resolves.toBeUndefined()
    expect(insert).toHaveBeenCalledTimes(2)
  })

  test("with a constraint, a violation of another index is not a taken name", async () => {
    const violation = Object.assign(new Error("slug"), { code: "23505" })
    // The mock treats any violation as unique unless told the constraint differs.
    await expect(
      insertWithFreeCopyName({
        base: "Menu",
        taken: new Set(),
        options: dash,
        constraint: "Other_key",
        insert: () => Promise.reject(violation),
      }),
    ).rejects.toBe(violation)
  })

  test("rethrows anything that is not a unique violation", async () => {
    await expect(
      insertWithFreeCopyName({
        base: "Menu",
        taken: new Set(),
        options: dash,
        insert: () => Promise.reject(new Error("boom")),
      }),
    ).rejects.toThrow("boom")
  })
})
