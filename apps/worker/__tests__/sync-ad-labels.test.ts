import { beforeEach, describe, expect, test, vi } from "vitest"

const applyEvent = vi.fn(async () => undefined)
vi.mock("../src/integration/handlers/inbox_labels/sync", () => ({
  applyEvent: (...args: unknown[]) => applyEvent(...args),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { syncAdLabelsIfAdReferred, AD_LABEL_LOOKUP_TIMEOUT_MS } = await import(
  "../src/integration/handlers/sync-ad-labels"
)
const { logger } = await import("../src/lib/logger")

const AD_ID = "1111111111"
const PSID = "psid-ad-1"

/** The label set Meta returns for a user who arrived from a CTM ad. */
const metaAdLabels = [
  { id: "label-intake", name: "Intake" },
  { id: "label-ad", name: `ad_id.${AD_ID}` },
  { id: "label-messenger-ads", name: "messenger_ads" },
  { id: "label-ad-response", name: "Ad response" },
]

const listLabels = vi.fn(async () => metaAdLabels)

/** First message from a Messenger ad on a page with tag sync on. */
const adReferredMessage = () => ({
  canAutomate: true,
  inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "messenger" },
  integrationRow: {
    id: "intg-msg-1",
    syncTagEnabledAt: new Date("2026-09-03"),
  },
  referral: { source: "ADS", type: "OPEN_THREAD", adId: AD_ID },
  newMessageType: "incoming",
  sourceId: PSID,
  listLabels,
})

beforeEach(() => {
  vi.clearAllMocks()
  listLabels.mockResolvedValue(metaAdLabels)
})

describe("syncAdLabelsIfAdReferred — storing", () => {
  test("stores only ad_id.* labels through the inbox_labels save path, keyed by Graph label id", async () => {
    await syncAdLabelsIfAdReferred(adReferredMessage())

    expect(applyEvent).toHaveBeenCalledTimes(1)
    expect(applyEvent).toHaveBeenCalledWith(
      {
        channelType: "messenger",
        workspaceId: "ws-1",
        integrationId: "intg-msg-1",
        inboxId: "inbox-1",
      },
      {
        type: "assign",
        labelId: "label-ad",
        labelName: `ad_id.${AD_ID}`,
        userIds: [PSID],
      },
    )
  })

  test("looks labels up with the fail-fast deadline", async () => {
    await syncAdLabelsIfAdReferred(adReferredMessage())

    expect(listLabels).toHaveBeenCalledWith(AD_LABEL_LOOKUP_TIMEOUT_MS)
  })

  test("stores labels for an ad Get Started postback (stored as a new incoming message)", async () => {
    await syncAdLabelsIfAdReferred({
      ...adReferredMessage(),
      referral: { source: "ADS", type: "OPEN_THREAD", adId: AD_ID, ref: null },
    })

    expect(applyEvent).toHaveBeenCalledTimes(1)
  })

  test("stores every ad_id.* label the person has", async () => {
    listLabels.mockResolvedValue([
      { id: "1", name: "ad_id.111" },
      { id: "2", name: "ad_id.222" },
    ])

    await syncAdLabelsIfAdReferred(adReferredMessage())

    expect(applyEvent).toHaveBeenCalledTimes(2)
  })

  test("stores nothing when Meta has no ad label for the person", async () => {
    listLabels.mockResolvedValue([{ id: "1", name: "Intake" }])

    await syncAdLabelsIfAdReferred(adReferredMessage())

    expect(applyEvent).not.toHaveBeenCalled()
  })

  test("logs a Graph failure instead of throwing", async () => {
    const failure = new Error("Graph 613")
    listLabels.mockRejectedValue(failure)

    await expect(
      syncAdLabelsIfAdReferred(adReferredMessage()),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, adId: AD_ID, sourceId: PSID }),
      "Ad label sync failed",
    )
  })

  test("logs a save failure instead of throwing", async () => {
    applyEvent.mockRejectedValueOnce(new Error("db down"))

    await expect(
      syncAdLabelsIfAdReferred(adReferredMessage()),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe("syncAdLabelsIfAdReferred — when to skip (no Graph call)", () => {
  test.each([
    [
      "referral-only webhook or redelivered message",
      { newMessageType: undefined },
    ],
    ["outgoing echo", { newMessageType: "outgoing" }],
    ["expired workspace or standby", { canAutomate: false }],
    [
      "tag sync off",
      { integrationRow: { id: "intg-msg-1", syncTagEnabledAt: null } },
    ],
    ["row without the column", { integrationRow: { id: "intg-msg-1" } }],
    ["no referral", { referral: null }],
    ["non-ads referral", { referral: { source: "SHORTLINK", ref: "promo" } }],
    ["ads referral without ad id", { referral: { source: "ADS" } }],
    [
      "other channel",
      { inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "instagram" } },
    ],
  ])("%s", async (_case, overrides) => {
    await syncAdLabelsIfAdReferred({ ...adReferredMessage(), ...overrides })

    expect(listLabels).not.toHaveBeenCalled()
    expect(applyEvent).not.toHaveBeenCalled()
  })
})
