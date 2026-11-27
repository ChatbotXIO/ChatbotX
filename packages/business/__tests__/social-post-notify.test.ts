import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  queueEvent: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  NotificationJobAction: {
    notifyPostFailed: "notifyPostFailed",
    notifyPostNeedsReview: "notifyPostNeedsReview",
  },
  getPostNotificationJobId: (action: string, targetId: string, n: number) =>
    `social-post-${action}-${targetId}-${n}`,
  notificationQueue: { add: mocks.add },
}))
vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mocks.queueEvent,
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}))

const { announceSettledTarget, emitSocialPostChanged } = await import(
  "../src/social-post/notify"
)

const target = {
  attemptCount: 3,
  id: "t-1",
  socialPostId: "p-1",
  workspaceId: "ws-1",
}
const error = { category: "unknown", code: "x", message: "boom" } as const

beforeEach(() => {
  vi.resetAllMocks()
  mocks.queueEvent.mockResolvedValue(undefined)
  mocks.add.mockResolvedValue(undefined)
})

describe("emitSocialPostChanged", () => {
  test("publishes a workspace event with ids and status only", async () => {
    await emitSocialPostChanged({
      socialPostId: "p-1",
      status: "scheduled",
      workspaceId: "ws-1",
    })

    expect(mocks.queueEvent).toHaveBeenCalledWith("ws-1", {
      data: { socialPostId: "p-1", status: "scheduled" },
      eventType: "socialPostChanged",
    })
  })

  test("a failing publish is swallowed and logged", async () => {
    mocks.queueEvent.mockRejectedValue(new Error("redis down"))

    await expect(
      emitSocialPostChanged({
        socialPostId: "p-1",
        status: "draft",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalled()
  })
})

describe("announceSettledTarget", () => {
  test("a published result emits the event and pushes nothing", async () => {
    await announceSettledTarget(target, {
      externalPostId: "x",
      kind: "published",
      permalink: null,
      publishedAt: new Date(),
    })

    expect(mocks.queueEvent.mock.calls[0]?.[1].data).toEqual({
      socialPostId: "p-1",
      status: "published",
      targetId: "t-1",
    })
    expect(mocks.add).not.toHaveBeenCalled()
  })

  test("a retry is only an event: the post will be tried again", async () => {
    await announceSettledTarget(target, {
      error: null,
      kind: "retry",
      nextAttemptAt: new Date(),
    })

    expect(mocks.queueEvent.mock.calls[0]?.[1].data.status).toBe("pending")
    expect(mocks.add).not.toHaveBeenCalled()
  })

  test("failed pushes with a job id fixed per target and attempt", async () => {
    await announceSettledTarget(target, { error, kind: "failed" })
    await announceSettledTarget(target, { error, kind: "failed" })

    expect(mocks.add).toHaveBeenCalledTimes(2)
    const [name, payload, options] = mocks.add.mock.calls[0] ?? []
    expect(name).toBe("notifyPostFailed")
    expect(payload).toEqual({
      data: {
        attempt: 3,
        socialPostId: "p-1",
        targetId: "t-1",
        workspaceId: "ws-1",
      },
      type: "notifyPostFailed",
    })
    expect(options).toEqual({ jobId: "social-post-notifyPostFailed-t-1-3" })
    expect(mocks.add.mock.calls[1]?.[2]).toEqual(options)
  })

  test("needsReview pushes the review job", async () => {
    await announceSettledTarget(target, { error, kind: "needsReview" })

    expect(mocks.add.mock.calls[0]?.[0]).toBe("notifyPostNeedsReview")
  })

  test("a failing event and a failing enqueue never throw", async () => {
    mocks.queueEvent.mockRejectedValue(new Error("redis down"))
    mocks.add.mockRejectedValue(new Error("queue down"))

    await expect(
      announceSettledTarget(target, { error, kind: "failed" }),
    ).resolves.toBeUndefined()
  })
})
