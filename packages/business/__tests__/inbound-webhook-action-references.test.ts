import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  flowExists: vi.fn(),
  findTags: vi.fn(),
  findBotFields: vi.fn(),
  findCustomFields: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  flowRepository: { existsInWorkspace: mocks.flowExists },
}))
vi.mock("../src/tag/service", () => ({
  tagService: { findManyByIds: mocks.findTags },
}))
vi.mock("../src/bot-field/service", () => ({
  botFieldService: { findManyByIds: mocks.findBotFields },
}))
vi.mock("../src/custom-field/service", () => ({
  customFieldService: { findManyByIds: mocks.findCustomFields },
}))

const { actionReferencesExistInWorkspace } = await import(
  "../src/inbound-webhook/action-references"
)

const check = (actions: Record<string, unknown>[]) =>
  actionReferencesExistInWorkspace({
    workspaceId: "ws-1",
    actions: actions as never,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.flowExists.mockResolvedValue(true)
  mocks.findTags.mockImplementation(({ ids }: { ids: string[] }) =>
    Promise.resolve(ids.map((id) => ({ id }))),
  )
  mocks.findBotFields.mockImplementation(({ ids }: { ids: string[] }) =>
    Promise.resolve(ids.map((id) => ({ id }))),
  )
  mocks.findCustomFields.mockImplementation(({ ids }: { ids: string[] }) =>
    Promise.resolve(ids.map((id) => ({ id }))),
  )
})

describe("actionReferencesExistInWorkspace", () => {
  test("is true when every referenced record belongs to the workspace", async () => {
    await expect(
      check([
        { type: "startAnotherFlow", flowId: "7" },
        { type: "addTag", tagIds: ["1", "2"] },
        { type: "removeTag", tagIds: ["3"] },
        { type: "setCustomField", customFieldId: "100", value: "x" },
        { type: "clearCustomField", customFieldId: "bot_field:55" },
        { type: "transferConversationToHuman" },
      ]),
    ).resolves.toBe(true)
    expect(mocks.flowExists).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "7",
    })
    expect(mocks.findTags).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1", "2", "3"],
    })
    expect(mocks.findBotFields).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["55"],
    })
    expect(mocks.findCustomFields).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["100"],
    })
  })

  test("is true with no actions and asks nothing of the database beyond empty lookups", async () => {
    await expect(check([])).resolves.toBe(true)
    expect(mocks.flowExists).not.toHaveBeenCalled()
    expect(mocks.findCustomFields).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: [],
    })
  })

  test("a flow of another workspace fails", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      check([{ type: "startAnotherFlow", flowId: "999" }]),
    ).resolves.toBe(false)
  })

  test("a tag that is missing from the workspace (or deleted) fails", async () => {
    mocks.findTags.mockResolvedValue([{ id: "1" }])

    await expect(check([{ type: "addTag", tagIds: ["1", "2"] }])).resolves.toBe(
      false,
    )
  })

  test("a custom field or bot field of another workspace fails", async () => {
    mocks.findCustomFields.mockResolvedValue([])
    await expect(
      check([{ type: "setCustomField", customFieldId: "999", value: "x" }]),
    ).resolves.toBe(false)

    mocks.findCustomFields.mockImplementation(({ ids }: { ids: string[] }) =>
      Promise.resolve(ids.map((id) => ({ id }))),
    )
    mocks.findBotFields.mockResolvedValue([])
    await expect(
      check([{ type: "clearCustomField", customFieldId: "bot_field:999" }]),
    ).resolves.toBe(false)
  })

  test.each([
    [
      "a custom field NAME (the writers take ids, so it would save and then do nothing)",
      { type: "setCustomField", customFieldId: "Email", value: "x" },
    ],
    [
      "a malformed clearCustomField id",
      { type: "clearCustomField", customFieldId: "1; drop" },
    ],
    ["a non-numeric tag id", { type: "addTag", tagIds: ["abc"] }],
    [
      "a non-numeric bot field id",
      { type: "setCustomField", customFieldId: "bot_field:abc", value: "x" },
    ],
  ])("%s is rejected without querying (a bigint column would error, not return nothing)", async (_name, action) => {
    await expect(check([action])).resolves.toBe(false)

    expect(mocks.findCustomFields).not.toHaveBeenCalled()
    expect(mocks.findTags).not.toHaveBeenCalled()
    expect(mocks.findBotFields).not.toHaveBeenCalled()
    expect(mocks.flowExists).not.toHaveBeenCalled()
  })

  test("looks each distinct record up once", async () => {
    await check([
      { type: "startAnotherFlow", flowId: "7" },
      { type: "startAnotherFlow", flowId: "7" },
      { type: "addTag", tagIds: ["1"] },
      { type: "addTag", tagIds: ["1"] },
    ])

    expect(mocks.flowExists).toHaveBeenCalledTimes(1)
    expect(mocks.findTags).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["1"],
    })
  })
})
