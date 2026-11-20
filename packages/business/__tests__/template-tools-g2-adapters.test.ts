// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertCopyNamed: vi.fn(),
  minigameInsert: vi.fn(),
  miniAppInsert: vi.fn(),
  leaderboardInsert: vi.fn(),
  warn: vi.fn(),
  track: vi.fn(),
  updateSet: vi.fn(),
  inboxChannel: { current: "messenger" as string | null },
  inboxFindMany: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  eq: () => ({}),
  and: () => ({}),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  miniAppNotPublishedRaw: () => ({}),
  inboxRepository: {
    listIdentitiesByIds: (
      input: { workspaceId: string; ids: string[] },
      tx: {
        query: {
          inboxModel: {
            findMany: (args: unknown) => Promise<unknown[]>
          }
        }
      },
    ) =>
      tx.query.inboxModel.findMany({
        where: { workspaceId: input.workspaceId, id: { in: input.ids } },
      }),
  },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  minigameModel: {},
  leaderboardModel: {},
}))
vi.mock("../src/template/adapters/naming", () => ({
  insertCopyNamed: mocks.insertCopyNamed,
}))
vi.mock("../src/minigame/service", () => ({
  minigameService: { insertInTx: mocks.minigameInsert },
}))
vi.mock("../src/mini-app/service", () => ({
  miniAppService: { insertInTx: mocks.miniAppInsert },
}))
vi.mock("../src/leaderboard/service", () => ({
  LEADERBOARD_PLATFORM_CHANNEL: { messenger: "messenger" },
  leaderboardService: { insertDraftInTx: mocks.leaderboardInsert },
}))

const { minigamesAdapter } = await import("../src/template/adapters/minigames")
const { leaderboardsAdapter } = await import(
  "../src/template/adapters/leaderboards"
)
const { miniAppsAdapter } = await import("../src/template/adapters/mini-apps")
const { ChatbotXException } = await import("../src/errors")
const {
  applyCustomFieldMappings,
  collectCustomFieldMappings,
  createNode,
  createStarterDefinition,
} = await import("@chatbotx.io/mini-app")

const context = (overrides: Record<string, unknown> = {}) => ({
  tx: {
    query: {
      inboxModel: {
        findMany: (args: {
          where: { workspaceId: string; id: { in: string[] } }
        }) => {
          mocks.inboxFindMany(args)
          const channel = mocks.inboxChannel.current
          return Promise.resolve(
            channel ? args.where.id.in.map((id) => ({ id, channel })) : [],
          )
        },
      },
    },
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values)
        return { where: () => Promise.resolve() }
      },
    }),
  } as never,
  workspaceId: "ws-target",
  installationId: "inst-1",
  sourceWorkspaceId: "ws-source",
  idMaps: {} as Record<string, Map<string, string>>,
  track: mocks.track,
  warn: mocks.warn,
  ...overrides,
})

const image = { mode: "file", url: "" }
const minigame = (overrides: Record<string, unknown> = {}) => ({
  sourceId: "m1",
  name: "Lucky draw",
  type: "jackpot",
  enabled: true,
  generalSettings: {
    name: "Lucky draw",
    showName: false,
    playedAtFrom: "2099-01-01T00:00:00.000Z",
    playedAtTo: "2099-02-01T00:00:00.000Z",
    rulesDescription: "",
    openerTagIds: ["11", "12"],
    playerTagIds: [],
    newFriendTagIds: [],
  },
  appearance: {
    backgroundColor: "#fff",
    machineColor: "#fff",
    decorativeColor: "#fff",
    ruleTextColor: "#000",
    backgroundImage: image,
    prizeDescriptionImage: image,
    startButtonImage: image,
  },
  playerSettings: {
    resetPolicy: "never",
    drawsPerPerson: 1,
    maxSharesPerPerson: 0,
    sharingFlowId: "21",
    sharingNodeId: "41",
  },
  prizeSettings: {
    prizes: [
      { id: "p1", name: "Coffee", winRate: 40, quantity: 7, icon: image },
    ],
    nonWinning: { title: "Next time", loseRate: 60, loseImage: image },
    prizeNameCustomFieldId: "31",
  },
  winningMessageSettings: {
    title: "",
    description: "",
    acceptButtonText: "",
    shareButtonText: "",
    shareButtonDescription: "",
    outcomeMessage: { enabled: true, mode: "flow", flowId: "21" },
  },
  nonWinningMessageSettings: {
    title: "",
    description: "",
    shareButtonText: "",
    shareButtonDescription: "",
    outcomeMessage: { enabled: false, mode: "text", text: "" },
  },
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inboxChannel.current = "messenger"
  mocks.insertCopyNamed.mockImplementation(
    async (
      _ctx,
      input: { insert: (tx: unknown, name: string) => Promise<unknown> },
    ) => await input.insert({}, "Lucky draw"),
  )
  mocks.minigameInsert.mockResolvedValue({
    id: "mg-new",
    generalSettings: { name: "Lucky draw" },
  })
})

describe("minigames adapter", () => {
  test("tags and the prize-name field are rebound at insert, with the stock kept; flows wait for the patch", async () => {
    const ctx = context({
      idMaps: {
        tag: new Map([["11", "111"]]),
        customField: new Map([["31", "131"]]),
      },
    })

    const tasks = await minigamesAdapter.insert(ctx, [minigame()])

    const written = mocks.minigameInsert.mock.calls[0]?.[1]
    expect(written.generalSettings.openerTagIds).toEqual(["111"])
    expect(written.prizeSettings.prizeNameCustomFieldId).toBe("131")
    expect(written.prizeSettings.prizes[0].quantity).toBe(7)
    expect(written.playerSettings.sharingFlowId).toBeNull()
    expect(written.winningMessageSettings.outcomeMessage.flowId).toBeNull()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "tag", value: "12" }),
    )
    expect(tasks).toHaveLength(1)
    expect(ctx.idMaps.minigame?.get("m1")).toBe("mg-new")
  })

  test("the patch writes the copied flows; a flow that did not come along switches that message off", async () => {
    const ctx = context({ idMaps: { tag: new Map(), customField: new Map() } })
    const [task] = await minigamesAdapter.insert(ctx, [minigame()])

    ctx.idMaps.flow = new Map([["21", "121"]])
    await task.apply(ctx)
    expect(mocks.updateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        playerSettings: expect.objectContaining({
          sharingFlowId: "121",
          sharingNodeId: "41",
        }),
        winningMessageSettings: expect.objectContaining({
          outcomeMessage: expect.objectContaining({
            flowId: "121",
            enabled: true,
          }),
        }),
      }),
    )

    ctx.idMaps.flow = new Map()
    await task.apply(ctx)
    expect(mocks.updateSet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        playerSettings: expect.objectContaining({
          sharingFlowId: null,
          sharingNodeId: null,
        }),
        winningMessageSettings: expect.objectContaining({
          outcomeMessage: expect.objectContaining({
            flowId: null,
            enabled: false,
          }),
        }),
      }),
    )
  })

  test("the name is limited to the 150 characters the settings accept", async () => {
    await minigamesAdapter.insert(context(), [minigame()])
    expect(mocks.insertCopyNamed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nameRules: { style: "dash", maxLength: 150 },
      }),
    )
  })
})

describe("leaderboards adapter", () => {
  const board = (overrides: Record<string, unknown> = {}) => ({
    sourceId: "l1",
    name: "Top",
    description: "",
    coverImageUrl: "",
    startsAt: "2099-01-01T00:00:00.000Z",
    endsAt: "2099-02-01T00:00:00.000Z",
    platform: "messenger",
    inboxSourceId: "inbox-src",
    minigameId: null,
    scope: { postScope: "specific", postIds: ["p1"], telegramChatIds: [] },
    rules: { comments: { enabled: true, points: 30 } },
    followersOnly: false,
    tagIds: [],
    resetTime: "22:00",
    cooldownSeconds: 0,
    referralWelcomeFlowId: "21",
    rewardSettings: { flowId: "21", topN: 3, autoOnFinish: false },
    ...overrides,
  })

  beforeEach(() => {
    mocks.leaderboardInsert.mockResolvedValue({ id: "lb-new" })
  })

  test("without a bound inbox the campaign is skipped with a warning, never widened", async () => {
    await leaderboardsAdapter.insert(context(), [board()])

    expect(mocks.leaderboardInsert).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "leaderboardHostMissing" }),
    )
  })

  test("looks up the distinct bound inboxes once, workspace-scoped, however many boards share one", async () => {
    const ctx = context({
      idMaps: { inbox: new Map([["inbox-src", "inbox-new"]]) },
    })

    await leaderboardsAdapter.insert(ctx, [
      board({ sourceId: "l1" }),
      board({ sourceId: "l2" }),
      board({ sourceId: "l3" }),
    ])

    expect(mocks.inboxFindMany).toHaveBeenCalledTimes(1)
    expect(mocks.inboxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-target", id: { in: ["inbox-new"] } },
      }),
    )
    expect(mocks.leaderboardInsert).toHaveBeenCalledTimes(3)
  })

  test("an inbox of another channel counts as unbound", async () => {
    mocks.inboxChannel.current = "telegram"
    await leaderboardsAdapter.insert(
      context({ idMaps: { inbox: new Map([["inbox-src", "inbox-new"]]) } }),
      [board()],
    )
    expect(mocks.leaderboardInsert).not.toHaveBeenCalled()
  })

  test("installs a draft host-bound with the post selection cleared and the flows left for the patch", async () => {
    const ctx = context({
      idMaps: { inbox: new Map([["inbox-src", "inbox-new"]]) },
    })

    const tasks = await leaderboardsAdapter.insert(ctx, [board()])

    expect(mocks.leaderboardInsert).toHaveBeenCalledWith(
      ctx.tx,
      expect.objectContaining({
        inboxId: "inbox-new",
        minigameId: null,
        scope: { postScope: "all", postIds: [], telegramChatIds: [] },
        referralWelcomeFlowId: null,
        rewardSettings: expect.objectContaining({ flowId: null }),
      }),
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "postSelectionRequired" }),
    )
    expect(tasks).toHaveLength(1)
  })

  test("a gamification campaign needs its minigame to come along", async () => {
    const entry = board({
      platform: "gamification",
      inboxSourceId: null,
      minigameId: "m1",
      scope: { postScope: "all", postIds: [], telegramChatIds: [] },
    })

    await leaderboardsAdapter.insert(context(), [entry])
    expect(mocks.leaderboardInsert).not.toHaveBeenCalled()

    await leaderboardsAdapter.insert(
      context({ idMaps: { minigame: new Map([["m1", "mg-new"]]) } }),
      [entry],
    )
    expect(mocks.leaderboardInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ minigameId: "mg-new", inboxId: null }),
    )
  })

  test("a configuration the service refuses is skipped with a warning instead of aborting the install", async () => {
    mocks.leaderboardInsert.mockRejectedValueOnce(
      new ChatbotXException("bad rules", "validation", 422),
    )

    await leaderboardsAdapter.insert(
      context({ idMaps: { inbox: new Map([["inbox-src", "inbox-new"]]) } }),
      [board()],
    )

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "leaderboardInvalid" }),
    )
    expect(mocks.track).not.toHaveBeenCalled()
  })
})

describe("mini apps adapter", () => {
  test("a custom field mapping that did not come along is cleared with a warning", async () => {
    mocks.miniAppInsert.mockResolvedValue({ id: "ma-new" })
    mocks.insertCopyNamed.mockImplementation(
      async (
        _ctx,
        input: { insert: (tx: unknown, name: string) => Promise<unknown> },
      ) => await input.insert({}, "Survey"),
    )
    const starter = createStarterDefinition("Hi")
    const input = createNode("TextInput", new Set())
    starter.screens[0]?.children.unshift(input)
    const definition = applyCustomFieldMappings(starter, {
      [String(input.props.name)]: "31",
    })

    await miniAppsAdapter.insert(context(), [
      { sourceId: "a1", name: "Survey", enabled: true, definition },
    ])

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "customField", value: "31" }),
    )
    const written = mocks.miniAppInsert.mock.calls[0]?.[1]
    expect(collectCustomFieldMappings(written.definition)).toEqual({})
  })
})
