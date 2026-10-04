// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertReturning: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { folderModel: { findFirst: mocks.findFirst } },
    insert: () => ({
      values: () => ({ returning: mocks.insertReturning }),
    }),
  },
  and: vi.fn(),
  arrayContains: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  or: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  automatedResponseModel: {},
  commentAutomationModel: {},
  customFieldModel: {},
  emailTopicModel: {},
  flowModel: {},
  folderModel: {},
  igStoryAutomationModel: {},
  sequenceModel: {},
  tagModel: {},
  triggerModel: {},
  webhookModel: {},
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: async (_k: string, fn: () => unknown) => await fn(),
}))

const { folderService } = await import("../src/folder/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insertReturning.mockResolvedValue([{ id: "new" }])
})

describe("folderService.create parent lookup", () => {
  test("the parent must be a folder of the same workspace and type", async () => {
    mocks.findFirst.mockResolvedValue({ id: "p", paths: [] })

    await folderService.create({
      workspaceId: "ws-1",
      data: { name: "Child", parentId: "p", folderType: "sequence" },
    })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "p", workspaceId: "ws-1", folderType: "sequence" },
    })
  })

  test("a parent of another workspace or type reads as missing", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      folderService.create({
        workspaceId: "ws-1",
        data: { name: "Child", parentId: "foreign", folderType: "tag" },
      }),
    ).rejects.toThrow("Parent folder does not exist!")
  })
})
