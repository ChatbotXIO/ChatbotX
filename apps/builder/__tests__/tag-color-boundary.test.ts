import {
  hexColorSchema,
  tagGridCellStyle,
  tintedBadgeStyle,
} from "@chatbotx.io/utils/color"
import { describe, expect, test } from "vitest"
import { buildUpdateTagPayload } from "@/features/tags/lib/update-tag-payload"
import {
  createTagPublicRequest,
  createTagRequest,
  updateTagPublicRequest,
  updateTagSchema,
} from "@/features/tags/schema/action"

/** D3/D4: the tag color boundary values and the omitted / null / value semantics. */

const LOWER_HEX = /^#[0-9a-f]{6}$/
const NEUTRAL = {
  backgroundColor: "#f3f4f6",
  borderColor: "#e5e7eb",
  color: "#374151",
}

const invalid = [
  ["empty", ""],
  ["short hex", "#FFF"],
  ["five digits", "#12345"],
  ["seven digits", "#1234567"],
  ["alpha (8 digits)", "#11223344"],
  ["no hash", "112233"],
  ["named", "red"],
  ["rgb()", "rgb(1,2,3)"],
  ["hsl()", "hsl(1,2%,3%)"],
  ["non-hex digit", "#12345G"],
  ["leading space", " #112233"],
  ["trailing space", "#112233 "],
  ["trailing newline", "#112233\n"],
  ["tab", "\t#112233"],
  ["inner space", "#11 233"],
  ["css payload declaration", "#112233; background:url(//evil)"],
  ["css payload expression", "#112233}</style><script>alert(1)</script>"],
  ["url()", "url(javascript:alert(1))"],
  ["var()", "var(--x)"],
  ["full-width digits", "#１１２２３３"],
  ["double hash", "##112233"],
] as const

describe("hexColorSchema boundary values", () => {
  test.each([
    ["#FFFFFF", "#FFFFFF"],
    ["#000000", "#000000"],
    ["#ffffff", "#FFFFFF"],
    ["#abcdef", "#ABCDEF"],
    ["#AbCdEf", "#ABCDEF"],
  ])("%s is stored as %s", (input, stored) => {
    expect(hexColorSchema.parse(input)).toBe(stored)
  })

  test.each(invalid)("rejects %s", (_name, value) => {
    expect(hexColorSchema.safeParse(value).success).toBe(false)
  })

  test.each([
    null,
    undefined,
    0,
    112_233,
    true,
    {},
    [],
  ])("rejects non-string %s", (value) => {
    expect(hexColorSchema.safeParse(value).success).toBe(false)
  })
})

describe("every request schema applies the same color rule", () => {
  const schemas = [
    ["create", createTagRequest],
    ["update (form)", updateTagSchema],
    ["create (public)", createTagPublicRequest],
    ["update (public PATCH/PUT)", updateTagPublicRequest],
  ] as const
  const base = (name: string) =>
    name === "update (public PATCH/PUT)"
      ? { id: "1", name: "a" }
      : { name: "a" }

  describe.each(schemas)("%s", (name, schema) => {
    test("null, #FFFFFF, #000000 and lower case are accepted", () => {
      expect(schema.parse({ ...base(name), color: null }).color).toBeNull()
      expect(schema.parse({ ...base(name), color: "#FFFFFF" }).color).toBe(
        "#FFFFFF",
      )
      expect(schema.parse({ ...base(name), color: "#000000" }).color).toBe(
        "#000000",
      )
      expect(schema.parse({ ...base(name), color: "#aabbcc" }).color).toBe(
        "#AABBCC",
      )
    })

    test.each(invalid)("rejects %s", (_n, color) => {
      expect(schema.safeParse({ ...base(name), color }).success).toBe(false)
    })

    test("omitted color stays absent (not null, not a default)", () => {
      expect("color" in schema.parse(base(name))).toBe(false)
    })
  })
})

describe("update: omitted vs null vs value", () => {
  test("public update: a body with only an id is rejected, color null alone is a real change", () => {
    expect(updateTagPublicRequest.safeParse({ id: "1" }).success).toBe(false)
    expect(updateTagPublicRequest.safeParse({}).success).toBe(false)
    expect(
      updateTagPublicRequest.parse({ id: "1", color: null }),
    ).toMatchObject({
      color: null,
    })
    expect(
      updateTagPublicRequest.parse({ id: "1", color: "#abcdef" }),
    ).toMatchObject({
      color: "#ABCDEF",
    })
  })

  test("form update: empty body rejected, color null / value accepted, name only keeps color absent", () => {
    expect(updateTagSchema.safeParse({}).success).toBe(false)
    expect(updateTagSchema.safeParse({ name: undefined }).success).toBe(false)
    expect(updateTagSchema.safeParse({ color: undefined }).success).toBe(false)
    expect(updateTagSchema.safeParse({ name: "   " }).success).toBe(false)
    expect("color" in updateTagSchema.parse({ name: "a" })).toBe(false)
    expect(updateTagSchema.parse({ color: null }).color).toBeNull()
  })

  test("the edit dialog payload: untouched = omitted, cleared = null, picked = value", () => {
    const send = (
      dirty: { name?: boolean; color?: boolean },
      color: string | null | undefined,
    ) =>
      buildUpdateTagPayload({
        values: { name: "VIP", color },
        dirtyFields: dirty,
        isLocked: false,
      })

    expect("color" in send({ name: true }, "#112233")).toBe(false)
    expect(send({ color: true }, null)).toEqual({ color: null })
    expect(send({ color: true }, undefined)).toEqual({ color: null })
    expect(send({ color: true }, "#112233")).toEqual({ color: "#112233" })
  })
})

describe("rendering never trusts a stored color blindly", () => {
  test.each(
    invalid,
  )("tintedBadgeStyle(%s) falls back to the neutral pastel", (_n, value) => {
    expect(tintedBadgeStyle(value)).toEqual(NEUTRAL)
  })

  test("tintedBadgeStyle of white and black stays readable and well-formed", () => {
    for (const hex of ["#FFFFFF", "#000000"]) {
      const style = tintedBadgeStyle(hex)
      for (const value of Object.values(style)) {
        expect(value).toMatch(LOWER_HEX)
      }
    }
  })

  test("tagGridCellStyle of null or empty is the neutral gray", () => {
    expect(tagGridCellStyle(null, true).backgroundColor).toBe("#8C8C8C")
    expect(tagGridCellStyle("", true).backgroundColor).toBe("#8C8C8C")
  })
})
