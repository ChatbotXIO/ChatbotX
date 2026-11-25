import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ add: vi.fn(), warn: vi.fn() }))

vi.mock("@chatbotx.io/worker-config", () => ({
  NotificationJobAction: { notifyPublishConnection: "notifyPublishConnection" },
  getPublishConnectionNotificationJobId: (input: {
    alert: string
    subjectId: string
    transitionKey: string
  }) =>
    `publish-connection-${input.alert}-${input.subjectId}-${input.transitionKey}`,
  notificationQueue: { add: mocks.add },
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}))

const { announcePublishConnectionAttention } = await import(
  "../src/publish-destination/notify-attention"
)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.add.mockResolvedValue(undefined)
})

describe("announcePublishConnectionAttention", () => {
  test("queues one push with a job id fixed per connection, alert and transition", async () => {
    await announcePublishConnectionAttention({
      alert: "needsReconnect",
      publishDestinationId: "d1",
      transitionKey: "fp",
      workspaceId: "ws-1",
    })
    expect(mocks.add).toHaveBeenCalledWith(
      "notifyPublishConnection",
      {
        data: {
          alert: "needsReconnect",
          publishDestinationId: "d1",
          transitionKey: "fp",
          workspaceId: "ws-1",
        },
        type: "notifyPublishConnection",
      },
      { jobId: "publish-connection-needsReconnect-d1-fp" },
    )
  })

  test("a TikTok login is keyed by its account id", async () => {
    await announcePublishConnectionAttention({
      alert: "permissionMissing",
      socialAccountId: "a1",
      transitionKey: "t",
      workspaceId: "ws-1",
    })
    expect(mocks.add.mock.calls[0]?.[2]).toEqual({
      jobId: "publish-connection-permissionMissing-a1-t",
    })
  })

  test("a queue failure is logged and never thrown", async () => {
    mocks.add.mockRejectedValue(new Error("redis down"))
    await expect(
      announcePublishConnectionAttention({
        alert: "paused",
        publishDestinationId: "d1",
        transitionKey: "1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalled()
  })

  test("nothing is queued without a subject", async () => {
    await announcePublishConnectionAttention({
      alert: "paused",
      transitionKey: "1",
      workspaceId: "ws-1",
    })
    expect(mocks.add).not.toHaveBeenCalled()
  })
})
