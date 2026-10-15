import { describe, expect, test } from "vitest"
import {
  canonicalizeJsonPath,
  formatJsonPath,
  isJsonbStorable,
  listJsonPathEntries,
  parseJsonPath,
  readJsonPath,
  stringifyJsonPathValue,
} from "../src/json-path"

const payload = {
  customer: { email: "john@example.com", "first-name": "John", "a.b": "dot" },
  order: { total: 125.5, items: [{ name: "Headphones" }, { name: "Case" }] },
  nothing: null,
}

describe("parseJsonPath", () => {
  test.each([
    ["$.customer.email", ["customer", "email"]],
    ["customer.email", ["customer", "email"]],
    ["$.order.items[0].name", ["order", "items", 0, "name"]],
    ['$["customer"]["first-name"]', ["customer", "first-name"]],
    ["$['a.b']", ["a.b"]],
    ["$", []],
    ["$type.x", ["$type", "x"]],
    ["$a", ["$a"]],
    ["a\\.b.c", ["a.b", "c"]],
  ])("parses %s", (input, expected) => {
    expect(parseJsonPath(input)).toEqual(expected)
  })

  test.each([
    "",
    "   ",
    "$.",
    "$..a",
    "$.a[",
    "$.a[abc]",
    '$["a"',
    "$.a[*]",
    "$.items[?(@.id==1)]",
  ])("rejects unsupported syntax %j", (input) => {
    expect(parseJsonPath(input)).toBeNull()
  })
})

describe("parseJsonPath round trip", () => {
  test.each([
    "$['a.b'].c",
    "$['x[0]']",
    "$['back\\slash'].k",
    "$.order.items[2].name",
    "$['$'].id",
    "$['$']",
    "a\\.b.c",
  ])("formatting %s keeps the same segments", (input) => {
    const segments = parseJsonPath(input)
    expect(segments).not.toBeNull()
    expect(parseJsonPath(formatJsonPath(segments ?? []))).toEqual(segments)
  })

  test("reads a legacy dot-prop escaped path (a\\.b) as the key a.b", () => {
    expect(parseJsonPath("a\\.b.c")).toEqual(["a.b", "c"])
    expect(readJsonPath({ "a.b": { c: 1 } }, "a\\.b.c")).toBe(1)
  })

  test("reads a top-level $ key written with brackets", () => {
    expect(readJsonPath({ $: { id: 7 } }, "$['$'].id")).toBe(7)
  })

  test("keeps an empty quoted key, which has a canonical form", () => {
    expect(canonicalizeJsonPath("$['']")).toBe('$[""]')
  })

  test.each([
    "$[1000000000000000000000]",
    "$.a[12345678901234567890]",
    "$[01]",
  ])("rejects an index that cannot be rewritten losslessly: %s", (input) => {
    expect(parseJsonPath(input)).toBeNull()
  })
})

describe("readJsonPath", () => {
  test.each([
    ["$.customer.email", "john@example.com"],
    ["$.order.total", 125.5],
    ["$.order.items[1].name", "Case"],
    ['$.customer["first-name"]', "John"],
    ["$.customer['a.b']", "dot"],
  ])("reads %s", (path, expected) => {
    expect(readJsonPath(payload, path)).toEqual(expected)
  })

  test("returns the root for $", () => {
    expect(readJsonPath(payload, "$")).toBe(payload)
  })

  test("returns undefined for missing paths, invalid paths and non-object payloads", () => {
    expect(readJsonPath(payload, "$.customer.phone")).toBeUndefined()
    expect(readJsonPath(payload, "$.order.items[9].name")).toBeUndefined()
    expect(readJsonPath(payload, "$.a[")).toBeUndefined()
    expect(readJsonPath("text", "$.a")).toBeUndefined()
    expect(readJsonPath(null, "$.a")).toBeUndefined()
  })

  test("does not walk the prototype chain or read built-in members", () => {
    expect(readJsonPath(payload, "$.__proto__.constructor")).toBeUndefined()
    expect(readJsonPath(payload, "$.constructor.name")).toBeUndefined()
    expect(readJsonPath(payload, "$.customer.toString")).toBeUndefined()
    expect(readJsonPath(payload, "$.customer.hasOwnProperty")).toBeUndefined()
    expect(readJsonPath(payload, "$.customer.email.length")).toBeUndefined()
    expect(readJsonPath(payload, "$.order.items.length")).toBeUndefined()
  })

  test("reads the escaped dot-prop form the builder JSON picker emits", () => {
    const keyed = { "a.b": { "x[0]": "ok", back: { "c\\d": "slash" } } }
    expect(readJsonPath(keyed, "a\\.b.x\\[0]")).toBe("ok")
    expect(readJsonPath(keyed, "a\\.b.back.c\\\\d")).toBe("slash")
  })

  test("reads keys that start with a dollar sign", () => {
    expect(readJsonPath({ $type: "t", $: { id: 1 } }, "$type")).toBe("t")
    expect(readJsonPath({ $type: "t" }, "$.$type")).toBe("t")
  })
})

describe("stringifyJsonPathValue", () => {
  test("keeps strings, JSON-encodes the rest, skips null and undefined", () => {
    expect(stringifyJsonPathValue("a")).toBe("a")
    expect(stringifyJsonPathValue(125.5)).toBe("125.5")
    expect(stringifyJsonPathValue(false)).toBe("false")
    expect(stringifyJsonPathValue([1, 2])).toBe("[1,2]")
    expect(stringifyJsonPathValue(null)).toBeUndefined()
    expect(stringifyJsonPathValue(undefined)).toBeUndefined()
  })
})

describe("isJsonbStorable", () => {
  const nested = (depth: number) =>
    JSON.parse(`${"[".repeat(depth)}${"]".repeat(depth)}`)

  test("accepts ordinary documents, accented text and emoji", () => {
    expect(isJsonbStorable({ a: [1, "Nguyễn 😀", null, { b: true }] })).toBe(
      true,
    )
  })

  test("refuses a NUL in a value, a key, an array item or a top-level string", () => {
    expect(isJsonbStorable({ a: "x\u0000" })).toBe(false)
    expect(isJsonbStorable({ "\u0000": 1 })).toBe(false)
    expect(isJsonbStorable(["ok", ["\u0000"]])).toBe(false)
    expect(isJsonbStorable("\u0000")).toBe(false)
  })

  test("refuses a lone surrogate", () => {
    expect(isJsonbStorable({ a: "\ud800" })).toBe(false)
  })

  test("allows nesting up to 64 levels and refuses 65", () => {
    expect(isJsonbStorable(nested(64))).toBe(true)
    expect(isJsonbStorable(nested(65))).toBe(false)
  })
})

describe("formatJsonPath", () => {
  test.each([
    [[], "$"],
    [["customer", "email"], "$.customer.email"],
    [["items", 0, "name"], "$.items[0].name"],
    [["customer-data", "email"], '$["customer-data"].email'],
    [["a.b"], '$["a.b"]'],
    [["has space"], '$["has space"]'],
    [["$type"], '$["$type"]'],
    [["9lives"], '$["9lives"]'],
    [["007"], '$["007"]'],
    [["12"], "$[12]"],
    [[""], '$[""]'],
    [['say "hi"'], '$["say \\"hi\\""]'],
    [["back\\slash"], '$["back\\\\slash"]'],
    [["a]b"], '$["a]b"]'],
    [["new\nline"], '$["new\\nline"]'],
  ])("writes %j as %s", (segments, expected) => {
    expect(formatJsonPath(segments)).toBe(expected)
  })

  test("reads back to the same segments for awkward keys", () => {
    const keys = [
      "",
      "a.b",
      "a]b",
      '"',
      "'",
      "\\",
      '\\"',
      "\n",
      "$",
      "é",
      "007",
    ]
    for (const key of keys) {
      expect(parseJsonPath(formatJsonPath([key, 1, key]))).toEqual([
        key,
        1,
        key,
      ])
    }
  })
})

describe("canonicalizeJsonPath", () => {
  test("rewrites every accepted form to the $ form", () => {
    expect(canonicalizeJsonPath("customer.phone")).toBe("$.customer.phone")
    expect(canonicalizeJsonPath("items.0.name")).toBe("$.items[0].name")
    expect(canonicalizeJsonPath("$['a-b'].c")).toBe('$["a-b"].c')
    expect(canonicalizeJsonPath("$.a.b")).toBe("$.a.b")
    expect(canonicalizeJsonPath("$")).toBe("$")
  })

  test("returns null for input that does not parse", () => {
    expect(canonicalizeJsonPath("")).toBeNull()
    expect(canonicalizeJsonPath("$.a[*]")).toBeNull()
    expect(canonicalizeJsonPath('$["unterminated')).toBeNull()
    expect(canonicalizeJsonPath('$["bad\\q"]')).toBeNull()
  })
})

describe("parseJsonPath escapes", () => {
  test("reads escaped quotes and brackets inside a double-quoted key", () => {
    expect(parseJsonPath('$["a\\"b"]')).toEqual(['a"b'])
    expect(parseJsonPath('$["a]b"].c')).toEqual(["a]b", "c"])
    expect(parseJsonPath('$[""]')).toEqual([""])
  })
})

describe("listJsonPathEntries", () => {
  const sample = { customer: { email: "a@b.co", tags: ["x", "y"] }, n: 3 }

  test("lists every node in document order with a $ path and a preview", () => {
    const { entries, truncated } = listJsonPathEntries(sample)
    expect(truncated).toBe(false)
    expect(entries.map(({ path }) => path)).toEqual([
      "$",
      "$.customer",
      "$.customer.email",
      "$.customer.tags",
      "$.customer.tags[0]",
      "$.customer.tags[1]",
      "$.n",
    ])
    expect(entries[2]?.preview).toBe("a@b.co")
    expect(entries[1]?.preview).toBeNull()
  })

  test("stops at the entry cap and says so", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`k${index}`, index]),
    )
    const { entries, truncated } = listJsonPathEntries(wide, { maxEntries: 10 })
    expect(entries).toHaveLength(10)
    expect(truncated).toBe(true)
  })

  test("truncates long previews", () => {
    const { entries } = listJsonPathEntries(
      { text: "x".repeat(500) },
      { maxPreviewLength: 20 },
    )
    expect(entries[1]?.preview).toBe(`${"x".repeat(20)}…`)
  })

  test("handles a primitive root", () => {
    expect(listJsonPathEntries(5).entries).toEqual([
      { segments: [], path: "$", preview: "5" },
    ])
  })
})
