import { beforeEach, describe, expect, test, vi } from "vitest"

const campaignRepo = {
  findById: vi.fn(),
  findForWorkspace: vi.fn(),
  transition: vi.fn(),
  incrementDaySent: vi.fn(),
  setFirstSentAt: vi.fn(),
}
const recipientRepo = {
  insertMany: vi.fn(),
  countOutcomes: vi.fn(),
  listDue: vi.fn(),
  update: vi.fn(),
  settleSend: vi.fn(),
  failRemaining: vi.fn(),
  claimForSend: vi.fn(),
  failStaleUnconfirmed: vi.fn(),
}
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageRepository: campaignRepo,
  facebookMarketingMessageRecipientRepository: recipientRepo,
  facebookMarketingMessageAudienceRepository: { findForWorkspace: vi.fn() },
}))
const tx = { tx: true }
vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))

const mm = {
  findAuth: vi.fn(),
  decryptAuth: vi.fn(),
  markAuthInvalid: vi.fn(),
}
vi.mock("../src/facebook-marketing-messages/service", () => ({
  facebookMarketingMessagesService: mm,
}))
const messenger = { findByPageId: vi.fn() }
vi.mock("../src/integration-messenger", () => ({
  messengerIntegrationService: messenger,
}))
const usage = vi.fn()
vi.mock("../src/facebook-marketing-message-delivery/usage", () => ({
  recordMarketingMessageUsage: usage,
}))
const setIfAbsent = vi.fn()
vi.mock("@chatbotx.io/redis", () => ({ casStore: { setIfAbsent } }))

const ads = {
  getMessageCampaignSchedule: vi.fn(),
  getAdAccountDetails: vi.fn(),
  listNotificationMessageTokens: vi.fn(),
  getMessageDeliveryEstimate: vi.fn(),
  sendMarketingMessage: vi.fn(),
}
vi.mock("@chatbotx.io/integration-facebook-ads", async () => {
  const real = await vi.importActual<
    typeof import("@chatbotx.io/integration-facebook-ads")
  >("@chatbotx.io/integration-facebook-ads")
  return {
    ...ads,
    classifyMarketingMessageError: real.classifyMarketingMessageError,
    GRAPH_ERROR_CODE_INVALID_TOKEN: real.GRAPH_ERROR_CODE_INVALID_TOKEN,
    isGraphTransportError: () => false,
    getGraphErrorCode: () => undefined,
  }
})

const { facebookMarketingMessageDeliveryService: service } = await import(
  "../src/facebook-marketing-message-delivery/service"
)

const baseCampaign = {
  id: "c1",
  workspaceId: "w1",
  pageId: "p1",
  adAccountId: "act_1",
  campaignId: "meta1",
  budgetType: "lifetime",
  status: "sending",
  content: { templateType: "text", text: "hi", quickReplies: [] },
  metaEndsAt: null,
  timezoneName: "Asia/Ho_Chi_Minh",
  dayTarget: null,
  daySent: 0,
}
const rec = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  subscriptionToken: `tok-${id}`,
  attempts: 0,
  nextEligibleAt: null,
  ...extra,
})
const metaErr = (code: number) => ({
  ok: false,
  kind: "meta",
  code,
  subcode: null,
  message: `err ${code}`,
})
const input = (over: Record<string, unknown> = {}) => ({
  campaignRowId: "c1",
  remainingQuota: async () => null,
  isWorkspaceBlocked: async () => false,
  ...over,
})
const patches = () =>
  campaignRepo.transition.mock.calls.map(
    ([a]) => a as { from: string[]; patch: Record<string, unknown> },
  )
const updates = () => recipientRepo.update.mock.calls.map(([a]) => a)
const settles = () => recipientRepo.settleSend.mock.calls.map(([a]) => a)

let campaign: Record<string, unknown>
beforeEach(() => {
  vi.resetAllMocks()
  campaign = { ...baseCampaign }
  campaignRepo.findById.mockImplementation(async () => campaign)
  campaignRepo.transition.mockImplementation(
    async ({ patch }: { patch: object }) => ({ ...campaign, ...patch }),
  )
  mm.findAuth.mockResolvedValue({ status: "active" })
  mm.decryptAuth.mockResolvedValue({ accessToken: "GRANT" })
  messenger.findByPageId.mockResolvedValue({
    auth: { tokens: { accessToken: "PAGE" }, metadata: { version: "v25.0" } },
  })
  recipientRepo.failRemaining.mockResolvedValue(3)
  // The claimed row as the DB returns it: attempts already incremented.
  recipientRepo.claimForSend.mockImplementation(
    async ({ id }: { id: string }) => {
      const due = ((await recipientRepo.listDue.mock.results.at(-1)?.value) ??
        []) as { id: string; attempts: number }[]
      const row = due.find((r) => r.id === id)
      return { ...row, id, attempts: (row?.attempts ?? 0) + 1 }
    },
  )
  recipientRepo.failStaleUnconfirmed.mockResolvedValue(1)
  recipientRepo.countOutcomes.mockResolvedValue({
    pending: 1,
    unconfirmed: 0,
  })
  setIfAbsent.mockResolvedValue(true)
})

describe("claimDispatchWindow", () => {
  test("claims via casStore and fails open on redis error", async () => {
    expect(await service.claimDispatchWindow("c1")).toBe(true)
    expect(setIfAbsent).toHaveBeenCalledWith(
      "mm:c1:dispatch-window",
      true,
      55_000,
    )
    setIfAbsent.mockRejectedValue(new Error("down"))
    expect(await service.claimDispatchWindow("c1")).toBe(true)
  })
})

describe("dispatchBatch", () => {
  test("sends each due recipient and stores trackingId", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage
      .mockResolvedValueOnce({ ok: true, trackingId: "t1" })
      .mockResolvedValueOnce({ ok: true, trackingId: "t2" })
    const res = await service.dispatchBatch(input())
    expect(res).toEqual({ sent: 2, outcome: "continue" })
    expect(settles()[0]).toMatchObject({
      id: "r1",
      status: "sent",
      trackingId: "t1",
    })
    expect(recipientRepo.claimForSend).toHaveBeenCalledTimes(2)
    expect(ads.sendMarketingMessage.mock.calls[0][0]).toMatchObject({
      accessToken: "GRANT",
      adAccountId: "act_1",
      campaignId: "meta1",
      subscriptionToken: "tok-r1",
      version: "v25.0",
    })
    expect(campaignRepo.setFirstSentAt).toHaveBeenCalledWith("c1")
    expect(campaignRepo.incrementDaySent).toHaveBeenCalledWith({
      id: "c1",
      by: 2,
    })
    expect(usage).toHaveBeenCalledWith({ workspaceId: "w1", count: 2 })
  })

  test("2300054 mid-batch stops, leaves rest pending, sets waitingNextDay at next local midnight", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"))
    try {
      campaign = { ...baseCampaign, budgetType: "daily", dayTarget: 10 }
      recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2"), rec("r3")])
      ads.sendMarketingMessage
        .mockResolvedValueOnce({ ok: true, trackingId: "t1" })
        .mockResolvedValueOnce(metaErr(2_300_054))
      const res = await service.dispatchBatch(input())
      expect(res).toEqual({ sent: 1, outcome: "dayDone" })
      expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(2)
      expect(settles().map((u) => u.id)).toEqual(["r1"])
      expect(updates().map((u) => u.id)).toEqual(["r2"])
      expect(updates()[0]).toMatchObject({
        id: "r2",
        status: "pending",
        attempts: 0,
        sentAt: null,
      })
      const last = patches().at(-1)
      expect(last?.from).toEqual(["sending"])
      expect(last?.patch).toMatchObject({
        status: "waitingNextDay",
        nextDayAt: new Date("2026-10-18T17:00:00.000Z"),
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test("uncertain result marks unconfirmed and never re-sends it", async () => {
    recipientRepo.listDue.mockResolvedValueOnce([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValueOnce({
      ok: false,
      kind: "uncertain",
      message: "timeout",
    })
    const res = await service.dispatchBatch(input())
    expect(res.sent).toBe(1)
    expect(settles()[0]).toMatchObject({
      id: "r1",
      errorMessage: "timeout",
      errorSource: "send",
    })
    expect(settles()[0].status).toBeUndefined()
    expect(usage).toHaveBeenCalledWith({ workspaceId: "w1", count: 1 })
    // the row is unconfirmed, so listDue (status = pending) returns nothing
    recipientRepo.listDue.mockResolvedValueOnce([])
    await service.dispatchBatch(input())
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
  })

  test("recipientTiming retries once at nextEligibleAt then fails on the second error", async () => {
    const eligible = new Date(Date.now() + 60 * 60 * 1000)
    recipientRepo.listDue.mockResolvedValueOnce([
      rec("r1", { nextEligibleAt: eligible }),
    ])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_035))
    await service.dispatchBatch(input())
    expect(updates()[0]).toMatchObject({
      id: "r1",
      status: "pending",
      attempts: 1,
      nextAttemptAt: eligible,
      errorCode: 2_300_035,
      errorSource: "send",
    })

    recipientRepo.update.mockClear()
    recipientRepo.listDue.mockResolvedValueOnce([rec("r1", { attempts: 1 })])
    await service.dispatchBatch(input())
    expect(updates()[0]).toMatchObject({
      id: "r1",
      status: "failed",
      errorCode: 2_300_035,
      errorSource: "send",
    })
    expect(usage).not.toHaveBeenCalled()
  })

  test("recipientTiming with a past nextEligibleAt retries after the retry delay", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"))
    try {
      recipientRepo.listDue.mockResolvedValueOnce([
        rec("r1", { nextEligibleAt: new Date("2026-10-18T04:00:00Z") }),
      ])
      ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_035))
      await service.dispatchBatch(input())
      expect(updates()[0]).toMatchObject({
        id: "r1",
        status: "pending",
        // now + MM_RETRY_DELAY_MS (12h), not the stale snapshot time
        nextAttemptAt: new Date("2026-10-18T22:00:00Z"),
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test("contentInvalid fails remaining recipients and the campaign with contentRejected", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_010))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("ended")
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
    expect(recipientRepo.failRemaining).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignRowId: "c1",
        statuses: ["pending"],
        errorCode: 2_300_010,
        errorSource: "send",
      }),
      tx,
    )
    // unconfirmed rows may still be delivered: fail them as outcomeUnknown so
    // a late echo can promote them
    expect(recipientRepo.failRemaining).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignRowId: "c1",
        statuses: ["unconfirmed"],
        errorCode: null,
        errorMessage: "outcomeUnknown",
      }),
      tx,
    )
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "contentRejected",
    })
  })

  test("2300053 completes with lifetimeBudgetReached", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_053))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("ended")
    expect(recipientRepo.failRemaining).toHaveBeenCalled()
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "completed",
      statusReason: "lifetimeBudgetReached",
    })
  })

  test("campaign blocker 2300011 pauses with metaBlocker and code", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_011))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("paused")
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "metaBlocker",
      statusErrorCode: 2_300_011,
    })
    expect(mm.markAuthInvalid).not.toHaveBeenCalled()
  })

  test("190 pauses grantInvalid path and marks auth invalid", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(190))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("paused")
    expect(mm.markAuthInvalid).toHaveBeenCalledWith("w1")
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "grantInvalid",
      statusErrorCode: 190,
    })
  })

  test("campaignInactive past metaEndsAt completes campaignEnded, else pauses", async () => {
    campaign = { ...baseCampaign, metaEndsAt: new Date(Date.now() - 1000) }
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_000))
    expect((await service.dispatchBatch(input())).outcome).toBe("ended")
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "completed",
      statusReason: "campaignEnded",
    })
    campaign = { ...baseCampaign }
    campaignRepo.transition.mockClear()
    expect((await service.dispatchBatch(input())).outcome).toBe("paused")
    expect(patches().at(-1)?.patch).toMatchObject({
      statusReason: "metaBlocker",
    })
  })

  test("notReady and transient stop the batch without touching recipients", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_078))
    const res = await service.dispatchBatch(input())
    expect(res).toEqual({ sent: 0, outcome: "continue" })
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
    expect(updates()).toEqual([
      { id: "r1", status: "pending", attempts: 0, sentAt: null },
    ])
  })

  test("recipientPermanent fails only that recipient and continues", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage
      .mockResolvedValueOnce(metaErr(2_300_004))
      .mockResolvedValueOnce({ ok: true, trackingId: "t2" })
    const res = await service.dispatchBatch(input())
    expect(res.sent).toBe(1)
    expect(updates()[0]).toMatchObject({
      id: "r1",
      status: "failed",
      errorSource: "send",
    })
  })

  test("quota reached pauses before any send", async () => {
    const res = await service.dispatchBatch(
      input({ remainingQuota: async () => 0 }),
    )
    expect(res).toEqual({ sent: 0, outcome: "paused" })
    expect(ads.sendMarketingMessage).not.toHaveBeenCalled()
    expect(patches().at(-1)?.patch).toMatchObject({
      statusReason: "quotaReached",
    })
  })

  test("a batch never sends more than the remaining quota", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2"), rec("r3")])
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    await service.dispatchBatch(input({ remainingQuota: async () => 3 }))
    expect(recipientRepo.listDue.mock.calls[0][0].limit).toBe(3)

    campaign = {
      ...baseCampaign,
      budgetType: "daily",
      dayTarget: 5,
      daySent: 3,
    }
    await service.dispatchBatch(input({ remainingQuota: async () => 1 }))
    expect(recipientRepo.listDue.mock.calls[1][0].limit).toBe(1)
  })

  test("blocked workspace pauses before any send", async () => {
    const res = await service.dispatchBatch(
      input({ isWorkspaceBlocked: async () => true }),
    )
    expect(res.outcome).toBe("paused")
    expect(patches().at(-1)?.patch).toMatchObject({
      statusReason: "workspaceBlocked",
    })
    expect(ads.sendMarketingMessage).not.toHaveBeenCalled()
  })

  test("daily dispatch never exceeds dayTarget - daySent", async () => {
    campaign = {
      ...baseCampaign,
      budgetType: "daily",
      dayTarget: 5,
      daySent: 3,
    }
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    await service.dispatchBatch(input())
    expect(recipientRepo.listDue.mock.calls[0][0].limit).toBe(2)
    campaign = {
      ...baseCampaign,
      budgetType: "daily",
      dayTarget: 4,
      daySent: 3,
    }
    await service.dispatchBatch(input())
    expect(recipientRepo.listDue.mock.calls[1][0].limit).toBe(1)
  })

  test("daily limit exhausted returns dayDone only while pending remain", async () => {
    campaign = {
      ...baseCampaign,
      budgetType: "daily",
      dayTarget: 3,
      daySent: 3,
    }
    const res = await service.dispatchBatch(input())
    expect(res).toEqual({ sent: 0, outcome: "dayDone" })
    expect(ads.sendMarketingMessage).not.toHaveBeenCalled()
    expect(patches().at(-1)?.patch.status).toBe("waitingNextDay")

    campaignRepo.transition.mockClear()
    recipientRepo.countOutcomes.mockResolvedValue({
      pending: 0,
      unconfirmed: 0,
    })
    const done = await service.dispatchBatch(input())
    expect(done.outcome).toBe("continue")
    expect(campaignRepo.transition).not.toHaveBeenCalled()
  })

  test("records usage for ok and uncertain sends only", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2"), rec("r3")])
    ads.sendMarketingMessage
      .mockResolvedValueOnce({ ok: true, trackingId: "t1" })
      .mockResolvedValueOnce({ ok: false, kind: "uncertain", message: "x" })
      .mockResolvedValueOnce(metaErr(2_300_004))
    await service.dispatchBatch(input())
    expect(usage).toHaveBeenCalledWith({ workspaceId: "w1", count: 2 })
    expect(campaignRepo.incrementDaySent).toHaveBeenCalledWith({
      id: "c1",
      by: 2,
    })
  })

  test("a claim that returns nothing skips the recipient without sending", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    recipientRepo.claimForSend
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "r2" })
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    const res = await service.dispatchBatch(input())
    expect(res.sent).toBe(1)
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
    expect(ads.sendMarketingMessage.mock.calls[0][0].subscriptionToken).toBe(
      "tok-r2",
    )
  })

  test("a DB failure after an ok send leaves the row claimed (unconfirmed), never reverted", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    recipientRepo.settleSend.mockRejectedValue(new Error("db down"))
    await expect(service.dispatchBatch(input())).rejects.toThrow("db down")
    expect(recipientRepo.claimForSend.mock.invocationCallOrder[0]).toBeLessThan(
      ads.sendMarketingMessage.mock.invocationCallOrder[0],
    )
    expect(updates().some((u) => u.status === "pending")).toBe(false)
    // the send still counts for daySent and usage
    expect(campaignRepo.incrementDaySent).toHaveBeenCalledWith({
      id: "c1",
      by: 1,
    })
  })

  test("lifetime campaign hitting 2300054 pauses with metaBlocker", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_054))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("paused")
    expect(updates()[0]).toMatchObject({
      status: "pending",
      attempts: 0,
      sentAt: null,
    })
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "metaBlocker",
      statusErrorCode: 2_300_054,
    })
  })

  test("F1: stops calling Meta once the batch has run for 45s", async () => {
    vi.useFakeTimers()
    try {
      recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2"), rec("r3")])
      ads.sendMarketingMessage.mockImplementation(() => {
        vi.advanceTimersByTime(46_000)
        return Promise.resolve({ ok: true, trackingId: "t" })
      })
      const res = await service.dispatchBatch(input())
      expect(res).toEqual({ sent: 1, outcome: "continue" })
      expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
      expect(recipientRepo.claimForSend).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("F2: a refused claim on a campaign that left sending stops the batch", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2"), rec("r3")])
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    recipientRepo.claimForSend
      .mockResolvedValueOnce({ id: "r1", attempts: 1 })
      .mockResolvedValueOnce(null)
    campaignRepo.findById
      .mockResolvedValueOnce(campaign)
      .mockResolvedValue({ ...campaign, status: "stopped" })
    const res = await service.dispatchBatch(input())
    expect(res.sent).toBe(1)
    expect(recipientRepo.claimForSend).toHaveBeenCalledTimes(2)
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
  })

  test("F2: pre-claim attempts come from the claimed row, not the stale listDue row", async () => {
    // listDue saw attempts 0, but the row was retried since: the claim says 2.
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    recipientRepo.claimForSend.mockResolvedValue({ id: "r1", attempts: 2 })
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_035))
    await service.dispatchBatch(input())
    expect(updates()[0]).toMatchObject({ id: "r1", status: "failed" })

    recipientRepo.update.mockClear()
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_078))
    await service.dispatchBatch(input())
    expect(updates()[0]).toMatchObject({
      id: "r1",
      status: "pending",
      attempts: 1,
    })
  })

  test("F3: firstSentAt is set before the first Meta call of the batch", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_078))
    await service.dispatchBatch(input())
    expect(campaignRepo.setFirstSentAt).toHaveBeenCalledTimes(1)
    expect(
      campaignRepo.setFirstSentAt.mock.invocationCallOrder[0],
    ).toBeLessThan(ads.sendMarketingMessage.mock.invocationCallOrder[0])
  })

  test("F3: firstSentAt is not rewritten once set", async () => {
    campaign = { ...baseCampaign, firstSentAt: new Date() }
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    await service.dispatchBatch(input())
    expect(campaignRepo.setFirstSentAt).not.toHaveBeenCalled()
  })

  test("F4: 5 consecutive unknown errors with the same code pause the campaign", async () => {
    recipientRepo.listDue.mockResolvedValue(
      ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => rec(id)),
    )
    ads.sendMarketingMessage.mockResolvedValue(metaErr(999))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("paused")
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(5)
    expect(updates().filter((u) => u.status === "failed")).toHaveLength(4)
    expect(updates().at(-1)).toMatchObject({
      id: "r5",
      status: "pending",
      attempts: 0,
      sentAt: null,
    })
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "metaBlocker",
      statusErrorCode: 999,
    })
  })

  test("F4: unknown errors with different codes do not trip the breaker", async () => {
    recipientRepo.listDue.mockResolvedValue(
      ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => rec(id)),
    )
    ads.sendMarketingMessage
      .mockResolvedValueOnce(metaErr(991))
      .mockResolvedValueOnce(metaErr(991))
      .mockResolvedValueOnce(metaErr(991))
      .mockResolvedValueOnce(metaErr(991))
      .mockResolvedValueOnce(metaErr(992))
      .mockResolvedValueOnce(metaErr(991))
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("continue")
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(6)
  })

  test("F4: a code-less HTTP 429 is transient (reverted, batch stops)", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue({
      ok: false,
      kind: "meta",
      code: null,
      subcode: null,
      httpStatus: 429,
      message: "HTTP 429",
    })
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("continue")
    expect(ads.sendMarketingMessage).toHaveBeenCalledTimes(1)
    expect(updates()).toEqual([
      { id: "r1", status: "pending", attempts: 0, sentAt: null },
    ])
  })

  test("F6: a transient send error is shown on the campaign without changing its status", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_078))
    await service.dispatchBatch(input())
    const last = patches().at(-1)
    expect(last?.from).toEqual(["scheduled", "sending", "waitingNextDay"])
    expect(last?.patch).toEqual({
      statusErrorCode: 2_300_078,
      statusErrorMessage: "err 2300078",
    })
  })

  test("F6: the next successful send clears the warning", async () => {
    campaign = {
      ...baseCampaign,
      statusErrorCode: 2_300_078,
      statusErrorMessage: "err",
    }
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue({ ok: true, trackingId: "t" })
    await service.dispatchBatch(input())
    expect(patches().at(-1)?.patch).toEqual({
      statusErrorCode: null,
      statusErrorMessage: null,
    })
  })

  test("ending runs status-first in one transaction", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_053))
    await service.dispatchBatch(input())
    const end = campaignRepo.transition.mock.calls.at(-1)
    expect(end?.[0]).toMatchObject({ from: ["sending"] })
    expect(end?.[1]).toBe(tx)
    for (const call of recipientRepo.failRemaining.mock.calls) {
      expect(call[1]).toBe(tx)
    }
    expect(
      campaignRepo.transition.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(
      Math.min(...recipientRepo.failRemaining.mock.invocationCallOrder),
    )
  })

  test("a Stop/Pause that wins the race leaves recipients untouched", async () => {
    recipientRepo.listDue.mockResolvedValue([rec("r1"), rec("r2")])
    ads.sendMarketingMessage.mockResolvedValue(metaErr(2_300_053))
    // The campaign left `sending` before the end transition ran.
    campaignRepo.transition.mockImplementation(
      async ({ patch }: { patch: { status?: string } }) =>
        patch.status === "completed" ? null : { ...campaign, ...patch },
    )
    await service.dispatchBatch(input())
    expect(patches().at(-1)?.patch).toMatchObject({ status: "completed" })
    expect(recipientRepo.failRemaining).not.toHaveBeenCalled()
  })

  test("M3: unparseable stored content fails the campaign instead of looping", async () => {
    campaign = { ...baseCampaign, content: { templateType: "nope" } }
    recipientRepo.listDue.mockResolvedValue([rec("r1")])
    const res = await service.dispatchBatch(input())
    expect(res.outcome).toBe("ended")
    expect(ads.sendMarketingMessage).not.toHaveBeenCalled()
    expect(patches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "contentRejected",
    })
  })

  test("does nothing unless the campaign is sending", async () => {
    campaign = { ...baseCampaign, status: "paused" }
    const res = await service.dispatchBatch(input())
    expect(res).toEqual({ sent: 0, outcome: "continue" })
    expect(recipientRepo.listDue).not.toHaveBeenCalled()
  })
})

describe("finalize", () => {
  const counts = (over: Record<string, unknown>) =>
    recipientRepo.countOutcomes.mockResolvedValue({
      pending: 0,
      unconfirmed: 0,
      ...over,
    })

  test("completes when nothing is pending or unconfirmed", async () => {
    counts({})
    await service.finalize("c1")
    expect(patches().at(-1)?.patch).toMatchObject({ status: "completed" })
    expect(patches().at(-1)?.patch.completedAt).toBeInstanceOf(Date)
  })

  test("waits while unconfirmed is fresh, completes after the stale ones fail", async () => {
    counts({ unconfirmed: 2 })
    await service.finalize("c1")
    expect(campaignRepo.transition).not.toHaveBeenCalled()
    expect(recipientRepo.failRemaining).not.toHaveBeenCalled()

    recipientRepo.countOutcomes
      .mockResolvedValueOnce({
        pending: 0,
        unconfirmed: 2,
      })
      .mockResolvedValueOnce({
        pending: 0,
        unconfirmed: 0,
      })
    await service.finalize("c1")
    const arg = recipientRepo.failStaleUnconfirmed.mock.calls[0][0]
    expect(arg.campaignRowId).toBe("c1")
    expect(Date.now() - arg.olderThan.getTime()).toBeGreaterThanOrEqual(
      60 * 60 * 1000,
    )
    expect(patches().at(-1)?.patch).toMatchObject({ status: "completed" })
  })

  test("one stale + one fresh unconfirmed: only the stale fails and the campaign does not complete", async () => {
    recipientRepo.countOutcomes
      .mockResolvedValueOnce({
        pending: 0,
        unconfirmed: 2,
      })
      .mockResolvedValueOnce({
        pending: 0,
        unconfirmed: 1,
      })
    await service.finalize("c1")
    expect(recipientRepo.failStaleUnconfirmed).toHaveBeenCalledTimes(1)
    expect(recipientRepo.failRemaining).not.toHaveBeenCalled()
    expect(campaignRepo.transition).not.toHaveBeenCalled()
  })

  test("finalize does not complete while a retry is scheduled", async () => {
    counts({ pending: 1 })
    await service.finalize("c1")
    expect(campaignRepo.transition).not.toHaveBeenCalled()
  })
})
