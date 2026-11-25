// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const sendPushNotificationsAsync = vi.fn()

vi.mock("expo-server-sdk", () => ({
  Expo: class {
    static isExpoPushToken = (token: string) => token.startsWith("Expo[")
    chunkPushNotifications = (messages: unknown[]) => [messages]
    sendPushNotificationsAsync = sendPushNotificationsAsync
  },
}))
vi.mock("../../src/env", () => ({
  env: { EXPO_PUSH_ENABLED: true, EXPO_ACCESS_TOKEN: undefined },
}))

const get = vi.fn()
const listByWorkspaceId = vi.fn()
const findByUserIds = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  hasWorkspacePermission: (permissions: Record<string, unknown>, key: string) =>
    permissions.superAdmin === true || permissions[key] === true,
  socialPostService: { get },
  workspaceMemberService: { listByWorkspaceId },
  deviceTokenService: { findByUserIds, deleteByTokens: vi.fn() },
  workspaceService: { find: async () => ({ language: "vi" }) },
}))
vi.mock("../../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { notifyPostTarget } = await import(
  "../../src/notification/handlers/notify-post-target"
)
const { workspaceMemberNotificationTypesSchema } = await import(
  "@chatbotx.io/database/partials"
)

const failedJob = {
  type: "notifyPostFailed",
  data: { workspaceId: "ws-1", socialPostId: "p1", targetId: "t1", attempt: 2 },
} as const
const reviewJob = { ...failedJob, type: "notifyPostNeedsReview" } as const

const postWith = (status: string) => ({
  id: "p1",
  targets: [
    {
      id: "t1",
      status,
      errorMessage: "Token rejected",
      destination: { name: "Page A" },
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  get.mockResolvedValue(postWith("failed"))
  listByWorkspaceId.mockResolvedValue([
    {
      userId: "u-wants",
      notificationTypes: { postFailed: true, postNeedsReview: false },
      permissions: { broadcast: true },
    },
    {
      userId: "u-admin",
      notificationTypes: { postFailed: true, postNeedsReview: true },
      permissions: { superAdmin: true },
    },
    {
      userId: "u-no-permission",
      notificationTypes: { postFailed: true, postNeedsReview: true },
      permissions: { broadcast: false },
    },
    {
      userId: "u-muted",
      notificationTypes: { postFailed: false, postNeedsReview: false },
      permissions: { broadcast: true },
    },
    // A row stored before the settings existed: no keys at all.
    {
      userId: "u-old-row",
      notificationTypes: { notifyAdmin: true, newOrder: true },
      permissions: { broadcast: true },
    },
    { userId: "u-unset", notificationTypes: null, permissions: {} },
  ])
  findByUserIds.mockResolvedValue([{ token: "Expo[a]" }])
  sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }])
})

describe("notifyPostTarget recipients", () => {
  test("a failure reaches members who enabled it and may open Posts", async () => {
    await notifyPostTarget(failedJob)
    expect(findByUserIds).toHaveBeenCalledWith({
      userIds: ["u-wants", "u-admin"],
    })
  })

  test("a review request uses its own toggle", async () => {
    get.mockResolvedValue(postWith("needsReview"))
    await notifyPostTarget(reviewJob)
    expect(findByUserIds).toHaveBeenCalledWith({ userIds: ["u-admin"] })
  })
})

describe("notifyPostTarget content", () => {
  test("titles the push in the workspace language and names the destination", async () => {
    await notifyPostTarget(failedJob)
    const [[message]] = sendPushNotificationsAsync.mock.calls[0] as [
      Array<{ title: string; body: string; data: object }>,
    ]
    expect(message.title).toBe("Đăng bài thất bại")
    expect(message.body).toBe("Page A · Token rejected")
    expect(message.data).toEqual({
      workspaceId: "ws-1",
      socialPostId: "p1",
      targetId: "t1",
    })
  })

  test("sends nothing when the target moved on before the job ran", async () => {
    get.mockResolvedValue(postWith("pending"))
    await notifyPostTarget(failedJob)
    expect(listByWorkspaceId).not.toHaveBeenCalled()
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  test("sends nothing for a post deleted before the push", async () => {
    get.mockRejectedValue(
      new ChatbotXException("Post not found", "notFound", 404),
    )
    await notifyPostTarget(failedJob)
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })
})

describe("member notification types stored before the post settings", () => {
  test("still parse, with the new toggles off", () => {
    const parsed = workspaceMemberNotificationTypesSchema.parse({
      notifyAdmin: true,
      newMessageToHuman: true,
      newOrder: false,
    })
    expect(parsed).toMatchObject({ postFailed: false, postNeedsReview: false })
  })
})
