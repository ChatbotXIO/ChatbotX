import { beforeEach, describe, expect, test, vi } from "vitest"

const campaignRepo = {
  findById: vi.fn(),
  findForWorkspace: vi.fn(),
  transition: vi.fn(),
}
const recipientRepo = { insertMany: vi.fn(), countOutcomes: vi.fn() }
const audienceRepo = { findForWorkspace: vi.fn() }

vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageRepository: campaignRepo,
  facebookMarketingMessageRecipientRepository: recipientRepo,
  facebookMarketingMessageAudienceRepository: audienceRepo,
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

class FakeGraphError extends Error {
  code: number | undefined
  network: boolean
  constructor(code?: number, network = false) {
    super(`graph ${code}`)
    this.code = code
    this.network = network
  }
}
const ads = {
  getMessageCampaignSchedule: vi.fn(),
  getAdAccountDetails: vi.fn(),
  listNotificationMessageTokens: vi.fn(),
  getMessageDeliveryEstimate: vi.fn(),
}
vi.mock("@chatbotx.io/integration-facebook-ads", async () => {
  const real = await vi.importActual<
    typeof import("@chatbotx.io/integration-facebook-ads")
  >("@chatbotx.io/integration-facebook-ads")
  return {
    ...ads,
    classifyMarketingMessageError: real.classifyMarketingMessageError,
    GRAPH_ERROR_CODE_INVALID_TOKEN: real.GRAPH_ERROR_CODE_INVALID_TOKEN,
    isGraphTransportError: (e: unknown) =>
      e instanceof FakeGraphError && e.network,
    getGraphErrorCode: (e: unknown) =>
      e instanceof FakeGraphError ? e.code : undefined,
  }
})

const { facebookMarketingMessageDeliveryService: service } = await import(
  "../src/facebook-marketing-message-delivery/service"
)

const baseCampaign = {
  id: "c1",
  workspaceId: "w1",
  name: "Promo",
  pageId: "p1",
  adAccountId: "act_1",
  campaignId: "meta1",
  budgetType: "lifetime",
  budgetMinorUnits: 1000,
  targetType: "optIn",
  audienceId: null,
  status: "scheduled",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  startsAt: new Date(Date.now() - 1000),
  tokenCount: null,
  metaEndsAt: null,
  nextDayAt: null,
  adSetId: null,
  resumeCount: 0,
}

const tok = (token: string, topicTitle: string | null) => ({
  token,
  topicTitle,
  psid: `psid-${token}`,
  nextEligibleAt: null,
  customAudienceIds: [],
})

beforeEach(() => {
  vi.resetAllMocks()
  campaignRepo.findById.mockResolvedValue({ ...baseCampaign })
  campaignRepo.transition.mockImplementation(
    async ({ patch }: { patch: object }) => ({ ...baseCampaign, ...patch }),
  )
  mm.findAuth.mockResolvedValue({ status: "active" })
  mm.decryptAuth.mockResolvedValue({ accessToken: "GRANT" })
  messenger.findByPageId.mockResolvedValue({
    auth: { tokens: { accessToken: "PAGE" }, metadata: { version: "v25.0" } },
  })
  ads.getMessageCampaignSchedule.mockResolvedValue({
    adSetId: "as1",
    endTime: null,
  })
  ads.getAdAccountDetails.mockResolvedValue({ timezoneName: "Asia/Saigon" })
  recipientRepo.insertMany.mockImplementation(
    async (rows: unknown[]) => rows.length,
  )
})

const transitionPatches = () =>
  campaignRepo.transition.mock.calls.map(
    ([arg]) => arg as { from: string[]; patch: Record<string, unknown> },
  )

describe("prepare", () => {
  test('filters opt-in tokens to "Updates and promotions" and inserts them', async () => {
    ads.listNotificationMessageTokens.mockResolvedValue([
      tok("a", "Updates and promotions"),
      tok("b", "Other"),
      tok("c", "Updates and promotions"),
    ])
    await service.prepare("c1")

    const rows = recipientRepo.insertMany.mock.calls[0][0]
    expect(
      rows.map((r: { subscriptionToken: string }) => r.subscriptionToken),
    ).toEqual(["a", "c"])
    expect(rows[0]).toMatchObject({
      psid: "psid-a",
      status: "pending",
      attempts: 0,
      campaignRowId: "c1",
    })
    const last = transitionPatches().at(-1)
    expect(last?.from).toEqual(["scheduled"])
    expect(last?.patch).toMatchObject({
      status: "sending",
      tokenCount: 2,
      adSetId: "as1",
      timezoneName: "Asia/Saigon",
    })
  })

  test("uses the audience customAudienceId for customAudience targets", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...baseCampaign,
      targetType: "customAudience",
      audienceId: "aud1",
    })
    audienceRepo.findForWorkspace.mockResolvedValue({
      customAudienceId: "ca-77",
    })
    ads.listNotificationMessageTokens.mockResolvedValue([tok("a", "Anything")])
    await service.prepare("c1")

    expect(ads.listNotificationMessageTokens).toHaveBeenCalledWith(
      expect.objectContaining({ customAudienceId: "ca-77", pageId: "p1" }),
    )
    expect(recipientRepo.insertMany).toHaveBeenCalledTimes(1)
  })

  test("fails with noMatchingTopic and lists seen titles", async () => {
    ads.listNotificationMessageTokens.mockResolvedValue([
      tok("a", "Cập nhật"),
      tok("b", "Khác"),
      tok("c", "Cập nhật"),
    ])
    await service.prepare("c1")

    expect(recipientRepo.insertMany).not.toHaveBeenCalled()
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "noMatchingTopic",
      statusErrorMessage: "Cập nhật, Khác",
    })
  })

  test("fails with noTokens when Meta returns none", async () => {
    ads.listNotificationMessageTokens.mockResolvedValue([])
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "noTokens",
    })
  })

  test("pauses pageNotConnected when no page token", async () => {
    messenger.findByPageId.mockResolvedValue(null)
    await service.prepare("c1")
    expect(ads.listNotificationMessageTokens).not.toHaveBeenCalled()
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "pageNotConnected",
    })
  })

  test("pauses grantInvalid when the grant is missing", async () => {
    mm.findAuth.mockResolvedValue(null)
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "grantInvalid",
    })
  })

  test("F6: token rate limit 2300080 keeps it scheduled, backs off 5 min and shows the error", async () => {
    ads.listNotificationMessageTokens.mockRejectedValue(
      new FakeGraphError(2_300_080),
    )
    const before = Date.now()
    await service.prepare("c1")
    expect(recipientRepo.insertMany).not.toHaveBeenCalled()
    const last = transitionPatches().at(-1)
    expect(last?.from).toEqual(["scheduled"])
    expect(last?.patch).not.toHaveProperty("status")
    expect(last?.patch).not.toHaveProperty("statusReason")
    expect(last?.patch).toMatchObject({
      statusErrorCode: 2_300_080,
      statusErrorMessage: "graph 2300080",
    })
    const nextDayAt = (last?.patch.nextDayAt as Date).getTime()
    expect(nextDayAt - before).toBeGreaterThanOrEqual(5 * 60 * 1000)
    expect(nextDayAt - before).toBeLessThan(5 * 60 * 1000 + 5000)
  })

  test("F6: does nothing while the retry backoff (nextDayAt) is in the future", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...baseCampaign,
      nextDayAt: new Date(Date.now() + 60_000),
    })
    await service.prepare("c1")
    expect(ads.listNotificationMessageTokens).not.toHaveBeenCalled()
  })

  test("F6: a successful snapshot clears the backoff and the warning", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...baseCampaign,
      nextDayAt: new Date(Date.now() - 1000),
      statusErrorMessage: "old",
    })
    ads.listNotificationMessageTokens.mockResolvedValue([
      tok("a", "Updates and promotions"),
    ])
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "sending",
      nextDayAt: null,
      statusErrorCode: null,
      statusErrorMessage: null,
    })
  })

  test("M5: a lifetime campaign without an ad set end_time ends 30 days after creation", async () => {
    ads.listNotificationMessageTokens.mockResolvedValue([
      tok("a", "Updates and promotions"),
    ])
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      metaEndsAt: new Date("2026-10-31T00:00:00Z"),
    })
  })

  test("M5: a daily campaign without end_time has no end date", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...baseCampaign,
      budgetType: "daily",
    })
    ads.listNotificationMessageTokens.mockResolvedValue([
      tok("a", "Updates and promotions"),
    ])
    await service.prepare("c1")
    expect(transitionPatches()[0]?.patch).toMatchObject({ metaEndsAt: null })
  })

  test("fails with tokenFetchFailed on a non-transient Graph error", async () => {
    ads.listNotificationMessageTokens.mockRejectedValue(new FakeGraphError(100))
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "tokenFetchFailed",
      statusErrorCode: 100,
    })
  })

  test("does nothing before startsAt", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...baseCampaign,
      startsAt: new Date(Date.now() + 60_000),
    })
    await service.prepare("c1")
    expect(ads.listNotificationMessageTokens).not.toHaveBeenCalled()
  })

  test("on a daily campaign sets dayTarget to min(upper bound, tokens)", async () => {
    const daily = { ...baseCampaign, budgetType: "daily" }
    campaignRepo.findById.mockResolvedValueOnce(daily).mockResolvedValue({
      ...daily,
      status: "sending",
      adSetId: "as1",
      tokenCount: 50,
    })
    campaignRepo.transition.mockImplementation(
      async ({ patch }: { patch: object }) => ({ ...daily, ...patch }),
    )
    ads.listNotificationMessageTokens.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) =>
        tok(`t${i}`, "Updates and promotions"),
      ),
    )
    ads.getMessageDeliveryEstimate.mockResolvedValue({
      deliveryLower: 100,
      deliveryUpper: 122,
    })
    recipientRepo.countOutcomes.mockResolvedValue({ pending: 50 })

    await service.prepare("c1")

    expect(ads.getMessageDeliveryEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountId: baseCampaign.adAccountId,
        pageId: baseCampaign.pageId,
        dailyBudgetMinorUnits: 1000,
      }),
    )
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "sending",
      dayTarget: 50,
      daySent: 0,
    })
  })
})

describe("prepare retry bounds and dedupe", () => {
  test("a code-less non-network error fails with tokenFetchFailed", async () => {
    ads.listNotificationMessageTokens.mockRejectedValue(new FakeGraphError())
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "tokenFetchFailed",
    })
  })

  test("a network error before the retry window stays scheduled", async () => {
    ads.listNotificationMessageTokens.mockRejectedValue(
      new FakeGraphError(undefined, true),
    )
    await service.prepare("c1")
    const last = transitionPatches().at(-1)
    expect(last?.from).toEqual(["scheduled"])
    expect(last?.patch).not.toHaveProperty("status")
    expect(last?.patch.nextDayAt).toBeInstanceOf(Date)
  })

  test("a retryable error after startsAt + 24h fails with tokenFetchFailed", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...baseCampaign,
      startsAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    })
    ads.listNotificationMessageTokens.mockRejectedValue(
      new FakeGraphError(2_300_080),
    )
    await service.prepare("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "failed",
      statusReason: "tokenFetchFailed",
      statusErrorCode: 2_300_080,
    })
  })

  test("duplicate tokens are inserted and counted once", async () => {
    ads.listNotificationMessageTokens.mockResolvedValue([
      tok("a", "Updates and promotions"),
      tok("a", "Updates and promotions"),
      tok("b", "Updates and promotions"),
    ])
    await service.prepare("c1")
    expect(recipientRepo.insertMany.mock.calls[0][0]).toHaveLength(2)
    expect(transitionPatches().at(-1)?.patch).toMatchObject({ tokenCount: 2 })
  })
})

describe("startDay estimate failures", () => {
  const sending = {
    ...baseCampaign,
    budgetType: "daily",
    status: "sending",
    adSetId: "as1",
    tokenCount: 5,
  }

  test.each([
    ["a transient code", new FakeGraphError(2_300_078)],
    ["a throttling code", new FakeGraphError(4)],
    ["a network error", new FakeGraphError(undefined, true)],
  ])("F6: %s re-drives via waitingNextDay after a 5 min backoff and shows the error", async (_label, error) => {
    campaignRepo.findById.mockResolvedValue(sending)
    ads.getMessageDeliveryEstimate.mockRejectedValue(error)
    const before = Date.now()
    await service.startDay("c1")
    const last = transitionPatches().at(-1)
    expect(last?.patch).toMatchObject({
      status: "waitingNextDay",
      statusErrorMessage: error.message,
    })
    const nextDayAt = (last?.patch.nextDayAt as Date).getTime()
    expect(nextDayAt - before).toBeGreaterThanOrEqual(5 * 60 * 1000)
    expect(last?.patch).not.toHaveProperty("dayTarget")
    expect(last?.patch).not.toHaveProperty("statusReason")
  })

  test("F6: a permanent coded estimate error pauses with metaBlocker", async () => {
    campaignRepo.findById.mockResolvedValue(sending)
    ads.getMessageDeliveryEstimate.mockRejectedValue(new FakeGraphError(100))
    await service.startDay("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "metaBlocker",
      statusErrorCode: 100,
    })
  })

  test("F6: a success clears the warning and never sets a zero day target while recipients remain", async () => {
    campaignRepo.findById.mockResolvedValue({
      ...sending,
      statusErrorMessage: "old",
    })
    ads.getMessageDeliveryEstimate.mockResolvedValue({
      deliveryLower: 0,
      deliveryUpper: 0,
    })
    recipientRepo.countOutcomes.mockResolvedValue({ pending: 7 })
    await service.startDay("c1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "sending",
      dayTarget: 1,
      daySent: 0,
      statusErrorCode: null,
      statusErrorMessage: null,
    })
  })

  test("a 190 from the estimate pauses grantInvalid and marks the grant invalid", async () => {
    campaignRepo.findById.mockResolvedValue(sending)
    ads.getMessageDeliveryEstimate.mockRejectedValue(new FakeGraphError(190))
    await service.startDay("c1")
    expect(mm.markAuthInvalid).toHaveBeenCalledWith("w1")
    expect(transitionPatches().at(-1)?.patch).toMatchObject({
      status: "paused",
      statusReason: "grantInvalid",
      statusErrorCode: 190,
    })
  })
})

describe("resume", () => {
  const paused = { ...baseCampaign, status: "paused", tokenCount: 10 }

  test("refuses an expired campaign with mmCampaignEnded and leaves status unchanged", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...paused,
      metaEndsAt: new Date(Date.now() - 1000),
    })
    await expect(
      service.resume({ workspaceId: "w1", id: "c1" }),
    ).rejects.toMatchObject({ code: "mmCampaignEnded" })
    expect(campaignRepo.transition).not.toHaveBeenCalled()
  })

  test("refuses with mmGrantInvalid when no grant", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue(paused)
    mm.findAuth.mockResolvedValue(null)
    await expect(
      service.resume({ workspaceId: "w1", id: "c1" }),
    ).rejects.toMatchObject({ code: "mmGrantInvalid" })
    expect(campaignRepo.transition).not.toHaveBeenCalled()
  })

  test("goes back to scheduled when paused before the snapshot, restarting the retry window (M6)", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...paused,
      tokenCount: null,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      nextDayAt: new Date(Date.now() + 60_000),
    })
    const before = Date.now()
    await service.resume({ workspaceId: "w1", id: "c1" })
    const patch = transitionPatches()[0].patch
    expect(patch).toMatchObject({
      status: "scheduled",
      resumeCount: 1,
      statusReason: null,
      nextDayAt: null,
    })
    expect((patch.startsAt as Date).getTime()).toBeGreaterThanOrEqual(before)
  })

  test.each([
    ["a stale future nextDayAt", new Date(Date.now() + 3_600_000)],
    ["no nextDayAt", null],
  ])("F5: a daily campaign with %s re-estimates its day now", async (_label, nextDayAt) => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...paused,
      budgetType: "daily",
      dayTarget: 50,
      daySent: 10,
      nextDayAt,
    })
    const before = Date.now()
    await service.resume({ workspaceId: "w1", id: "c1" })
    const patch = transitionPatches()[0].patch
    expect(patch).toMatchObject({ status: "waitingNextDay" })
    const at = (patch.nextDayAt as Date).getTime()
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  test("F5: a lifetime campaign resumes sending", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue(paused)
    await service.resume({ workspaceId: "w1", id: "c1" })
    expect(transitionPatches()[0].patch).toMatchObject({ status: "sending" })
  })
})

describe("send", () => {
  test("refuses unless status is notSent", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...baseCampaign,
      status: "paused",
    })
    await expect(
      service.send({ workspaceId: "w1", id: "c1" }),
    ).rejects.toMatchObject({ code: "mmInvalidState" })
    expect(campaignRepo.transition).not.toHaveBeenCalled()
  })

  test("refuses an ended campaign", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...baseCampaign,
      status: "notSent",
    })
    ads.getMessageCampaignSchedule.mockResolvedValue({
      adSetId: "as1",
      endTime: new Date(Date.now() - 1000),
    })
    await expect(
      service.send({ workspaceId: "w1", id: "c1" }),
    ).rejects.toMatchObject({ code: "mmCampaignEnded" })
  })

  test("schedules a notSent campaign to start now", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...baseCampaign,
      status: "notSent",
    })
    await service.send({ workspaceId: "w1", id: "c1" })
    expect(transitionPatches()[0]).toMatchObject({
      from: ["notSent"],
      patch: { status: "scheduled" },
    })
  })
})

describe("stop", () => {
  test("from completed throws mmInvalidState", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...baseCampaign,
      status: "completed",
    })
    campaignRepo.transition.mockResolvedValue(null)
    await expect(
      service.stop({ workspaceId: "w1", id: "c1" }),
    ).rejects.toMatchObject({ code: "mmInvalidState" })
  })
})

describe("pause", () => {
  test("works from scheduled/sending/waitingNextDay and is a no-op on a lost race", async () => {
    campaignRepo.transition.mockResolvedValue(null)
    await expect(
      service.pause({ id: "c1", reason: "quotaReached" }),
    ).resolves.toBeUndefined()
    expect(transitionPatches()[0].from).toEqual([
      "scheduled",
      "sending",
      "waitingNextDay",
    ])
  })
})
