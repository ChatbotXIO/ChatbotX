import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the flow-step handler `countCharacters` (apps/worker/src/
// integration/handlers/tool-handler.ts). It reads a stored value, writes its
// character length to the output field, and — since Account Fields (bot
// fields) were added — must resolve either field through the shared
// `bot_field:<id>` reference-token path as well as the legacy
// ContactCustomField id path. This file focuses on the bot-field paths; the
// pure-ContactCustomField path is covered indirectly by existing behavior and
// asserted once here as a regression check.
// We mock ONLY the boundaries; `@chatbotx.io/flow-config`'s
// `parseFieldReference` is left real. Field existence/value reads go through
// the business layer (`customFieldService`/`contactCustomFieldService`/
// `botFieldService`) — no direct `db` access (see `.agents/rules/data-access.md`).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  setValueByKey: vi.fn(async () => undefined),
  botFieldFind: vi.fn(),
  botFieldFindByKey: vi.fn(),
  customFieldFindBy: vi.fn(),
  contactCustomFieldFindValue: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customFieldService: { findBy: mocks.customFieldFindBy },
  contactCustomFieldService: {
    setValues: mocks.setValues,
    setValueByKey: mocks.setValueByKey,
    findValue: mocks.contactCustomFieldFindValue,
  },
  botFieldService: {
    find: mocks.botFieldFind,
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
      customFieldModel: { findFirst: vi.fn(), findMany: vi.fn() },
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

const { countCharacters } = await import(
  "../src/integration/handlers/tool-handler"
)

type Step = { inputFieldId: string; outputFieldId: string }

function props(step: Step, workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    step,
  } as unknown as Parameters<typeof countCharacters>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("countCharacters step handler", () => {
  test("regression: pure ContactCustomField input/output writes the character count via setValues", async () => {
    mocks.customFieldFindBy.mockResolvedValue({ id: "in-1" })
    mocks.contactCustomFieldFindValue.mockResolvedValue("hello")

    await countCharacters(
      props({ inputFieldId: "in-1", outputFieldId: "out-1" }),
    )

    expect(mocks.customFieldFindBy).toHaveBeenCalledWith({
      where: { id: "in-1", workspaceId: "ws-1" },
    })
    expect(mocks.contactCustomFieldFindValue).toHaveBeenCalledWith({
      contactId: "c-1",
      customFieldId: "in-1",
    })
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [{ customFieldId: "out-1", value: "5" }],
    })
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
  })

  test("writes the character count to a bot-field output via setValueByKey with allowBotFields", async () => {
    // Input is a ContactCustomField, output is an Account Field.
    mocks.customFieldFindBy.mockResolvedValue({ id: "in-1" }) // input existence check
    mocks.botFieldFind.mockResolvedValue({ id: "9", type: "number" }) // output existence check
    mocks.contactCustomFieldFindValue.mockResolvedValue("hello world")

    await countCharacters(
      props({ inputFieldId: "in-1", outputFieldId: "bot_field:9" }),
    )

    expect(mocks.setValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keyword: "bot_field:9",
      value: "11",
      allowBotFields: true,
    })
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("reads the input value from a bot field via findByKey", async () => {
    mocks.botFieldFind.mockImplementation(async ({ id }: { id: string }) =>
      id === "3" ? { id: "3", type: "shortText" } : undefined,
    )
    mocks.customFieldFindBy.mockResolvedValue({ id: "out-1" }) // output existence check
    mocks.botFieldFindByKey.mockResolvedValue({ id: "3", value: "hi" })

    await countCharacters(
      props({ inputFieldId: "bot_field:3", outputFieldId: "out-1" }),
    )

    expect(mocks.botFieldFindByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "3",
    })
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [{ customFieldId: "out-1", value: "2" }],
    })
  })

  test("skips without writing when the input field does not exist", async () => {
    mocks.customFieldFindBy.mockResolvedValue(undefined)

    await countCharacters(
      props({ inputFieldId: "missing", outputFieldId: "out-1" }),
    )

    expect(mocks.contactCustomFieldFindValue).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
  })

  test("logs and swallows a failing bot-field write instead of throwing", async () => {
    mocks.customFieldFindBy.mockResolvedValue({ id: "in-1" })
    mocks.botFieldFind.mockResolvedValue({ id: "9", type: "number" })
    mocks.contactCustomFieldFindValue.mockResolvedValue("abc")
    mocks.setValueByKey.mockRejectedValueOnce(new Error("Bot field not found"))

    await expect(
      countCharacters(
        props({ inputFieldId: "in-1", outputFieldId: "bot_field:9" }),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })
})
