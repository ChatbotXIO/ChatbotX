import { beforeEach, describe, expect, test, vi } from "vitest"

const listDueToStart = vi.fn()
const listByStatus = vi.fn()
const findById = vi.fn()
const prepare = vi.fn()
const startDay = vi.fn()
const claimDispatchWindow = vi.fn()
const dispatchBatch = vi.fn()
const finalize = vi.fn()
const pause = vi.fn()
const scheduleAddSpy = vi.fn()
const mmAddSpy = vi.fn()
const isBlockedWorkspace = vi.fn()
const getBotMessageQuotaRemaining = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  facebookMarketingMessageDeliveryService: {
    prepare: (...a: unknown[]) => prepare(...a),
    startDay: (...a: unknown[]) => startDay(...a),
    claimDispatchWindow: (...a: unknown[]) => claimDispatchWindow(...a),
    dispatchBatch: (...a: unknown[]) => dispatchBatch(...a),
    finalize: (...a: unknown[]) => finalize(...a),
    pause: (...a: unknown[]) => pause(...a),
  },
  withBlockedOwnerGuard: (_ws: unknown, fn: () => Promise<unknown>) => fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageRepository: {
    listDueToStart: (...a: unknown[]) => listDueToStart(...a),
    listByStatus: (...a: unknown[]) => listByStatus(...a),
    findById: (...a: unknown[]) => findById(...a),
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (opts: { fn: () => Promise<unknown> }) => opts.fn(),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  marketingMessageCampaignJobId: (id: string, step: string) =>
    `mm-campaign-${step}-${id}`,
  MarketingMessageJobAction: { processCampaign: "processCampaign" },
  marketingMessageQueue: { add: (...a: unknown[]) => mmAddSpy(...a) },
  scheduleQueue: { add: (...a: unknown[]) => scheduleAddSpy(...a) },
}))
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: (...a: unknown[]) => isBlockedWorkspace(...a),
}))
vi.mock("../src/lib/is-bot-message-quota-reached", () => ({
  getBotMessageQuotaRemaining: (...a: unknown[]) =>
    getBotMessageQuotaRemaining(...a),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { enqueueMarketingMessages } = await import(
  "../src/schedule/handlers/enqueue-marketing-messages"
)
const { dispatchMarketingMessages } = await import(
  "../src/schedule/handlers/dispatch-marketing-messages"
)
const { finalizeMarketingMessages } = await import(
  "../src/schedule/handlers/finalize-marketing-messages"
)
const { processMarketingMessageCampaign } = await import(
  "../src/schedule/handlers/process-marketing-message-campaign"
)

const opts = (jobId: string) => ({
  jobId,
  attempts: 1,
  removeOnComplete: true,
  removeOnFail: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  scheduleAddSpy.mockResolvedValue(undefined)
  mmAddSpy.mockResolvedValue(undefined)
  isBlockedWorkspace.mockResolvedValue(false)
  getBotMessageQuotaRemaining.mockResolvedValue(null)
  findById.mockResolvedValue({ id: "c1", workspaceId: "w1" })
  claimDispatchWindow.mockResolvedValue(true)
  dispatchBatch.mockResolvedValue({ sent: 0, outcome: "continue" })
})

describe("marketing message crons", () => {
  test("enqueue adds prepare for scheduled and startDay for waitingNextDay with deterministic job ids", async () => {
    listDueToStart.mockResolvedValue([
      { id: "a", status: "scheduled" },
      { id: "b", status: "waitingNextDay" },
    ])
    await enqueueMarketingMessages()
    expect(mmAddSpy).toHaveBeenNthCalledWith(
      1,
      "processCampaign",
      {
        type: "processCampaign",
        data: { campaignRowId: "a", step: "prepare" },
      },
      opts("mm-campaign-prepare-a"),
    )
    expect(mmAddSpy).toHaveBeenNthCalledWith(
      2,
      "processCampaign",
      {
        type: "processCampaign",
        data: { campaignRowId: "b", step: "startDay" },
      },
      opts("mm-campaign-startDay-b"),
    )
  })

  test("crons enqueue on the dedicated marketing message queue, never the shared schedule queue", async () => {
    listDueToStart.mockResolvedValue([{ id: "a", status: "scheduled" }])
    listByStatus.mockResolvedValue([{ id: "b" }])
    await enqueueMarketingMessages()
    await dispatchMarketingMessages()
    expect(mmAddSpy).toHaveBeenCalledTimes(2)
    expect(scheduleAddSpy).not.toHaveBeenCalled()
  })

  test("enqueue keeps going when one add throws", async () => {
    listDueToStart.mockResolvedValue([
      { id: "a", status: "scheduled" },
      { id: "b", status: "scheduled" },
    ])
    mmAddSpy.mockRejectedValueOnce(new Error("boom"))
    await enqueueMarketingMessages()
    expect(mmAddSpy).toHaveBeenCalledTimes(2)
  })

  test("dispatch cron enqueues one dispatch job per sending campaign", async () => {
    listByStatus.mockResolvedValue([{ id: "a" }, { id: "b" }])
    await dispatchMarketingMessages()
    expect(listByStatus).toHaveBeenCalledWith("sending")
    expect(mmAddSpy).toHaveBeenCalledTimes(2)
    expect(mmAddSpy).toHaveBeenNthCalledWith(
      2,
      "processCampaign",
      {
        type: "processCampaign",
        data: { campaignRowId: "b", step: "dispatch" },
      },
      opts("mm-campaign-dispatch-b"),
    )
  })

  test("finalize calls service.finalize for each sending campaign and survives a throw", async () => {
    listByStatus.mockResolvedValue([{ id: "a" }, { id: "b" }])
    finalize.mockRejectedValueOnce(new Error("boom"))
    await finalizeMarketingMessages()
    expect(finalize).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenNthCalledWith(1, "a")
    expect(finalize).toHaveBeenNthCalledWith(2, "b")
  })
})

describe("processMarketingMessageCampaign", () => {
  test("dispatch pauses workspaceBlocked when owner is blocked and does not send", async () => {
    isBlockedWorkspace.mockResolvedValue(true)
    await processMarketingMessageCampaign({
      campaignRowId: "c1",
      step: "dispatch",
    })
    expect(pause).toHaveBeenCalledWith({
      id: "c1",
      reason: "workspaceBlocked",
    })
    expect(claimDispatchWindow).not.toHaveBeenCalled()
    expect(dispatchBatch).not.toHaveBeenCalled()
  })

  test.each([
    "prepare",
    "startDay",
  ] as const)("%s pauses when blocked and makes no Meta calls", async (step) => {
    isBlockedWorkspace.mockResolvedValue(true)
    await processMarketingMessageCampaign({ campaignRowId: "c1", step })
    expect(pause).toHaveBeenCalledTimes(1)
    expect(prepare).not.toHaveBeenCalled()
    expect(startDay).not.toHaveBeenCalled()
  })

  test("dispatch skips when the dispatch window is already claimed", async () => {
    claimDispatchWindow.mockResolvedValue(false)
    await processMarketingMessageCampaign({
      campaignRowId: "c1",
      step: "dispatch",
    })
    expect(dispatchBatch).not.toHaveBeenCalled()
  })

  test("dispatch runs a batch with quota and blocked callbacks", async () => {
    await processMarketingMessageCampaign({
      campaignRowId: "c1",
      step: "dispatch",
    })
    const [arg] = dispatchBatch.mock.calls[0] as [
      {
        campaignRowId: string
        remainingQuota: () => Promise<number | null>
        isWorkspaceBlocked: () => Promise<boolean>
      },
    ]
    expect(arg.campaignRowId).toBe("c1")
    await arg.remainingQuota()
    await arg.isWorkspaceBlocked()
    expect(getBotMessageQuotaRemaining).toHaveBeenCalledWith("w1")
  })

  test("prepare and startDay route to the service", async () => {
    await processMarketingMessageCampaign({
      campaignRowId: "c1",
      step: "prepare",
    })
    await processMarketingMessageCampaign({
      campaignRowId: "c1",
      step: "startDay",
    })
    expect(prepare).toHaveBeenCalledWith("c1")
    expect(startDay).toHaveBeenCalledWith("c1")
  })

  test("missing campaign row returns quietly", async () => {
    findById.mockResolvedValue(undefined)
    await processMarketingMessageCampaign({
      campaignRowId: "x",
      step: "prepare",
    })
    expect(prepare).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
  })
})
