import { beforeEach, describe, expect, test, vi } from "vitest"

const applyEvent = vi.fn(async () => undefined)
vi.mock("../src/integration/handlers/inbox_labels/sync", () => ({
  applyEvent: (...args: unknown[]) => applyEvent(...args),
}))
const ensureTagByName = vi.fn(async () => "tag-ad" as string | undefined)
const linkTagToContactsReturningNewUnscoped = vi.fn(async () => [
  { contactId: "contact-1" },
])
const findTagChannelByTag = vi.fn(
  async (): Promise<{ id: string } | undefined> => undefined,
)
const recordTagChannelAssignmentsUnscoped = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    ensureTagByName: (...args: unknown[]) => ensureTagByName(...args),
    linkTagToContactsReturningNewUnscoped: (...args: unknown[]) =>
      linkTagToContactsReturningNewUnscoped(...args),
    findTagChannelByTag: (...args: unknown[]) => findTagChannelByTag(...args),
    recordTagChannelAssignmentsUnscoped: (...args: unknown[]) =>
      recordTagChannelAssignmentsUnscoped(...args),
  },
}))
const emitTagApplied = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied: (...args: unknown[]) => emitTagApplied(...args),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const {
  syncAdLabelsIfAdReferred,
  tagAdReferralOnlyContact,
  AD_LABEL_LOOKUP_TIMEOUT_MS,
} = await import("../src/integration/handlers/sync-ad-labels")
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
  ensureTagByName.mockResolvedValue("tag-ad")
  linkTagToContactsReturningNewUnscoped.mockResolvedValue([
    { contactId: "contact-1" },
  ])
  findTagChannelByTag.mockResolvedValue(undefined)
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

/** Referral-only `messaging_referrals` webhook from a Messenger ad. */
const adReferralOnly = () => ({
  canAutomate: true,
  inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "messenger" },
  integrationRow: {
    id: "intg-msg-1",
    syncTagEnabledAt: new Date("2026-09-03"),
  },
  referral: { source: "ADS", type: "OPEN_THREAD", adId: AD_ID },
  isReferralOnly: true,
  contactInbox: { id: "ci-1", contactId: "contact-1" },
})

describe("tagAdReferralOnlyContact — tagging", () => {
  test("finds or creates the ad_id.<adId> tag and applies it to the contact", async () => {
    await tagAdReferralOnlyContact(adReferralOnly())

    expect(ensureTagByName).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: `ad_id.${AD_ID}`,
    })
    expect(linkTagToContactsReturningNewUnscoped).toHaveBeenCalledWith({
      tagId: "tag-ad",
      contactIds: ["contact-1"],
    })
    expect(emitTagApplied).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      "tag-ad",
      "ci-1",
    )
  })

  test("records the channel assignment when the tag already has this page's label id", async () => {
    findTagChannelByTag.mockResolvedValue({ id: "tc-ad" })

    await tagAdReferralOnlyContact(adReferralOnly())

    expect(findTagChannelByTag).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tagId: "tag-ad",
      channelType: "messenger",
      integrationId: "intg-msg-1",
    })
    expect(recordTagChannelAssignmentsUnscoped).toHaveBeenCalledWith({
      tagId: "tag-ad",
      tagChannelId: "tc-ad",
      contactInboxIds: ["ci-1"],
    })
  })

  test("records the channel assignment even when the contact already had the tag", async () => {
    linkTagToContactsReturningNewUnscoped.mockResolvedValue([])
    findTagChannelByTag.mockResolvedValue({ id: "tc-ad" })

    await tagAdReferralOnlyContact(adReferralOnly())

    expect(recordTagChannelAssignmentsUnscoped).toHaveBeenCalledTimes(1)
  })

  test("still records the channel assignment when the tag-applied event fails", async () => {
    findTagChannelByTag.mockResolvedValue({ id: "tc-ad" })
    emitTagApplied.mockRejectedValueOnce(new Error("emitter down"))

    await tagAdReferralOnlyContact(adReferralOnly())

    expect(recordTagChannelAssignmentsUnscoped).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test("records no channel assignment while the tag has no label id yet", async () => {
    await tagAdReferralOnlyContact(adReferralOnly())

    expect(recordTagChannelAssignmentsUnscoped).not.toHaveBeenCalled()
  })

  test("a repeated referral for the same ad emits no second tag-applied event", async () => {
    linkTagToContactsReturningNewUnscoped.mockResolvedValue([])

    await tagAdReferralOnlyContact(adReferralOnly())

    expect(linkTagToContactsReturningNewUnscoped).toHaveBeenCalledTimes(1)
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("never calls the Graph API", async () => {
    await tagAdReferralOnlyContact(adReferralOnly())

    expect(listLabels).not.toHaveBeenCalled()
    expect(applyEvent).not.toHaveBeenCalled()
  })

  test("links nothing when the tag cannot be resolved", async () => {
    ensureTagByName.mockResolvedValue(undefined)

    await tagAdReferralOnlyContact(adReferralOnly())

    expect(linkTagToContactsReturningNewUnscoped).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("logs a save failure instead of throwing", async () => {
    const failure = new Error("db down")
    ensureTagByName.mockRejectedValue(failure)

    await expect(
      tagAdReferralOnlyContact(adReferralOnly()),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: failure, adId: AD_ID }),
      "Ad referral tag failed",
    )
  })
})

describe("tagAdReferralOnlyContact — when to skip", () => {
  test.each([
    ["delivery carried a message", { isReferralOnly: false }],
    ["expired workspace or standby", { canAutomate: false }],
    [
      "tag sync off",
      { integrationRow: { id: "intg-msg-1", syncTagEnabledAt: null } },
    ],
    ["no referral", { referral: null }],
    ["non-ads referral", { referral: { source: "SHORTLINK", ref: "promo" } }],
    ["ads referral without ad id", { referral: { source: "ADS" } }],
    [
      "other channel",
      { inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "instagram" } },
    ],
  ])("%s", async (_case, overrides) => {
    await tagAdReferralOnlyContact({ ...adReferralOnly(), ...overrides })

    expect(ensureTagByName).not.toHaveBeenCalled()
    expect(linkTagToContactsReturningNewUnscoped).not.toHaveBeenCalled()
  })
})
