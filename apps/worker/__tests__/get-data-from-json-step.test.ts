import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the flow-step handler `getDataFromJSON` (apps/worker/src/
// integration/handlers/tool-handler.ts). It parses a stored JSON value and
// writes each `mapping[].jsonPath` result to its `outputFieldId`. Mapping
// entries can now target either a legacy ContactCustomField id (batched via
// `setValues`, unchanged) or a `bot_field:<id>` Account Field reference
// (written individually via `setValueByKey`). This file focuses on the mixed
// custom+bot mapping case and the bot-field failure path; the pure-
// ContactCustomField path already had no dedicated test before this change,
// so a regression case is included too.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  setValueByKey: vi.fn(async () => undefined),
  botFieldFindByKey: vi.fn(),
  contactCustomFieldFindValue: vi.fn(),
  customFieldFindMany: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customFieldService: { findBy: vi.fn() },
  contactCustomFieldService: {
    setValues: mocks.setValues,
    setValueByKey: mocks.setValueByKey,
    findValue: mocks.contactCustomFieldFindValue,
  },
  botFieldService: {
    find: vi.fn(),
    findByKey: mocks.botFieldFindByKey,
  },
  externalRequestService: {},
}))

vi.mock("@chatbotx.io/business/contact-custom-field", () => ({
  createSourceTimezoneResolver: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      customFieldModel: {
        findFirst: vi.fn(),
        findMany: mocks.customFieldFindMany,
      },
    },
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: vi.fn() },
  extractVariables: vi.fn(() => []),
  getSystemFieldValue: vi.fn(async () => null),
  interpolate: vi.fn((text: string) => text),
  resolveContactVariablesDeep: vi.fn(async (_id, value) => value),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const { getDataFromJSON } = await import(
  "../src/integration/handlers/tool-handler"
)

type Mapping = { jsonPath: string; outputFieldId: string }
type Step = { inputFieldId: string; mapping: Mapping[] }

function props(step: Step, workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    step,
  } as unknown as Parameters<typeof getDataFromJSON>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getDataFromJSON step handler", () => {
  test("regression: writes every valid ContactCustomField mapping in a single batched setValues call", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      JSON.stringify({ name: "Jane", age: 30 }),
    )
    mocks.customFieldFindMany.mockResolvedValue([
      { id: "out-name" },
      { id: "out-age" },
    ])

    await getDataFromJSON(
      props({
        inputFieldId: "in-1",
        mapping: [
          { jsonPath: "name", outputFieldId: "out-name" },
          { jsonPath: "age", outputFieldId: "out-age" },
        ],
      }),
    )

    expect(mocks.setValues).toHaveBeenCalledTimes(1)
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [
        { customFieldId: "out-name", value: "Jane" },
        { customFieldId: "out-age", value: "30" },
      ],
    })
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
  })

  test("splits a mixed custom+bot mapping: custom outputs batch via setValues, bot outputs write via setValueByKey", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      JSON.stringify({ name: "Jane", plan: "pro" }),
    )
    mocks.customFieldFindMany.mockResolvedValue([{ id: "out-name" }])

    await getDataFromJSON(
      props({
        inputFieldId: "in-1",
        mapping: [
          { jsonPath: "name", outputFieldId: "out-name" },
          { jsonPath: "plan", outputFieldId: "bot_field:7" },
        ],
      }),
    )

    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [{ customFieldId: "out-name", value: "Jane" }],
    })
    expect(mocks.setValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keyword: "bot_field:7",
      value: "pro",
      allowBotFields: true,
    })
  })

  test("reads the input JSON from a bot field via findByKey", async () => {
    mocks.botFieldFindByKey.mockResolvedValue({
      value: JSON.stringify({ city: "Hanoi" }),
    })

    await getDataFromJSON(
      props({
        inputFieldId: "bot_field:2",
        mapping: [{ jsonPath: "city", outputFieldId: "bot_field:8" }],
      }),
    )

    expect(mocks.botFieldFindByKey).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      key: "2",
    })
    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "bot_field:8", value: "Hanoi" }),
    )
  })

  test("logs and swallows a failing bot-field write, still reporting success for the step", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      JSON.stringify({ plan: "pro" }),
    )
    mocks.setValueByKey.mockRejectedValueOnce(new Error("Bot field not found"))

    const result = await getDataFromJSON(
      props({
        inputFieldId: "in-1",
        mapping: [{ jsonPath: "plan", outputFieldId: "bot_field:99" }],
      }),
    )

    expect(result).toEqual({ status: "success", result: null })
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })

  test("returns an error result when the input field has no value", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(undefined)

    const result = await getDataFromJSON(
      props({
        inputFieldId: "in-1",
        mapping: [{ jsonPath: "x", outputFieldId: "out-1" }],
      }),
    )

    expect(result).toEqual({
      status: "error",
      errorMessage: "Input custom field not found",
      result: null,
    })
    expect(mocks.setValues).not.toHaveBeenCalled()
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
  })
})
