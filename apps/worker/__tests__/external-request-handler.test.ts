import { externalRequestStepDefaultFn } from "@chatbotx.io/flow-config"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeAndMap: vi.fn(),
  setValues: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/business", () => ({
  externalRequestService: {
    execute: mocks.execute,
    executeAndMap: mocks.executeAndMap,
  },
  contactCustomFieldService: {
    setValues: mocks.setValues,
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: vi.fn(
    async (_contactId: string, value: unknown) => value,
  ),
  extractVariables: vi.fn((text: string) => {
    const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)]
    return [...new Set(matches.map((match) => match[1]))]
  }),
  getSystemFieldValue: vi.fn(async () => null),
  contactVariableService: {
    getAll: vi.fn(async () => ({
      contact: {},
      customFieldsMap: new Map([
        [
          "name",
          { key: "name", type: "text", value: 'O"Brien', description: "" },
        ],
      ]),
    })),
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
}))

vi.mock("@chatbotx.io/events", () => ({
  emitCustomFieldChanged: vi.fn(),
}))

const { externalRequest } = await import(
  "../src/integration/handlers/tool-handler"
)

const createProps = () =>
  ({
    conversation: {
      id: "conversation-1",
      workspaceId: "workspace-1",
      contactId: "contact-1",
    },
    step: {
      ...externalRequestStepDefaultFn(),
      id: "step-1",
      url: "https://api.example.com/data",
      mapping: [{ jsonPath: "id", outputFieldId: "field-1" }],
    },
  }) as Parameters<typeof externalRequest>[0]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("externalRequest step handler", () => {
  test("returns success and calls executeAndMap with resolved step", async () => {
    mocks.executeAndMap.mockResolvedValue({
      statusCode: 200,
      durationMs: 10,
      responseBody: '{"id":"abc"}',
      responseHeaders: {},
    })

    const result = await externalRequest(createProps())

    expect(result).toEqual({ status: "success", result: null })
    expect(mocks.executeAndMap).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        contactId: "contact-1",
        mapping: [{ jsonPath: "id", outputFieldId: "field-1" }],
      }),
    )
  })

  test("maps a non-2xx status to an error result", async () => {
    mocks.executeAndMap.mockResolvedValue({
      statusCode: 500,
      durationMs: 10,
      responseBody: "",
      responseHeaders: {},
    })

    const result = await externalRequest(createProps())

    expect(result).toMatchObject({ status: "error" })
    expect(result.errorMessage).toContain("500")
  })

  test("returns an error result when the request throws", async () => {
    mocks.executeAndMap.mockRejectedValue(new Error("network failure"))

    const result = await externalRequest(createProps())

    expect(result).toEqual({
      status: "error",
      errorMessage: "network failure",
      result: null,
    })
  })

  test("JSON-escapes a contact variable substituted into jsonBody", async () => {
    mocks.executeAndMap.mockResolvedValue({
      statusCode: 200,
      durationMs: 10,
      responseBody: "{}",
      responseHeaders: {},
    })

    const props = createProps()
    props.step = {
      ...props.step,
      method: "POST",
      body: { bodyType: "json", jsonBody: '{"name":"{{name}}"}' },
    }

    await externalRequest(props)

    const call = mocks.executeAndMap.mock.calls[0]?.[0]
    expect(call.input.body).toEqual({
      bodyType: "json",
      jsonBody: '{"name":"O\\"Brien"}',
    })
    expect(() => JSON.parse(call.input.body.jsonBody)).not.toThrow()
  })
})
