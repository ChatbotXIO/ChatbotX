import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  getAIIntegrationInDB: vi.fn(),
  createAIModelInstance: vi.fn(),
}))

vi.mock("ai", () => ({ generateObject: mocks.generateObject }))

vi.mock("../src/server/factory", () => ({
  getAIIntegrationInDB: mocks.getAIIntegrationInDB,
  createAIModelInstance: mocks.createAIModelInstance,
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { generateCallSummary } = await import(
  "../src/server/services/call-summarizer"
)

const summarize = () =>
  generateCallSummary({
    workspaceId: "workspace-1",
    provider: "openai",
    transcriptText: "[Business] hello",
  })

describe("generateCallSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAIIntegrationInDB.mockResolvedValue({ id: "integration-1" })
    mocks.createAIModelInstance.mockReturnValue("model")
  })

  test("sends a schema OpenAI strict mode accepts: every property is required", async () => {
    mocks.generateObject.mockResolvedValue({
      object: { summary: "s", keyPoints: null, actionItems: null },
    })

    await summarize()

    const { schema } = mocks.generateObject.mock.calls[0]?.[0] as {
      schema: z.ZodType
    }
    const jsonSchema = z.toJSONSchema(schema) as {
      properties: Record<string, unknown>
      required?: string[]
    }
    // OpenAI rejects the request outright (invalid_json_schema) when any
    // property is missing from `required` - the production failure this pins.
    expect(jsonSchema.required?.sort()).toEqual(
      Object.keys(jsonSchema.properties).sort(),
    )
  })

  test("drops a field the model returned as null, keeping the stored shape", async () => {
    mocks.generateObject.mockResolvedValue({
      object: { summary: "s", keyPoints: null, actionItems: null },
    })

    await expect(summarize()).resolves.toEqual({ summary: "s" })
  })

  test("keeps the lists the model did return", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        summary: "s",
        keyPoints: ["asked about pricing"],
        actionItems: ["send a quote"],
      },
    })

    await expect(summarize()).resolves.toEqual({
      summary: "s",
      keyPoints: ["asked about pricing"],
      actionItems: ["send a quote"],
    })
  })
})
