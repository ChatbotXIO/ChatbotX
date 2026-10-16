import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  commentFindMany: vi.fn(),
  storyFindMany: vi.fn(),
  messengerFindMany: vi.fn(),
  instagramFindMany: vi.fn(),
  threadsFindMany: vi.fn(),
  tiktokFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: {
    query: {
      commentAutomationModel: { findMany: mocks.commentFindMany },
      igStoryAutomationModel: { findMany: mocks.storyFindMany },
      integrationMessengerModel: { findMany: mocks.messengerFindMany },
      integrationInstagramModel: { findMany: mocks.instagramFindMany },
      integrationThreadsModel: { findMany: mocks.threadsFindMany },
      integrationTiktokModel: { findMany: mocks.tiktokFindMany },
    },
  },
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  ne: (...args: unknown[]) => ({ ne: args }),
  relationsFilterToSQL: vi.fn(),
  sql: (...args: unknown[]) => ({ sql: args }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  commentAutomationTypes: { enum: { messenger: "messenger" } },
  igCommentAutomationTypes: { options: ["instagram", "instagramFacebook"] },
  igStoryAutomationTypes: { options: ["instagram", "instagramFacebook"] },
  normalizeReplyTexts: (reply: unknown) => reply,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  commentAutomationModel: {},
  commentAutomationReplyModel: {},
  contactInboxModel: {},
  igStoryAutomationModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: () => ({ limit: 10, offset: 0 }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({}),
}))

vi.mock("@chatbotx.io/utils", () => ({ createId: () => "id-1" }))
vi.mock("date-fns-tz", () => ({ formatInTimeZone: () => "00:00" }))
vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))
vi.mock("../src/flow/service", () => ({ flowService: { exists: vi.fn() } }))

const { assertAutomationAccount, listAutomationAccounts } = await import(
  "../src/comment-automation/account-scope"
)
const { commentAutomationService } = await import(
  "../src/comment-automation/service"
)
const { igStoryAutomationService } = await import(
  "../src/ig-story-automation/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.messengerFindMany.mockResolvedValue([])
  mocks.instagramFindMany.mockResolvedValue([])
  mocks.threadsFindMany.mockResolvedValue([])
  mocks.tiktokFindMany.mockResolvedValue([])
})

describe("findActiveAutomations — account scope", () => {
  test("comment automations match the comment's account or no account", async () => {
    mocks.commentFindMany.mockResolvedValue([])

    await commentAutomationService.findActiveAutomations({
      workspaceId: "ws-1",
      channelType: "messenger",
      inboxId: "inbox-a",
    })

    expect(mocks.commentFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        isActive: true,
        type: "messenger",
        OR: [{ inboxId: { isNull: true } }, { inboxId: "inbox-a" }],
      },
    })
  })

  test("story automations match the story reply's account or no account", async () => {
    mocks.storyFindMany.mockResolvedValue([])

    await igStoryAutomationService.findActiveAutomations({
      workspaceId: "ws-1",
      channelType: "instagramFacebook",
      inboxId: "inbox-b",
    })

    expect(mocks.storyFindMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "ws-1",
        isActive: true,
        type: "instagramFacebook",
        OR: [{ inboxId: { isNull: true } }, { inboxId: "inbox-b" }],
      },
    })
  })
})

describe("listAutomationAccounts", () => {
  test("tells the two Instagram connections apart by integration type", async () => {
    await listAutomationAccounts({
      workspaceId: "ws-1",
      type: "instagramFacebook",
    })
    await listAutomationAccounts({ workspaceId: "ws-1", type: "instagram" })

    expect(
      mocks.instagramFindMany.mock.calls.map((call) => call[0].where),
    ).toEqual([
      { workspaceId: "ws-1", type: "facebook" },
      { workspaceId: "ws-1", type: "instagram" },
    ])
  })

  test("reads each channel from its own integration table", async () => {
    await listAutomationAccounts({ workspaceId: "ws-1", type: "messenger" })
    await listAutomationAccounts({ workspaceId: "ws-1", type: "threads" })
    await listAutomationAccounts({ workspaceId: "ws-1", type: "tiktok" })

    expect(mocks.messengerFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.threadsFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.tiktokFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.instagramFindMany).not.toHaveBeenCalled()
  })
})

describe("assertAutomationAccount", () => {
  test("accepts null (every account) and undefined (unchanged) without a lookup", async () => {
    await assertAutomationAccount({
      workspaceId: "ws-1",
      type: "messenger",
      inboxId: null,
    })
    await assertAutomationAccount({
      workspaceId: "ws-1",
      type: "messenger",
      inboxId: undefined,
    })

    expect(mocks.messengerFindMany).not.toHaveBeenCalled()
  })

  test("accepts an account of the automation's channel in this workspace", async () => {
    mocks.messengerFindMany.mockResolvedValue([
      { inboxId: "inbox-a", name: "Page A" },
    ])

    await expect(
      assertAutomationAccount({
        workspaceId: "ws-1",
        type: "messenger",
        inboxId: "inbox-a",
      }),
    ).resolves.toBeUndefined()
  })

  test("rejects an account of another channel or workspace", async () => {
    mocks.messengerFindMany.mockResolvedValue([
      { inboxId: "inbox-a", name: "Page A" },
    ])

    await expect(
      assertAutomationAccount({
        workspaceId: "ws-1",
        type: "messenger",
        inboxId: "inbox-other",
      }),
    ).rejects.toMatchObject({ field: "inboxId" })
  })

  test("createMessenger refuses to store an account that is not connected", async () => {
    mocks.messengerFindMany.mockResolvedValue([])

    await expect(
      commentAutomationService.createMessenger({
        workspaceId: "ws-1",
        data: {
          name: "Scoped",
          inboxId: "inbox-other",
        } as never,
      }),
    ).rejects.toMatchObject({ field: "inboxId" })
  })
})
