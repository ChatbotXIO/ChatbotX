import { describe, expect, test } from "vitest"
import { connectOpenaiCompatibleSchema } from "@/features/integration-openai-compatible/schemas/request"

describe("OpenAI-compatible action schema", () => {
  const validInput = {
    apiKey: "secret",
    baseURL: "https://example.com/v1",
    name: "Provider",
    preset: "custom",
  }

  test("accepts valid HTTP and HTTPS base URLs", () => {
    expect(
      connectOpenaiCompatibleSchema.safeParse({
        ...validInput,
        baseURL: "http://localhost:1234/v1",
      }).success,
    ).toBe(true)
    expect(connectOpenaiCompatibleSchema.safeParse(validInput).success).toBe(
      true,
    )
  })

  test("rejects empty, non-http, and oversized base URLs", () => {
    expect(
      connectOpenaiCompatibleSchema.safeParse({
        ...validInput,
        baseURL: "",
      }).success,
    ).toBe(false)
    expect(
      connectOpenaiCompatibleSchema.safeParse({
        ...validInput,
        baseURL: "ftp://example.com",
      }).success,
    ).toBe(false)
    expect(
      connectOpenaiCompatibleSchema.safeParse({
        ...validInput,
        baseURL: `https://example.com/${"a".repeat(2049)}`,
      }).success,
    ).toBe(false)
  })
})
