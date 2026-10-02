import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  getProfileSnapshot: vi.fn(),
  reschedule: vi.fn(),
  resolveIntegrationContext: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {
    claimProfileSnapshot: mocks.claim,
    completeProfileSnapshot: mocks.complete,
    rescheduleProfileSnapshot: mocks.reschedule,
  },
}))

vi.mock("../src/services/integrations", () => ({
  resolveIntegrationContextFromContactInbox: mocks.resolveIntegrationContext,
}))

const { ChannelError, ChannelErrorCategory, SdkException } = await import(
  "@chatbotx.io/sdk"
)

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.error, warn: mocks.warn },
}))

const { captureContactProfileSnapshot } = await import(
  "../src/integration/handlers/capture-contact-profile-snapshot"
)

const data = {
  contactInboxId: "contact-inbox-1",
  inboxId: "inbox-1",
  workspaceId: "workspace-1",
}

const nullSnapshot = {
  followsBusiness: null,
  businessFollowsContact: null,
  accountVerified: null,
  followerCount: null,
}

describe("captureContactProfileSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claim.mockResolvedValue({
      attempt: 1,
      channel: "instagram",
      sourceId: "igsid-1",
    })
    mocks.resolveIntegrationContext.mockResolvedValue({
      ctx: { workspaceId: "workspace-1" },
      integration: { runChannelHandler: mocks.getProfileSnapshot },
    })
    mocks.getProfileSnapshot.mockResolvedValue(nullSnapshot)
    mocks.complete.mockResolvedValue(true)
  })

  test("does nothing when the row cannot be claimed", async () => {
    mocks.claim.mockResolvedValue(undefined)

    await captureContactProfileSnapshot(data)

    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("captures an all-null response as a terminal successful snapshot", async () => {
    await captureContactProfileSnapshot(data)

    expect(mocks.complete).toHaveBeenCalledWith({
      ...data,
      attempt: 1,
      outcome: "captured",
      snapshot: nullSnapshot,
    })
  })

  test("resolves the integration from the claimed channel and calls the neutral handler", async () => {
    await captureContactProfileSnapshot(data)

    expect(mocks.resolveIntegrationContext).toHaveBeenCalledWith({
      contactInbox: { channel: "instagram", inboxId: "inbox-1" },
      workspaceId: "workspace-1",
    })
    expect(mocks.getProfileSnapshot).toHaveBeenCalledWith(
      "contact",
      "getProfileSnapshot",
      { ctx: { workspaceId: "workspace-1" }, data: { sourceId: "igsid-1" } },
    )
  })

  test("marks a channel without snapshot support unavailable without calling the provider", async () => {
    mocks.claim.mockResolvedValue({
      attempt: 1,
      channel: "messenger",
      sourceId: "psid-1",
    })

    await captureContactProfileSnapshot(data)

    expect(mocks.resolveIntegrationContext).not.toHaveBeenCalled()
    expect(mocks.getProfileSnapshot).not.toHaveBeenCalled()
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "unavailable" }),
    )
  })

  test.each([
    ["integration_auth_missing"],
    ["unsupported_channel"],
  ])("ends %s as unavailable instead of burning the retry budget", async (code) => {
    mocks.resolveIntegrationContext.mockRejectedValue(
      new ChannelError("no integration", ChannelErrorCategory.AUTH_FAILED, {
        code,
      }),
    )

    await captureContactProfileSnapshot(data)

    expect(mocks.getProfileSnapshot).not.toHaveBeenCalled()
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "unavailable" }),
    )
    expect(mocks.reschedule).not.toHaveBeenCalled()
  })

  test("reschedules a wrapped transport failure using the DB claim token", async () => {
    const error = new SdkException("timeout", "instagramError", 400)
    error.setOriginError(
      Object.assign(new Error("request timed out"), { name: "TimeoutError" }),
    )
    mocks.getProfileSnapshot.mockRejectedValue(error)

    await captureContactProfileSnapshot(data)

    expect(mocks.reschedule).toHaveBeenCalledWith({ ...data, attempt: 1 })
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("reschedules an unknown (non-SDK) failure", async () => {
    mocks.getProfileSnapshot.mockRejectedValue(new Error("socket hang up"))

    await captureContactProfileSnapshot(data)

    expect(mocks.reschedule).toHaveBeenCalledWith({ ...data, attempt: 1 })
  })

  test("logs when the retry budget is exhausted", async () => {
    mocks.getProfileSnapshot.mockRejectedValue(
      new SdkException("rate limited", 4, 400),
    )
    mocks.reschedule.mockResolvedValue("failed")

    await captureContactProfileSnapshot(data)

    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 1 }),
      "Profile snapshot retry budget exhausted",
    )
  })

  test("completes a provider policy error as terminal failed", async () => {
    mocks.getProfileSnapshot.mockRejectedValue(
      new SdkException("invalid field", 100, 400),
    )

    await captureContactProfileSnapshot(data)

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
    )
    expect(mocks.reschedule).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "failed" }),
      expect.any(String),
    )
  })

  test.each([
    [
      "#230 unavailable",
      new SdkException("unavailable", 230, 400),
      "unavailable",
    ],
    [
      "#100/33 unavailable",
      new SdkException("unavailable", 100, 400, 33),
      "unavailable",
    ],
  ])("completes %s without spending another retry", async (_name, error, outcome) => {
    mocks.getProfileSnapshot.mockRejectedValue(error)

    await captureContactProfileSnapshot(data)

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome }),
    )
    expect(mocks.reschedule).not.toHaveBeenCalled()
    expect(mocks.warn).toHaveBeenCalled()
  })

  test.each([
    ["Graph rate limit", new SdkException("rate limited", 4, 400)],
    ["provider 5xx", new SdkException("server failure", 2, 503)],
  ])("reschedules %s", async (_name, error) => {
    mocks.getProfileSnapshot.mockRejectedValue(error)

    await captureContactProfileSnapshot(data)

    expect(mocks.reschedule).toHaveBeenCalledWith({ ...data, attempt: 1 })
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("propagates a successful snapshot persistence failure", async () => {
    mocks.getProfileSnapshot.mockResolvedValue({
      followsBusiness: true,
      followerCount: 7,
      businessFollowsContact: false,
      accountVerified: true,
    })
    mocks.complete.mockRejectedValueOnce(new Error("database unavailable"))

    await expect(captureContactProfileSnapshot(data)).rejects.toThrow(
      "database unavailable",
    )
    expect(mocks.reschedule).not.toHaveBeenCalled()
  })
})
