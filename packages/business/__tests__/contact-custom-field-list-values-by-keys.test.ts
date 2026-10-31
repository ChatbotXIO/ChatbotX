import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listValuesByFieldKeys: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  contactCustomFieldRepository: {
    listValuesByFieldKeys: mocks.listValuesByFieldKeys,
  },
}))

const { contactCustomFieldService } = await import(
  "../src/contact-custom-field/service"
)

describe("contactCustomFieldService.listValuesByKeys", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves name keys", async () => {
    mocks.listValuesByFieldKeys.mockResolvedValue([
      {
        customFieldId: "5",
        name: "Shop location",
        value: "1,2",
        updatedAt: new Date(2),
      },
    ])

    const rows = await contactCustomFieldService.listValuesByKeys({
      workspaceId: "ws-1",
      contactId: "c-1",
      keys: ["Shop location", "bot_field:3"],
    })

    expect(rows).toEqual([
      { key: "Shop location", value: "1,2", updatedAt: new Date(2) },
    ])
    expect(mocks.listValuesByFieldKeys).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      ids: [],
      names: ["Shop location"],
    })
  })

  test("prefers an id match over a same-named field and orders newest first", async () => {
    mocks.listValuesByFieldKeys.mockResolvedValue([
      { customFieldId: "9", name: "7", value: "old", updatedAt: new Date(9) },
      {
        customFieldId: "7",
        name: "Home",
        value: "3,4",
        updatedAt: new Date(1),
      },
      {
        customFieldId: "8",
        name: "Work",
        value: "5,6",
        updatedAt: new Date(5),
      },
    ])

    const rows = await contactCustomFieldService.listValuesByKeys({
      workspaceId: "ws-1",
      contactId: "c-1",
      keys: ["7", "Work"],
    })

    expect(rows).toEqual([
      { key: "Work", value: "5,6", updatedAt: new Date(5) },
      { key: "7", value: "3,4", updatedAt: new Date(1) },
    ])
  })

  test("only bot fields or no keys skips the query", async () => {
    await expect(
      contactCustomFieldService.listValuesByKeys({
        workspaceId: "ws-1",
        contactId: "c-1",
        keys: ["bot_field:3"],
      }),
    ).resolves.toEqual([])
    await expect(
      contactCustomFieldService.listValuesByKeys({
        workspaceId: "ws-1",
        contactId: "c-1",
        keys: [],
      }),
    ).resolves.toEqual([])
    expect(mocks.listValuesByFieldKeys).not.toHaveBeenCalled()
  })
})
