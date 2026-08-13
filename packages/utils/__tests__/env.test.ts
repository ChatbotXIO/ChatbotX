import { describe, expect, test } from "vitest"
import { parseEnvBool } from "../src/env"

describe("parseEnvBool", () => {
  test("passes validated booleans through unchanged", () => {
    expect(parseEnvBool(true)).toBe(true)
    expect(parseEnvBool(false)).toBe(false)
  })

  test("parses zod stringbool truthy strings when validation was skipped", () => {
    expect(parseEnvBool("true")).toBe(true)
    expect(parseEnvBool("TRUE")).toBe(true)
    expect(parseEnvBool("1")).toBe(true)
    expect(parseEnvBool("yes")).toBe(true)
    expect(parseEnvBool("on")).toBe(true)
    expect(parseEnvBool(" true ")).toBe(true)
  })

  test("treats falsy strings as false instead of truthy non-empty strings", () => {
    expect(parseEnvBool("false")).toBe(false)
    expect(parseEnvBool("0")).toBe(false)
    expect(parseEnvBool("no")).toBe(false)
    expect(parseEnvBool("off")).toBe(false)
  })

  test("returns false for undefined, null, and unrecognized values", () => {
    expect(parseEnvBool(undefined)).toBe(false)
    expect(parseEnvBool(null)).toBe(false)
    expect(parseEnvBool("")).toBe(false)
    expect(parseEnvBool("banana")).toBe(false)
    expect(parseEnvBool(1)).toBe(false)
  })
})
