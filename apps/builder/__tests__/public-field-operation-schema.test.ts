import {
  FIELD_OPERATION_DEFINITIONS,
  fieldOperationApiNames,
  fieldOperationCodes,
} from "@chatbotx.io/utils/custom-field-operation"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  publicFieldOperationFields,
  requireOperandForOperation,
} from "@/lib/public-api/field-operation"

const schema = z
  .object(publicFieldOperationFields)
  .superRefine(requireOperandForOperation)

describe("public field operation fields", () => {
  test("the operation enum is the registry's apiNames", () => {
    expect(publicFieldOperationFields.operation.options).toEqual(
      fieldOperationCodes.map(
        (code) => FIELD_OPERATION_DEFINITIONS[code].apiName,
      ),
    )
    expect(publicFieldOperationFields.operation.options).toEqual(
      fieldOperationApiNames,
    )
  })

  test("value is trimmed", () => {
    const result = schema.safeParse({ operation: "append", value: " x " })

    expect(result.success && result.data.value).toBe("x")
  })

  test("a whitespace-only value becomes an empty string", () => {
    const result = schema.safeParse({ operation: "append", value: "   " })

    expect(result.success && result.data.value).toBe("")
  })

  test("an omitted value defaults to an empty string", () => {
    const result = schema.safeParse({ operation: "clear" })

    expect(result.success && result.data.value).toBe("")
  })

  test.each(["clear", "setNow"])("value is optional for %s", (operation) => {
    expect(schema.safeParse({ operation }).success).toBe(true)
  })

  test.each([
    "formula",
    "dateExpression",
    "addMinutes",
    "addHours",
    "addDays",
  ])("%s requires a non-blank value at path value", (operation) => {
    for (const value of [undefined, "", "   "]) {
      const result = schema.safeParse({ operation, value })

      expect(result.success).toBe(false)
      expect(!result.success && result.error.issues[0]?.path).toEqual(["value"])
    }
    expect(schema.safeParse({ operation, value: "1" }).success).toBe(true)
  })

  test.each([
    "increase",
    "decrease",
  ])("blank %s is accepted by the public schema (legacy exemption)", (operation) => {
    expect(schema.safeParse({ operation, value: "" }).success).toBe(true)
    expect(schema.safeParse({ operation }).success).toBe(true)
  })

  test.each([
    "append",
    "prepend",
    "set",
  ])("blank %s is accepted", (operation) => {
    expect(schema.safeParse({ operation, value: "" }).success).toBe(true)
  })

  test("an unknown operation name is rejected", () => {
    expect(
      schema.safeParse({ operation: "multiply", value: "1" }).success,
    ).toBe(false)
    expect(schema.safeParse({ operation: "O04", value: "1" }).success).toBe(
      false,
    )
  })
})
