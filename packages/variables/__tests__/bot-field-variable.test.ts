import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockBotFieldFindMany, mockWithCache } = vi.hoisted(() => ({
  mockBotFieldFindMany: vi.fn(),
  mockWithCache: vi.fn(
    async (_key: string, loader: () => Promise<unknown>) => await loader(),
  ),
}))

vi.mock("@chatbotx.io/business", () => ({
  botFieldWorkspaceCacheTags: (workspaceId: string) => [
    "bot-fields",
    `bot-fields:${workspaceId}`,
  ],
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { botFieldModel: { findMany: mockBotFieldFindMany } } },
}))

vi.mock("@chatbotx.io/redis", () => ({ withCache: mockWithCache }))

const { parseBotFieldVariableText } = await import("../src/bot-field-variable")
const { resolveBotFieldVariableText } = await import(
  "../src/bot-field-variable-resolver"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Bot Field variables", () => {
  test("accepts static text and complete numeric Bot Field variables", () => {
    expect(parseBotFieldVariableText("Bearer static-token")).toEqual({
      fieldIds: [],
      status: "valid",
    })
    expect(parseBotFieldVariableText("key-{{bot_field:42}}")).toEqual({
      fieldIds: ["42"],
      status: "valid",
    })
  })

  test("rejects non-Bot Field and malformed variables", () => {
    for (const text of [
      "{{email}}",
      "{{raw:email}}",
      "{{bot_field:abc}}",
      "{{ bot_field:42 }}",
      "{{bot_field:42}",
    ]) {
      expect(parseBotFieldVariableText(text)).toEqual({
        status: "malformed",
      })
    }
  })

  test("resolves only fields from the requested workspace", async () => {
    mockBotFieldFindMany.mockResolvedValue([
      { id: "42", type: "shortText", value: "workspace-secret" },
    ])

    await expect(
      resolveBotFieldVariableText({
        text: "Bearer {{bot_field:42}}",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({ status: "resolved", value: "Bearer workspace-secret" })

    expect(mockBotFieldFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1" },
    })
    expect(mockWithCache).toHaveBeenCalledWith(
      "bot-fields:workspace-1:variable-map",
      expect.any(Function),
      expect.objectContaining({
        tags: ["bot-fields", "bot-fields:workspace-1"],
      }),
    )
  })

  test("fails closed for deleted and empty Bot Fields", async () => {
    mockBotFieldFindMany.mockResolvedValue([])
    await expect(
      resolveBotFieldVariableText({
        text: "{{bot_field:42}}",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({ fieldId: "42", reason: "missing", status: "missing" })

    mockBotFieldFindMany.mockResolvedValue([
      { id: "42", type: "shortText", value: null },
    ])
    await expect(
      resolveBotFieldVariableText({
        text: "{{bot_field:42}}",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({ fieldId: "42", reason: "empty", status: "empty" })
  })
})
