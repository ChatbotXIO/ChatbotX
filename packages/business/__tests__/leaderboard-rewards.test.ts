import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdAndWorkspace: vi.fn(),
  claimRewards: vi.fn(),
  claimRewardRecipient: vi.fn(),
  setRewardRecipient: vi.fn(),
  top: vi.fn(),
  findDMByContact: vi.fn(),
  listByContactId: vi.fn(),
  integrationAdd: vi.fn(),
  leaderboardAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  leaderboardRepository: {
    findByIdAndWorkspace: mocks.findByIdAndWorkspace,
    claimRewards: mocks.claimRewards,
    claimRewardRecipient: mocks.claimRewardRecipient,
    setRewardRecipient: mocks.setRewardRecipient,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mocks.integrationAdd },
  LeaderboardJobAction: { triggerRewards: "triggerRewards" },
  leaderboardQueue: { add: mocks.leaderboardAdd },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { listByContactId: mocks.listByContactId },
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: { findDMByContact: mocks.findDMByContact },
}))

vi.mock("../src/leaderboard/ranking", () => ({
  leaderboardRankingService: { top: mocks.top },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { triggerLeaderboardRewards } = await import("../src/leaderboard/rewards")

const finishedLeaderboard = {
  id: "100",
  workspaceId: "1",
  inboxId: "10",
  status: "finished",
  rewardSettings: { flowId: "55", topN: 3, autoOnFinish: true },
}

const winners = [
  { rank: 1, contactId: "7", score: 90 },
  { rank: 2, contactId: "8", score: 80 },
  { rank: 3, contactId: "9", score: 70 },
]

const trigger = (retryFailedInBackground = false) =>
  triggerLeaderboardRewards({
    workspaceId: "1",
    leaderboardId: "100",
    retryFailedInBackground,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByIdAndWorkspace.mockResolvedValue(finishedLeaderboard)
  mocks.claimRewards.mockResolvedValue({
    recipients: {},
    previouslyTriggered: false,
  })
  mocks.claimRewardRecipient.mockResolvedValue(true)
  mocks.setRewardRecipient.mockResolvedValue(undefined)
  mocks.leaderboardAdd.mockResolvedValue(undefined)
  mocks.top.mockResolvedValue(winners)
  mocks.findDMByContact.mockResolvedValue({ id: "c1" })
  mocks.listByContactId.mockResolvedValue([{ id: "ci1", inboxId: "10" }])
})

describe("triggerLeaderboardRewards", () => {
  test("claims each winner before queueing its flow, with a fixed job id", async () => {
    const result = await trigger()
    expect(result.sent).toBe(3)
    expect(mocks.claimRewardRecipient).toHaveBeenCalledTimes(3)
    expect(mocks.integrationAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.anything(),
      { jobId: "lb-reward-100-7" },
    )
    expect(mocks.setRewardRecipient).toHaveBeenCalledWith({
      id: "100",
      contactId: "7",
      delivery: "sent",
    })
  })

  test("never sends to a winner another run already claimed", async () => {
    mocks.claimRewardRecipient
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    const result = await trigger()
    expect(result.sent).toBe(2)
    expect(mocks.integrationAdd).toHaveBeenCalledTimes(2)
  })

  test("a resumed run sends only the winners not recorded yet", async () => {
    mocks.claimRewards.mockResolvedValue({
      recipients: { "7": "sent", "8": "pending" },
      previouslyTriggered: true,
    })
    const result = await trigger()
    expect(result.sent).toBe(1)
    expect(mocks.claimRewardRecipient).toHaveBeenCalledWith({
      id: "100",
      contactId: "9",
    })
  })

  test("refuses once every winner is recorded", async () => {
    mocks.claimRewards.mockResolvedValue({
      recipients: { "7": "sent", "8": "sent", "9": "skipped" },
      previouslyTriggered: true,
    })
    await expect(trigger()).rejects.toMatchObject({
      code: "leaderboardRewardsAlreadySent",
    })
    expect(mocks.integrationAdd).not.toHaveBeenCalled()
  })

  test("a first run with no winners is not an error", async () => {
    mocks.top.mockResolvedValue([])
    await expect(trigger()).resolves.toMatchObject({ sent: 0 })
  })

  test("a winner without a conversation is recorded as skipped", async () => {
    mocks.findDMByContact.mockResolvedValueOnce(undefined)
    const result = await trigger()
    expect(result.skipped).toEqual(["7"])
    expect(mocks.setRewardRecipient).toHaveBeenCalledWith({
      id: "100",
      contactId: "7",
      delivery: "skipped",
    })
  })

  test("a failed queue releases the claim and schedules a background retry", async () => {
    mocks.integrationAdd
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValue(undefined)
    const result = await trigger(true)
    expect(result.failed).toEqual(["7"])
    expect(mocks.setRewardRecipient).toHaveBeenCalledWith({
      id: "100",
      contactId: "7",
      delivery: null,
    })
    expect(mocks.leaderboardAdd).toHaveBeenCalledWith(
      "triggerRewards",
      expect.objectContaining({
        data: { workspaceId: "1", leaderboardId: "100" },
      }),
      expect.objectContaining({ jobId: "lb-rewards-retry-100" }),
    )
  })

  test("the background job itself does not queue another retry", async () => {
    mocks.integrationAdd.mockRejectedValueOnce(new Error("redis down"))
    await trigger(false)
    expect(mocks.leaderboardAdd).not.toHaveBeenCalled()
  })

  test("refuses a leaderboard that is not finished", async () => {
    mocks.findByIdAndWorkspace.mockResolvedValue({
      ...finishedLeaderboard,
      status: "active",
    })
    await expect(trigger()).rejects.toMatchObject({
      code: "leaderboardNotFinished",
    })
    expect(mocks.claimRewards).not.toHaveBeenCalled()
  })
})
