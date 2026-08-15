import { describe, expect, test } from "vitest"
import {
  executeErrorResponseSchema,
  executeRequestSchema,
  executeSuccessResponseSchema,
  MAX_CODE_LENGTH,
} from "../src"

describe("JavaScript executor contract", () => {
  test("accepts a valid execution request", () => {
    expect(
      executeRequestSchema.parse({
        code: "return input.answer",
        input: { answer: 42 },
      }),
    ).toEqual({ code: "return input.answer", input: { answer: 42 } })
  })

  test("rejects empty and oversized code", () => {
    expect(
      executeRequestSchema.safeParse({ code: "", input: {} }).success,
    ).toBe(false)
    expect(
      executeRequestSchema.safeParse({
        code: "x".repeat(MAX_CODE_LENGTH + 1),
        input: {},
      }).success,
    ).toBe(false)
  })

  test("requires input to be a string-keyed record", () => {
    expect(
      executeRequestSchema.safeParse({ code: "return 1", input: [] }).success,
    ).toBe(false)
  })

  test("accepts JSON-compatible success values", () => {
    expect(
      executeSuccessResponseSchema.parse({ value: { nested: [1, true] } }),
    ).toEqual({ value: { nested: [1, true] } })
  })

  test("rejects unknown executor error codes", () => {
    expect(
      executeErrorResponseSchema.safeParse({
        error: { code: "unknownCode", message: "broken" },
      }).success,
    ).toBe(false)
  })
})
