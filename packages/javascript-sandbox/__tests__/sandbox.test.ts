import { describe, expect, test } from "vitest"
import { executeJavascript, MAX_CODE_LENGTH } from "../src"

describe("executeJavascript", () => {
  test("executes pure JavaScript against a copied input", async () => {
    await expect(
      executeJavascript({
        code: "return { greeting: input.firstName.toUpperCase() }",
        input: { firstName: "Ada" },
      }),
    ).resolves.toEqual({ value: { greeting: "ADA" } })
  })

  test("does not expose Node or network globals", async () => {
    await expect(
      executeJavascript({
        code: "return [typeof fetch, typeof require, typeof process, typeof globalThis.process]",
        input: {},
      }),
    ).resolves.toEqual({
      value: ["undefined", "undefined", "undefined", "undefined"],
    })
  })

  test("throws a typed error when code times out", async () => {
    await expect(
      executeJavascript({
        code: "while (true) {}",
        input: {},
      }),
    ).rejects.toMatchObject({ code: "javascriptTimeout" })
  })

  test("throws a typed error for a script error", async () => {
    await expect(
      executeJavascript({
        code: 'throw new Error("broken")',
        input: {},
      }),
    ).rejects.toMatchObject({ code: "javascriptExecutionFailed" })
  })

  test("throws a typed error when code exceeds the max length", async () => {
    await expect(
      executeJavascript({
        code: `return ${"1".repeat(MAX_CODE_LENGTH)}`,
        input: {},
      }),
    ).rejects.toMatchObject({ code: "javascriptExecutionFailed" })
  })
})
