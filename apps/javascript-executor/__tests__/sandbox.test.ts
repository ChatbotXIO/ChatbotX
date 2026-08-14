import { MAX_CODE_LENGTH } from "@chatbotx.io/javascript-sandbox"
import { describe, expect, test } from "vitest"
import { executeJavascript } from "../src/sandbox"

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

  test("throws a typed error when code exceeds the isolate memory limit", async () => {
    await expect(
      executeJavascript({
        code: `
          const chunks = [];
          while (true) {
            chunks.push(new Array(1_000_000).fill("x"));
          }
        `,
        input: {},
      }),
    ).rejects.toMatchObject({ code: "javascriptMemoryLimit" })
  })

  test("throws a typed error for a script error", async () => {
    await expect(
      executeJavascript({
        code: 'throw new Error("broken")',
        input: {},
      }),
    ).rejects.toMatchObject({
      code: "javascriptExecutionFailed",
      message: "JavaScript execution failed",
    })
  })

  test("throws a typed error when code returns undefined", async () => {
    await expect(
      executeJavascript({
        code: "return undefined",
        input: {},
      }),
    ).rejects.toMatchObject({ code: "javascriptNoReturnValue" })
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
