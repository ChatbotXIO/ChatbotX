// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findIntegration: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMessengerModel: { findFirst: mocks.findIntegration },
      messengerMessageTemplateModel: { findMany: mocks.findMany },
    },
    $count: vi.fn(),
  },
  and: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  messengerMessageTemplateModel: {},
}))

const { messengerMessageTemplateService } = await import(
  "../src/messenger-message-template/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([{ id: "t" }])
})

describe("messengerMessageTemplateService.list inboxId filter", () => {
  test("an inbox that is not a Messenger Page of the workspace matches nothing", async () => {
    mocks.findIntegration.mockResolvedValue(undefined)

    await expect(
      messengerMessageTemplateService.list({
        where: { workspaceId: "ws-1", inboxId: "foreign" },
      }),
    ).resolves.toEqual([])
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  test("a resolved inbox narrows to its integration", async () => {
    mocks.findIntegration.mockResolvedValue({ id: "im-1" })

    await messengerMessageTemplateService.list({
      where: { workspaceId: "ws-1", inboxId: "inbox-1" },
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ integrationMessengerId: "im-1" }),
      }),
    )
  })
})
