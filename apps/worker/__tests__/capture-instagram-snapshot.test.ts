import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  findIntegration: vi.fn(),
  getInstagramFacebookSnapshot: vi.fn(),
  getInstagramSnapshot: vi.fn(),
  reschedule: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ workspaceId: "workspace-1" }),
  contactInboxService: {
    claimInstagramSnapshot: mocks.claim,
    completeInstagramSnapshot: mocks.complete,
    rescheduleInstagramSnapshot: mocks.reschedule,
  },
  INSTAGRAM_SNAPSHOT_MAX_ATTEMPTS: 5,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationInstagramRepository: {
    findByInboxIdForWorkspace: mocks.findIntegration,
  },
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: mocks.getInstagramSnapshot },
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: { runChannelHandler: mocks.getInstagramFacebookSnapshot },
}))

const { SdkException } = await import("@chatbotx.io/sdk")

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.error, warn: mocks.warn },
}))

const { captureInstagramSnapshot } = await import(
  "../src/integration/handlers/capture-instagram-snapshot"
)

const data = {
  contactInboxId: "contact-inbox-1",
  inboxId: "inbox-1",
  workspaceId: "workspace-1",
}

describe("captureInstagramSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.claim.mockResolvedValue({ attempt: 1, sourceId: "igsid-1" })
    mocks.findIntegration.mockResolvedValue({
      auth: { metadata: {}, tokens: {} },
      type: "instagram",
    })
    mocks.complete.mockResolvedValue(true)
    mocks.getInstagramFacebookSnapshot.mockResolvedValue({
      follow: null,
      followers: null,
      following: null,
      verified: null,
    })
  })

  test("captures an all-null response as a terminal successful snapshot", async () => {
    mocks.getInstagramSnapshot.mockResolvedValue({
      follow: null,
      followers: null,
      following: null,
      verified: null,
    })

    await captureInstagramSnapshot(data)

    expect(mocks.complete).toHaveBeenCalledWith({
      ...data,
      attempt: 1,
      outcome: "captured",
      snapshot: {
        follow: null,
        followers: null,
        following: null,
        verified: null,
      },
    })
  })

  test("marks a disconnected inbox unavailable without calling Graph", async () => {
    mocks.findIntegration.mockResolvedValue(null)

    await captureInstagramSnapshot(data)

    expect(mocks.getInstagramSnapshot).not.toHaveBeenCalled()
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "unavailable" }),
    )
  })

  test("reschedules a wrapped transport failure using the DB claim token", async () => {
    const error = new SdkException("timeout", "instagramError", 400)
    error.setOriginError(
      Object.assign(new Error("request timed out"), { name: "TimeoutError" }),
    )
    mocks.getInstagramSnapshot.mockRejectedValue(error)

    await captureInstagramSnapshot(data)

    expect(mocks.reschedule).toHaveBeenCalledWith({ ...data, attempt: 1 })
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("uses the Instagram-via-Facebook handler for Facebook integrations", async () => {
    mocks.findIntegration.mockResolvedValue({
      auth: { metadata: {}, tokens: {} },
      type: "facebook",
    })

    await captureInstagramSnapshot(data)

    expect(mocks.getInstagramFacebookSnapshot).toHaveBeenCalledOnce()
    expect(mocks.getInstagramSnapshot).not.toHaveBeenCalled()
  })

  test("completes a provider policy error as terminal failed", async () => {
    mocks.getInstagramSnapshot.mockRejectedValue(
      new SdkException("invalid field", 100, 400),
    )

    await captureInstagramSnapshot(data)

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
    mocks.getInstagramSnapshot.mockRejectedValue(error)

    await captureInstagramSnapshot(data)

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ outcome }),
    )
    expect(mocks.reschedule).not.toHaveBeenCalled()
  })

  test.each([
    ["Graph rate limit", new SdkException("rate limited", 4, 400)],
    ["provider 5xx", new SdkException("server failure", 2, 503)],
  ])("reschedules %s", async (_name, error) => {
    mocks.getInstagramSnapshot.mockRejectedValue(error)

    await captureInstagramSnapshot(data)

    expect(mocks.reschedule).toHaveBeenCalledWith({ ...data, attempt: 1 })
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  test("propagates a successful snapshot persistence failure", async () => {
    mocks.getInstagramSnapshot.mockResolvedValue({
      follow: true,
      followers: 7,
      following: false,
      verified: true,
    })
    mocks.complete.mockRejectedValueOnce(new Error("database unavailable"))

    await expect(captureInstagramSnapshot(data)).rejects.toThrow(
      "database unavailable",
    )
    expect(mocks.reschedule).not.toHaveBeenCalled()
  })
})
