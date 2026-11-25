import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  recordLiveObservation: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  channelPostService: { recordLiveObservation: mocks.recordLiveObservation },
}))
vi.mock("../src/lib/logger", () => ({ logger: { warn: mocks.loggerWarn } }))

const { commentLiveState, recordLiveCommentObservation } = await import(
  "../src/integration/handlers/live-comment-observation"
)

const target = {
  channel: "messenger",
  externalPostId: "page-1_555",
  inboxId: "11",
  integrationId: "5",
  sourceAccountId: "page-1",
  workspaceId: "ws-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.recordLiveObservation.mockResolvedValue(true)
})

describe("commentLiveState", () => {
  const base = {
    integrationType: "messenger",
    isInstagramViaFacebook: false,
    isLiveComment: true,
    lookupLiveState: undefined,
  } as const

  test.each([
    ["live", "live"],
    ["ended", "ended"],
    ["unknown", "unknown"],
    [null, null],
    [undefined, null],
  ] as const)("a Facebook comment whose lookup said %s evidences %s", (lookupLiveState, expected) => {
    expect(commentLiveState({ ...base, lookupLiveState })).toBe(expected)
  })

  test("an Instagram live comment through Facebook Login evidences a broadcast on the air", () => {
    expect(
      commentLiveState({
        ...base,
        integrationType: "instagram",
        isInstagramViaFacebook: true,
      }),
    ).toBe("live")
  })

  test("an Instagram Login live comment evidences nothing, since nothing could ever end it", () => {
    expect(
      commentLiveState({ ...base, integrationType: "instagram" }),
    ).toBeNull()
  })

  test("a comment that is not live evidences nothing", () => {
    expect(
      commentLiveState({
        ...base,
        integrationType: "instagram",
        isInstagramViaFacebook: true,
        isLiveComment: false,
      }),
    ).toBeNull()
  })
})

describe("recordLiveCommentObservation", () => {
  test.each([
    "live",
    "ended",
  ] as const)("records a %s broadcast as comment evidence", async (liveState) => {
    await recordLiveCommentObservation({ ...target, liveState })

    expect(mocks.recordLiveObservation).toHaveBeenCalledWith({
      ...target,
      observedAt: expect.any(Date),
      source: "comment",
      status: liveState,
    })
  })

  test.each([
    "live",
    "ended",
  ] as const)("a live comment adds nothing once the post is already %s", async (currentLiveStatus) => {
    await recordLiveCommentObservation({
      ...target,
      currentLiveStatus,
      liveState: "live",
    })

    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("an ended comment on a post already ended writes nothing (no hot-row lock)", async () => {
    await recordLiveCommentObservation({
      ...target,
      currentLiveStatus: "ended",
      liveState: "ended",
    })

    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("an ended comment still ends a post that is live", async () => {
    await recordLiveCommentObservation({
      ...target,
      currentLiveStatus: "live",
      liveState: "ended",
    })

    expect(mocks.recordLiveObservation).toHaveBeenCalledTimes(1)
  })

  test("a live comment starts a post that has no live status yet", async () => {
    await recordLiveCommentObservation({
      ...target,
      currentLiveStatus: null,
      liveState: "live",
    })

    expect(mocks.recordLiveObservation).toHaveBeenCalledTimes(1)
  })

  test.each([
    "unknown",
    null,
    undefined,
  ] as const)("records nothing for %s", async (liveState) => {
    await recordLiveCommentObservation({ ...target, liveState })

    expect(mocks.recordLiveObservation).not.toHaveBeenCalled()
  })

  test("a failing write is logged and never fails the comment", async () => {
    mocks.recordLiveObservation.mockRejectedValue(new Error("db down"))

    await expect(
      recordLiveCommentObservation({ ...target, liveState: "live" }),
    ).resolves.toBeUndefined()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    )
  })
})
