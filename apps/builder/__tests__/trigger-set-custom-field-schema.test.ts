import { describe, expect, test } from "vitest"
import {
  defaultFn,
  setCustomField,
} from "@/features/triggers/components/actions/schema/set-custom-field"

const action = (patch: Record<string, unknown>) => ({
  type: "setCustomField",
  customFieldId: "42",
  operation: "O01",
  value: "x",
  ...patch,
})

describe("trigger setCustomField action schema", () => {
  test.each([
    "O06",
    "O08",
  ])("%s accepts a request that omits the value", (operation) => {
    const result = setCustomField.safeParse({
      type: "setCustomField",
      customFieldId: "42",
      operation,
    })

    expect(result.success).toBe(true)
  })

  test.each([
    "O07",
    "O09",
    "O10",
    "O11",
    "O12",
  ])("%s still needs a value", (operation) => {
    expect(
      setCustomField.safeParse(action({ operation, value: "" })).success,
    ).toBe(false)
  })

  test("a new action captures the editor's timezone", () => {
    expect(typeof defaultFn().timezone).toBe("string")
    expect(defaultFn().timezone).not.toBe("")
  })

  test("a stored action is parsed as it is, never given a timezone", () => {
    const stored = action({ operation: "O04", value: "5" })
    const result = setCustomField.safeParse(stored)

    expect(result.success && result.data).toEqual(stored)
  })

  test("a stored zone is kept", () => {
    const stored = action({ timezone: "Asia/Bangkok" })
    const result = setCustomField.safeParse(stored)

    expect(result.success && result.data).toMatchObject({
      timezone: "Asia/Bangkok",
    })
  })
})
