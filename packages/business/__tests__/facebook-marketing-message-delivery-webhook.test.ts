import { beforeEach, describe, expect, test, vi } from "vitest"

const campaignRepo = { findByCampaignId: vi.fn(), findForWorkspace: vi.fn() }
const recipientRepo = {
  findByTrackingId: vi.fn(),
  findByCampaignToken: vi.fn(),
  update: vi.fn(),
  countOutcomes: vi.fn(),
  errorBreakdown: vi.fn(),
}
vi.mock("@chatbotx.io/database/repositories", () => ({
  facebookMarketingMessageRepository: campaignRepo,
  facebookMarketingMessageRecipientRepository: recipientRepo,
  facebookMarketingMessageAudienceRepository: { findForWorkspace: vi.fn() },
}))
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord: vi.fn() }))
vi.mock("../src/facebook-marketing-messages/service", () => ({
  facebookMarketingMessagesService: {},
}))
vi.mock("../src/integration-messenger", () => ({
  messengerIntegrationService: {},
}))
vi.mock("../src/facebook-marketing-message-delivery/usage", () => ({
  recordMarketingMessageUsage: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({ casStore: { setIfAbsent: vi.fn() } }))

const { facebookMarketingMessageDeliveryService: service } = await import(
  "../src/facebook-marketing-message-delivery/service"
)
const { marketingMessageWebhookValueSchema, parseMarketingMessageWebhook } =
  await import("../src/facebook-marketing-message-delivery/webhook")

const ts = new Date("2026-10-18T10:00:00Z")
const campaign = { id: "c1", workspaceId: "w1", campaignId: "meta1" }
const echo = (over: Record<string, unknown> = {}) => ({
  field: "marketing_message_echoes" as const,
  campaignId: "meta1",
  subscriptionToken: "tok-abcdef123456",
  trackingId: "trk1",
  psid: "psid1",
  mid: "mid1",
  timestamp: ts,
  ...over,
})
const lastUpdate = () => recipientRepo.update.mock.calls.at(-1)?.[0]

beforeEach(() => {
  vi.resetAllMocks()
  campaignRepo.findByCampaignId.mockResolvedValue(campaign)
})

describe("applyWebhook", () => {
  test("echo promotes unconfirmed to sent and stores psid/mid", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue({
      id: "r1",
      campaignRowId: "c1",
      status: "unconfirmed",
      trackingId: "trk1",
    })
    const res = await service.applyWebhook(echo())
    expect(res.applied).toBe(true)
    expect(lastUpdate()).toMatchObject({
      id: "r1",
      status: "sent",
      psid: "psid1",
      mid: "mid1",
    })
  })

  test("echo does not downgrade delivered", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue({
      id: "r1",
      campaignRowId: "c1",
      status: "delivered",
      trackingId: "trk1",
      psid: null,
      mid: null,
    })
    await service.applyWebhook(echo())
    expect(lastUpdate().status).toBeUndefined()
    expect(lastUpdate()).toMatchObject({ psid: "psid1", mid: "mid1" })
  })

  test("echo promotes outcomeUnknown failure but not other failures", async () => {
    const base = { id: "r1", campaignRowId: "c1", trackingId: "trk1" }
    recipientRepo.findByTrackingId.mockResolvedValue({
      ...base,
      status: "failed",
      errorCode: null,
      errorMessage: "outcomeUnknown",
    })
    await service.applyWebhook(echo())
    expect(lastUpdate()).toMatchObject({
      status: "sent",
      errorCode: null,
      errorMessage: null,
      errorSource: null,
      failedAt: null,
    })
    recipientRepo.update.mockClear()
    recipientRepo.findByTrackingId.mockResolvedValue({
      ...base,
      status: "failed",
      errorCode: 2_300_001,
      errorMessage: "boom",
    })
    await service.applyWebhook(echo())
    expect(lastUpdate()?.status).toBeUndefined()
  })

  test("trackingId from another campaign falls back to campaign+token", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue({
      id: "x",
      campaignRowId: "other",
      status: "pending",
    })
    recipientRepo.findByCampaignToken.mockResolvedValue({
      id: "r2",
      campaignRowId: "c1",
      status: "pending",
      trackingId: null,
    })
    await service.applyWebhook(echo())
    expect(lastUpdate()).toMatchObject({
      id: "r2",
      status: "sent",
      trackingId: "trk1",
    })
  })

  test("delivery sets delivered", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue({
      id: "r1",
      campaignRowId: "c1",
      status: "unconfirmed",
      trackingId: "trk1",
    })
    await service.applyWebhook(echo({ field: "marketing_message_deliveries" }))
    expect(lastUpdate()).toMatchObject({
      id: "r1",
      status: "delivered",
      deliveredAt: ts,
    })
  })

  test("delivery_failed matches by campaign+token and records webhook error", async () => {
    recipientRepo.findByCampaignToken.mockResolvedValue({
      id: "r3",
      campaignRowId: "c1",
      status: "delivered",
    })
    const res = await service.applyWebhook({
      field: "marketing_message_delivery_failed",
      campaignId: "meta1",
      subscriptionToken: "tok-abcdef123456",
      errorMessage: "user blocked",
      timestamp: ts,
    })
    expect(res.applied).toBe(true)
    expect(recipientRepo.findByCampaignToken).toHaveBeenCalledWith({
      campaignRowId: "c1",
      subscriptionToken: "tok-abcdef123456",
    })
    expect(lastUpdate()).toMatchObject({
      id: "r3",
      status: "failed",
      errorSource: "webhook",
      errorCode: null,
      errorMessage: "user blocked",
      failedAt: ts,
    })
  })

  test("unknown campaign id returns applied false and does not throw", async () => {
    campaignRepo.findByCampaignId.mockResolvedValue(null)
    await expect(service.applyWebhook(echo())).resolves.toEqual({
      applied: false,
    })
  })

  test("unknown token on a known campaign returns applied false", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue(null)
    recipientRepo.findByCampaignToken.mockResolvedValue(null)
    await expect(service.applyWebhook(echo())).resolves.toEqual({
      applied: false,
    })
    expect(recipientRepo.update).not.toHaveBeenCalled()
  })
})

describe("marketingMessageWebhookValueSchema", () => {
  test("coerces numeric ids and tolerates extra keys", () => {
    const v = marketingMessageWebhookValueSchema.parse({
      message_id: 123,
      messenger_subscription_token: 456,
      timestamp: 1_760_000_000,
      recipient_id: 789,
      extra: true,
    })
    expect(v.message_id).toBe("123")
    expect(v.messenger_subscription_token).toBe("456")
    expect(v.recipient_id).toBe("789")
  })
})

describe("getStats", () => {
  test("aggregates counts and returns the error breakdown", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue({
      ...campaign,
      status: "sending",
      statusReason: null,
      statusErrorCode: null,
      statusErrorMessage: null,
      startsAt: ts,
      completedAt: null,
      tokenCount: 10,
    })
    recipientRepo.countOutcomes.mockResolvedValue({
      total: 10,
      pending: 2,
      unconfirmed: 1,
      sent: 3,
      delivered: 2,
      failed: 2,
    })
    recipientRepo.errorBreakdown.mockResolvedValue([
      { errorCode: null, errorMessage: "x", count: 2 },
    ])
    const s = await service.getStats({ workspaceId: "w1", id: "c1" })
    expect(s.counts).toEqual({
      pending: 2,
      sent: 5,
      delivered: 2,
      failed: 2,
      unconfirmed: 1,
    })
    expect(s.errors).toHaveLength(1)
    expect(s.tokenCount).toBe(10)
  })

  test("other workspace campaign is mmNotFound", async () => {
    campaignRepo.findForWorkspace.mockResolvedValue(null)
    await expect(
      service.getStats({ workspaceId: "w2", id: "c1" }),
    ).rejects.toMatchObject({ code: "mmNotFound" })
  })
})

describe("parseMarketingMessageWebhook", () => {
  const sample = {
    message_id: "meta1",
    messenger_subscription_token: "tok-abcdef123456",
    timestamp: 1_760_000_000,
    marketing_message_tracking_id: "trk1",
    recipient_id: "psid1",
    mid: "mid1",
  }
  test("parses echoes and deliveries", () => {
    for (const field of [
      "marketing_message_echoes",
      "marketing_message_deliveries",
    ]) {
      expect(parseMarketingMessageWebhook(field, sample)).toEqual({
        field,
        campaignId: "meta1",
        subscriptionToken: "tok-abcdef123456",
        trackingId: "trk1",
        psid: "psid1",
        mid: "mid1",
        timestamp: new Date(1_760_000_000_000),
      })
    }
  })
  test("absent optional ids map to null", () => {
    const e = parseMarketingMessageWebhook("marketing_message_echoes", {
      message_id: 1,
      messenger_subscription_token: 2,
      timestamp: 1_760_000_000,
    })
    expect(e).toMatchObject({
      campaignId: "1",
      trackingId: null,
      psid: null,
      mid: null,
    })
  })
  test("parses delivery_failed", () => {
    expect(
      parseMarketingMessageWebhook("marketing_message_delivery_failed", {
        ...sample,
        error_message: "blocked",
      }),
    ).toEqual({
      field: "marketing_message_delivery_failed",
      campaignId: "meta1",
      subscriptionToken: "tok-abcdef123456",
      errorMessage: "blocked",
      timestamp: new Date(1_760_000_000_000),
    })
  })
  test("delivery_failed without error_message defaults", () => {
    for (const extra of [{}, { error_message: "" }]) {
      expect(
        parseMarketingMessageWebhook("marketing_message_delivery_failed", {
          ...sample,
          ...extra,
        }),
      ).toMatchObject({ errorMessage: "deliveryFailed" })
    }
  })
  // Real `messaging[]` items captured from Meta (spec V3).
  test("parses the real delivery_failed item (timestamp in seconds)", () => {
    expect(
      parseMarketingMessageWebhook("marketing_message_delivery_failed", {
        app_id: 894_156_910_972_023,
        business_id: 553_355_495_727_951,
        error_message: "Failed to send message. Please try again later",
        field: "marketing_message_delivery_failed",
        message_id: "120255821669280210",
        messenger_subscription_token: "6548567018098646545",
        page_id: 236_906_180_715_173,
        timestamp: 1_792_592_251,
      }),
    ).toEqual({
      field: "marketing_message_delivery_failed",
      campaignId: "120255821669280210",
      subscriptionToken: "6548567018098646545",
      errorMessage: "Failed to send message. Please try again later",
      timestamp: new Date(1_792_592_251_000),
    })
  })
  test("parses the real echoes item (timestamp in ms)", () => {
    expect(
      parseMarketingMessageWebhook("marketing_message_echoes", {
        app_id: 170_005_996_917_513,
        field: "marketing_message_echoes",
        marketing_message_tracking_id: "ce55d4cf-080c-4907-aea3-6618276ede95",
        // the messenger edge quotes the numeric id before JSON.parse
        message_id: "120254191797760180",
        messenger_subscription_token: "516438291834149975",
        page_id: 121_670_690_872_419,
        timestamp: 1_792_538_896_051,
      }),
    ).toEqual({
      field: "marketing_message_echoes",
      campaignId: "120254191797760180",
      subscriptionToken: "516438291834149975",
      trackingId: "ce55d4cf-080c-4907-aea3-6618276ede95",
      psid: null,
      mid: null,
      timestamp: new Date(1_792_538_896_051),
    })
  })
  test("unknown field and invalid values return null", () => {
    expect(parseMarketingMessageWebhook("messages", sample)).toBeNull()
    const f = "marketing_message_echoes"
    const { message_id: _m, ...noId } = sample
    expect(parseMarketingMessageWebhook(f, noId)).toBeNull()
    expect(
      parseMarketingMessageWebhook(f, {
        ...sample,
        messenger_subscription_token: "",
      }),
    ).toBeNull()
    for (const timestamp of [null, "", false, 0, -5, "abc"]) {
      expect(
        parseMarketingMessageWebhook(f, { ...sample, timestamp }),
      ).toBeNull()
    }
    expect(parseMarketingMessageWebhook(f, null)).toBeNull()
  })
})

describe("applyWebhook ordering", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "r1",
    campaignRowId: "c1",
    trackingId: "trk1",
    ...over,
  })
  test("delivery before echo resolves unconfirmed to delivered", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue(
      row({ status: "unconfirmed" }),
    )
    await service.applyWebhook(echo({ field: "marketing_message_deliveries" }))
    expect(lastUpdate()).toMatchObject({ status: "delivered" })
    recipientRepo.update.mockClear()
    recipientRepo.findByTrackingId.mockResolvedValue(
      row({ status: "delivered", psid: "psid1", mid: "mid1" }),
    )
    await service.applyWebhook(echo())
    expect(recipientRepo.update).not.toHaveBeenCalled()
  })
  test("late echo on a row failed for another reason is not promoted", async () => {
    recipientRepo.findByTrackingId.mockResolvedValue(
      row({ status: "failed", errorCode: 5, errorMessage: "x" }),
    )
    await service.applyWebhook(echo())
    expect(lastUpdate()?.status).toBeUndefined()
  })
  test("delivered then delivery_failed becomes failed", async () => {
    recipientRepo.findByCampaignToken.mockResolvedValue(
      row({ status: "delivered" }),
    )
    await service.applyWebhook({
      field: "marketing_message_delivery_failed",
      campaignId: "meta1",
      subscriptionToken: "t",
      errorMessage: "late",
      timestamp: ts,
    })
    expect(lastUpdate()).toMatchObject({ status: "failed" })
  })
})
