import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  assertResourceEditable: vi.fn(),
  assertReferencable: vi.fn(),
  guardTargets: vi.fn(),
  deleteReturning: vi.fn(),
  lockedKeys: vi.fn(),
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable: mocks.assertResourceEditable,
  assertReferencable: mocks.assertReferencable,
  changedKeysOf: (
    existing: Record<string, unknown>,
    patch: Record<string, unknown>,
  ) => Object.keys(patch).filter((key) => patch[key] !== existing[key]),
  withDeleteGuard: async (
    input: unknown,
    run: (tx: unknown) => Promise<unknown>,
  ) => {
    mocks.guardTargets(input)
    const { db } = await import("@chatbotx.io/database/client")
    return await run(db)
  },
}))
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: async (
    run: (tx: unknown) => Promise<unknown>,
    options: unknown,
  ) => {
    mocks.lockedKeys(options)
    const { db } = await import("@chatbotx.io/database/client")
    return await run(db)
  },
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
      delete: () => ({
        where: () => ({ returning: mocks.deleteReturning }),
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

describe("igStoryAutomationService template guards", () => {
  test("update runs the View-only guard first, with the keys that changed, under the automation's lock", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "story-1",
      trigger: "storyReply",
      name: "Old",
      isActive: true,
    })

    await igStoryAutomationService.update(
      { workspaceId: "ws-1", id: "story-1" },
      { name: "New", isActive: true },
    )

    expect(mocks.assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        resourceKind: "storyAutomation",
        resourceIds: ["story-1"],
        changedKeys: ["name"],
        referencedParents: [],
      }),
    )
    expect(mocks.lockedKeys).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        initialKeys: [{ kind: "storyAutomation", resourceId: "story-1" }],
      }),
    )
  })

  test("update locks the flow or agent a new reply runs together with the automation", async () => {
    mocks.findFirst.mockResolvedValue({ id: "story-1", trigger: "storyReply" })

    await igStoryAutomationService.update(
      { workspaceId: "ws-1", id: "story-1" },
      { reply: { type: "flow", value: "flow-1" } },
    )
    await igStoryAutomationService.update(
      { workspaceId: "ws-1", id: "story-1" },
      { reply: { type: "AIAgent", value: "agent-1" } },
    )

    expect(mocks.assertResourceEditable).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        referencedParents: [{ kind: "flow", resourceId: "flow-1" }],
      }),
    )
    expect(mocks.assertResourceEditable).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        referencedParents: [{ kind: "aiAgent", resourceId: "agent-1" }],
      }),
    )
  })

  test("a refused guard stops the write", async () => {
    mocks.findFirst.mockResolvedValue({ id: "story-1", trigger: "storyReply" })
    mocks.assertResourceEditable.mockRejectedValueOnce(new Error("view only"))

    await expect(
      igStoryAutomationService.update(
        { workspaceId: "ws-1", id: "story-1" },
        { name: "New" },
      ),
    ).rejects.toThrow("view only")
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("create checks that a reply's flow is not being uninstalled", async () => {
    await igStoryAutomationService.create({
      workspaceId: "ws-1",
      type: "instagram",
      data: {
        name: "Story",
        reply: { type: "flow", value: "flow-1" },
      } as never,
    })

    expect(mocks.assertReferencable).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        parents: [{ kind: "flow", resourceId: "flow-1" }],
      }),
    )
  })

  test("deleteMany runs the delete guard over every id, and deleteInTx returns the ids it removed", async () => {
    mocks.deleteReturning.mockResolvedValue([{ id: "a" }, { id: "b" }])

    await igStoryAutomationService.deleteMany({
      workspaceId: "ws-1",
      ids: ["a", "b"],
    })

    expect(mocks.guardTargets).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      targets: [{ resourceKind: "storyAutomation", resourceIds: ["a", "b"] }],
    })
    const { db } = await import("@chatbotx.io/database/client")
    await expect(
      igStoryAutomationService.deleteInTx(db as never, {
        workspaceId: "ws-1",
        ids: ["a", "b"],
      }),
    ).resolves.toEqual(["a", "b"])
  })

  test("deleteMany with no ids touches nothing", async () => {
    await igStoryAutomationService.deleteMany({ workspaceId: "ws-1", ids: [] })

    expect(mocks.guardTargets).not.toHaveBeenCalled()
  })
})
