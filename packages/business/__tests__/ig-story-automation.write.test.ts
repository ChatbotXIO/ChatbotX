import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const returning = vi.fn(async () => [{ id: "story-1" }])
  return {
    db: {
      query: {
        igStoryAutomationModel: {
          findFirst: mocks.findFirst,
          findMany: mocks.findMany,
        },
      },
      insert: () => ({
        values: (values: unknown) => {
          mocks.insertValues(values)
          return { returning }
        },
      }),
      update: () => ({
        set: (values: unknown) => {
          mocks.updateSet(values)
          return { where: () => ({ returning }) }
        },
      }),
    },
    and: (...args: unknown[]) => ({ and: args }),
    eq: (...args: unknown[]) => ({ eq: args }),
    inArray: (...args: unknown[]) => ({ inArray: args }),
    relationsFilterToSQL: vi.fn(),
    sql: (...args: unknown[]) => ({ sql: args }),
  }
})

vi.mock("@chatbotx.io/database/partials", async () => {
  const { z } = await import("zod")
  return {
    igStoryAutomationTriggers: z.enum(["storyReply", "storyMention"]),
    igStoryAutomationTypes: z.enum(["instagram", "instagramFacebook"]),
    rootFolderId: "0",
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  igStoryAutomationModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: () => ({ limit: 10, offset: 0 }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({}),
}))

vi.mock("@chatbotx.io/utils", () => ({ createId: () => "new-id" }))

const { igStoryAutomationService } = await import(
  "../src/ig-story-automation/service"
)

const narrowedFilters = {
  story: { type: "storyIds" as const, value: ["story-9"] },
  includeKeywords: { type: "contain" as const, value: ["promo"] },
}
const matchAll = {
  story: { type: "all", value: [] },
  includeKeywords: { type: "all", value: [] },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("igStoryAutomationService.create", () => {
  test("defaults to a story reply automation and keeps its filters", async () => {
    await igStoryAutomationService.create({
      workspaceId: "ws-1",
      type: "instagram",
      data: { name: "Replies", ...narrowedFilters },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "storyReply", ...narrowedFilters }),
    )
  })

  test("pins the story and keyword filters to all for a story mention", async () => {
    await igStoryAutomationService.create({
      workspaceId: "ws-1",
      type: "instagram",
      trigger: "storyMention",
      data: { name: "Mentions", ...narrowedFilters },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "storyMention", ...matchAll }),
    )
  })
})

test("writes all-matching filters when a story mention omits them", async () => {
  await igStoryAutomationService.create({
    workspaceId: "ws-1",
    type: "instagram",
    trigger: "storyMention",
    data: { name: "Mentions" },
  })

  expect(mocks.insertValues).toHaveBeenCalledWith(
    expect.objectContaining({ trigger: "storyMention", ...matchAll }),
  )
})

describe("igStoryAutomationService.update", () => {
  test("does not rewrite the filters on an unrelated story mention update", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "story-1",
      trigger: "storyMention",
    })

    await igStoryAutomationService.update(
      { workspaceId: "ws-1", id: "story-1" },
      { isActive: false },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith({ isActive: false })
  })

  test("pins the filters to all when the stored row is a story mention", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "story-1",
      trigger: "storyMention",
    })

    await igStoryAutomationService.update(
      { workspaceId: "ws-1", id: "story-1" },
      { name: "Renamed", ...narrowedFilters },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith({
      name: "Renamed",
      ...matchAll,
    })
  })

  test("leaves a story reply update unchanged", async () => {
    mocks.findFirst.mockResolvedValue({ id: "story-1", trigger: "storyReply" })

    await igStoryAutomationService.update(
      { workspaceId: "ws-1", id: "story-1" },
      { isActive: false },
    )

    expect(mocks.updateSet).toHaveBeenCalledWith({ isActive: false })
  })
})

describe("igStoryAutomationService.findActiveAutomations", () => {
  test("loads only the automations for the given trigger", async () => {
    mocks.findMany.mockResolvedValue([])

    await igStoryAutomationService.findActiveAutomations({
      workspaceId: "ws-1",
      channelType: "instagramFacebook",
      trigger: "storyMention",
      inboxId: "inbox-1",
    })

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        isActive: true,
        type: "instagramFacebook",
        trigger: "storyMention",
        OR: [{ inboxId: { isNull: true } }, { inboxId: "inbox-1" }],
      },
    })
  })
})
