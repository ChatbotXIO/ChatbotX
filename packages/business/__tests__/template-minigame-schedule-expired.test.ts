// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertCopyNamed: vi.fn(),
  minigameInsert: vi.fn(),
  warn: vi.fn(),
  track: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  eq: () => ({}),
  and: () => ({}),
}))
vi.mock("@chatbotx.io/database/schema", () => ({ minigameModel: {} }))
vi.mock("../src/template/adapters/naming", () => ({
  insertCopyNamed: mocks.insertCopyNamed,
}))
vi.mock("../src/minigame/service", () => ({
  minigameService: { insertInTx: mocks.minigameInsert },
}))

const { minigamesAdapter } = await import("../src/template/adapters/minigames")

const image = { mode: "file", url: "" }
const minigame = (playedAtFrom: string, playedAtTo: string) => ({
  sourceId: "m1",
  name: "Lucky draw",
  type: "jackpot",
  enabled: true,
  generalSettings: {
    name: "Lucky draw",
    showName: false,
    playedAtFrom,
    playedAtTo,
    rulesDescription: "",
    openerTagIds: [],
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
    sharingFlowId: null,
    sharingNodeId: null,
  },
  prizeSettings: {
    prizes: [
      { id: "p1", name: "Coffee", winRate: 40, quantity: 7, icon: image },
    ],
    nonWinning: { title: "Next time", loseRate: 60, loseImage: image },
    prizeNameCustomFieldId: null,
  },
  winningMessageSettings: {
    title: "",
    description: "",
    acceptButtonText: "",
    shareButtonText: "",
    shareButtonDescription: "",
    outcomeMessage: { enabled: false, mode: "text", text: "" },
  },
  nonWinningMessageSettings: {
    title: "",
    description: "",
    shareButtonText: "",
    shareButtonDescription: "",
    outcomeMessage: { enabled: false, mode: "text", text: "" },
  },
})

const context = () =>
  ({
    tx: {} as never,
    workspaceId: "ws-target",
    installationId: "inst-1",
    sourceWorkspaceId: "ws-source",
    idMaps: {} as Record<string, Map<string, string>>,
    track: mocks.track,
    warn: mocks.warn,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
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

describe("minigame schedule warning", () => {
  test("warns scheduleExpired when the play window has already ended", async () => {
    await minigamesAdapter.insert(context(), [
      minigame("2020-01-01T00:00:00.000Z", "2020-02-01T00:00:00.000Z"),
    ] as never)
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "minigames",
        entityKind: "scheduleExpired",
        path: "minigames.m1.generalSettings.playedAtTo",
        value: "2020-02-01T00:00:00.000Z",
      }),
    )
  })

  test("does not warn while the play window is still ahead", async () => {
    await minigamesAdapter.insert(context(), [
      minigame("2099-01-01T00:00:00.000Z", "2099-02-01T00:00:00.000Z"),
    ] as never)
    expect(mocks.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ entityKind: "scheduleExpired" }),
    )
  })
})
