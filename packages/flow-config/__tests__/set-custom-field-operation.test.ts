import { FieldOperationType as RegistryOperationType } from "@chatbotx.io/utils/custom-field-operation"
import { describe, expect, test } from "vitest"
import {
  FieldOperationType,
  setCustomFieldActionSchema,
  setCustomFieldStepDefaultFn,
  setCustomFieldStepSchema,
} from "../src"

const step = (operation: string, value: string) =>
  setCustomFieldStepSchema.safeParse({
    ...setCustomFieldStepDefaultFn(),
    inputFieldId: "1",
    operation,
    value,
  })

describe("FieldOperationType", () => {
  test("is the registry's enum, so existing imports keep working", () => {
    expect(FieldOperationType).toBe(RegistryOperationType)
  })
})

describe("setCustomFieldStepSchema operand rule", () => {
  test.each([
    "O01",
    "O02",
    "O03",
    "O04",
    "O05",
  ])("legacy %s keeps parsing with a blank value (stored flows)", (operation) => {
    expect(step(operation, "").success).toBe(true)
  })

  test.each([
    "O07",
    "O09",
    "O10",
    "O11",
    "O12",
  ])("%s requires an operand", (operation) => {
    expect(step(operation, "").success).toBe(false)
    expect(step(operation, "  ").success).toBe(false)
    expect(step(operation, "1").success).toBe(true)
  })

  test.each(["O06", "O08"])("%s needs no operand", (operation) => {
    expect(step(operation, "").success).toBe(true)
  })

  test("rejects an unknown operation code", () => {
    expect(step("O99", "1").success).toBe(false)
  })
})

describe("setCustomFieldActionSchema (trigger action)", () => {
  const parse = (action: Record<string, unknown>) =>
    setCustomFieldActionSchema.safeParse({ customFieldId: "42", ...action })

  test.each([
    undefined,
    "",
  ])("a legacy blank operation (%j) defaults to set", (operation) => {
    const result = parse({ operation, value: "x" })
    expect(result.success && result.data.operation).toBe("O01")
  })

  test("a missing value defaults to blank", () => {
    const result = parse({ operation: "O06" })
    expect(result.success && result.data.value).toBe("")
  })

  test("requires an operand for a formula", () => {
    expect(parse({ operation: "O07" }).success).toBe(false)
  })

  test("requires a field id and a known operation", () => {
    expect(setCustomFieldActionSchema.safeParse({ value: "x" }).success).toBe(
      false,
    )
    expect(parse({ operation: "O99" }).success).toBe(false)
  })
})
