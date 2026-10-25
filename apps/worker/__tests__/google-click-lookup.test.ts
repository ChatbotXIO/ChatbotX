import type { ContactInboxModel, InboxModel } from "@chatbotx.io/database/types"
import type { IncomingMessage } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isGoogleClickLookupCandidate: vi.fn(),
  hasIntegration: vi.fn(),
  claimGoogleClickLookup: vi.fn(),
  markGoogleClickLookupDone: vi.fn(),
  updateTracking: vi.fn(),
  runChannelHandler: vi.fn(),
  resolveContext: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  GOOGLE_CLICK_LOOKUP_TIMEOUT_MS: 5000,
  isGoogleClickLookupCandidate: mocks.isGoogleClickLookupCandidate,
  claimGoogleClickLookup: mocks.claimGoogleClickLookup,
  markGoogleClickLookupDone: mocks.markGoogleClickLookupDone,
  integrationGoogleAdsService: { hasIntegration: mocks.hasIntegration },
  contactInboxService: { updateTracking: mocks.updateTracking },
}))
vi.mock("../src/services/integrations", () => ({
  resolveIntegrationContextFromContactInbox: mocks.resolveContext,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { lookupAndPersistGoogleClick, persistNewContactGoogleClick } =
  await import("../src/integration/handlers/google-click-lookup")

const GCLID = "EAIaIQobChMI7P_9z568iAMV1234567890"
const lookedUp = {
  gclid: GCLID,
  gbraid: null,
  googleCampaignId: null,
  googleAdGroupId: null,
  googleAdId: null,
  googleClickReceivedAt: "2026-10-25T00:00:00.000Z",
}

const inbox = {
  id: "inbox-1",
  workspaceId: "ws-1",
  channel: "zalo",
} as InboxModel
const incomingMessage = { sourceId: "m-1" } as IncomingMessage
const contactInbox = (referral: ContactInboxModel["referral"] = null) =>
  ({
    id: "ci-1",
    contactId: "contact-1",
    sourceId: "zalo-user-1",
    referral,
  }) as ContactInboxModel

const run = (referral: ContactInboxModel["referral"] = null) =>
  lookupAndPersistGoogleClick({
    inbox,
    contactInbox: contactInbox(referral),
    incomingMessage,
  })

const expectedTracking = {
  contactInboxId: "ci-1",
  contactId: "contact-1",
  workspaceId: "ws-1",
  data: { referral: lookedUp },
}

describe("lookupAndPersistGoogleClick", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateTracking.mockReset()
    mocks.isGoogleClickLookupCandidate.mockReturnValue(true)
    mocks.hasIntegration.mockResolvedValue(true)
    mocks.claimGoogleClickLookup.mockResolvedValue(true)
    mocks.resolveContext.mockResolvedValue({
      integration: { runChannelHandler: mocks.runChannelHandler },
      ctx: { workspaceId: "ws-1" },
    })
    mocks.runChannelHandler.mockResolvedValue({
      sourceId: "zalo-user-1",
      referral: lookedUp,
    })
  })

  test("reads the profile without avatar under the lookup deadline and persists the click", async () => {
    await run()

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "contact",
      "getProfile",
      {
        ctx: { workspaceId: "ws-1" },
        data: {
          sourceId: "zalo-user-1",
          includeAvatar: false,
          includeProfileSnapshot: false,
          requestTimeoutMs: 5000,
        },
      },
    )
    expect(mocks.updateTracking).toHaveBeenCalledWith(expectedTracking)
    expect(mocks.markGoogleClickLookupDone).toHaveBeenCalledWith("ci-1")
  })

  test.each([
    [
      "the message is not a candidate",
      () => mocks.isGoogleClickLookupCandidate.mockReturnValue(false),
    ],
    [
      "the claim is denied",
      () => mocks.claimGoogleClickLookup.mockResolvedValue(false),
    ],
    [
      "the workspace has no Google Ads",
      () => mocks.hasIntegration.mockResolvedValue(false),
    ],
  ])("does nothing when %s", async (_name, arrange) => {
    arrange()

    await run()

    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.markGoogleClickLookupDone).not.toHaveBeenCalled()
  })

  test("reads the workspace only after winning the claim (one read per attempt window)", async () => {
    mocks.claimGoogleClickLookup.mockResolvedValue(false)

    await run()

    expect(mocks.hasIntegration).not.toHaveBeenCalled()
  })

  test("does not re-store the click already on the contact inbox, and marks the session done", async () => {
    await run({ gclid: GCLID })

    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.markGoogleClickLookupDone).toHaveBeenCalledWith("ci-1")
  })

  test("stores a different click than the one on file", async () => {
    await run({ gclid: "OTHEROTHER1234567890" })

    expect(mocks.updateTracking).toHaveBeenCalledTimes(1)
  })

  test("marks the session done when the channel knows no click", async () => {
    mocks.runChannelHandler.mockResolvedValue({ sourceId: "zalo-user-1" })

    await run()

    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.markGoogleClickLookupDone).toHaveBeenCalledWith("ci-1")
  })

  test("only the claim winner reads the profile", async () => {
    mocks.claimGoogleClickLookup
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await Promise.all([run(), run()])

    expect(mocks.runChannelHandler).toHaveBeenCalledTimes(1)
  })

  test.each([
    [
      "the channel call",
      () => mocks.runChannelHandler.mockRejectedValue(new Error("timeout")),
    ],
    [
      "the context resolution",
      () => mocks.resolveContext.mockRejectedValue(new Error("no integration")),
    ],
    [
      "the workspace check",
      () => mocks.hasIntegration.mockRejectedValue(new Error("db down")),
    ],
  ])("does not throw and logs when %s fails, leaving the session open for a retry", async (_name, arrange) => {
    arrange()

    await expect(run()).resolves.toBeUndefined()

    expect(mocks.markGoogleClickLookupDone).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.anything(),
        contactInboxId: "ci-1",
      }),
      expect.any(String),
    )
  })

  test("a failed save leaves the session open and logs only the error type, never its text", async () => {
    mocks.updateTracking.mockRejectedValue(
      new Error(`Failed query: update ... params: {"gclid":"${GCLID}"}`),
    )

    await run()

    expect(mocks.markGoogleClickLookupDone).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalledWith(
      { errName: "Error", contactInboxId: "ci-1", channel: "zalo" },
      expect.any(String),
    )
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(GCLID)
  })
})

describe("persistNewContactGoogleClick", () => {
  const created = contactInbox()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateTracking.mockReset()
    mocks.hasIntegration.mockResolvedValue(true)
  })

  test("saves the click read at creation, then closes the session", async () => {
    await persistNewContactGoogleClick({
      inbox,
      contactInbox: created,
      referral: lookedUp,
    })

    expect(mocks.updateTracking).toHaveBeenCalledWith(expectedTracking)
    expect(mocks.markGoogleClickLookupDone).toHaveBeenCalledWith("ci-1")
  })

  test("closes the session of a contact that had no click", async () => {
    await persistNewContactGoogleClick({
      inbox,
      contactInbox: created,
      referral: null,
    })

    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.markGoogleClickLookupDone).toHaveBeenCalledWith("ci-1")
  })

  test("a failed save leaves the session open and never logs the click id", async () => {
    mocks.updateTracking.mockRejectedValue(
      new Error(`Failed query: params: {"gclid":"${GCLID}"}`),
    )

    await persistNewContactGoogleClick({
      inbox,
      contactInbox: created,
      referral: lookedUp,
    })

    expect(mocks.markGoogleClickLookupDone).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(GCLID)
  })

  test("writes no marker for a workspace without Google Ads", async () => {
    mocks.hasIntegration.mockResolvedValue(false)

    await persistNewContactGoogleClick({
      inbox,
      contactInbox: created,
      referral: lookedUp,
    })

    expect(mocks.updateTracking).toHaveBeenCalledTimes(1)
    expect(mocks.markGoogleClickLookupDone).not.toHaveBeenCalled()
  })

  test("does nothing for a channel whose click is not a profile lookup", async () => {
    await persistNewContactGoogleClick({
      inbox: { ...inbox, channel: "messenger" } as InboxModel,
      contactInbox: created,
      referral: lookedUp,
    })

    expect(mocks.updateTracking).not.toHaveBeenCalled()
    expect(mocks.hasIntegration).not.toHaveBeenCalled()
  })

  test("never throws when the workspace check fails", async () => {
    mocks.hasIntegration.mockRejectedValue(new Error("db down"))

    await expect(
      persistNewContactGoogleClick({
        inbox,
        contactInbox: created,
        referral: null,
      }),
    ).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })
})
