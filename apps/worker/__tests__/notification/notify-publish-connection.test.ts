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

const getDestination = vi.fn()
const getAccount = vi.fn()
const listByWorkspaceId = vi.fn()
const findByUserIds = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  hasWorkspacePermission: (permissions: Record<string, unknown>, key: string) =>
    permissions.superAdmin === true || permissions[key] === true,
  publishDestinationService: { get: getDestination },
  socialAccountService: { get: getAccount },
  workspaceMemberService: { listByWorkspaceId },
  deviceTokenService: { findByUserIds, deleteByTokens: vi.fn() },
  workspaceService: { find: async () => ({ language: "vi" }) },
}))
vi.mock("../../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { notifyPublishConnection } = await import(
  "../../src/notification/handlers/notify-publish-connection"
)
const { workspaceMemberNotificationTypesSchema } = await import(
  "@chatbotx.io/database/partials"
)

const job = (
  alert: "needsReconnect" | "permissionMissing" | "paused",
  subject: { publishDestinationId?: string; socialAccountId?: string } = {
    publishDestinationId: "d1",
  },
) =>
  ({
    type: "notifyPublishConnection",
    data: { workspaceId: "ws-1", alert, transitionKey: "k", ...subject },
  }) as const

const destination = (overrides: Record<string, unknown> = {}) => ({
  name: "Page A",
  username: null,
  pausedUntil: null,
  state: "needsReconnect",
  ...overrides,
})

const pushed = () =>
  (
    sendPushNotificationsAsync.mock.calls[0] as [
      Array<{ title: string; body: string; data: object }>,
    ]
  )[0][0]

beforeEach(() => {
  vi.clearAllMocks()
  getDestination.mockResolvedValue(destination())
  listByWorkspaceId.mockResolvedValue([
    {
      userId: "u-wants",
      notificationTypes: { publishConnection: true },
      permissions: { broadcast: true },
    },
    {
      userId: "u-admin",
      notificationTypes: { publishConnection: true },
      permissions: { superAdmin: true },
    },
    {
      userId: "u-no-permission",
      notificationTypes: { publishConnection: true },
      permissions: { broadcast: false },
    },
    {
      userId: "u-muted",
      notificationTypes: { publishConnection: false },
      permissions: { broadcast: true },
    },
    {
      userId: "u-old-row",
      notificationTypes: { notifyAdmin: true },
      permissions: { broadcast: true },
    },
  ])
  findByUserIds.mockResolvedValue([{ token: "Expo[a]" }])
  sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }])
})

describe("notifyPublishConnection", () => {
  test("reaches members who turned it on and hold the Posts permission", async () => {
    await notifyPublishConnection(job("needsReconnect"))
    expect(findByUserIds).toHaveBeenCalledWith({
      userIds: ["u-wants", "u-admin"],
    })
  })

  test("titles the push in the workspace language and names the destination", async () => {
    await notifyPublishConnection(job("needsReconnect"))
    expect(pushed().title).toBe("Kết nối đăng bài cần được kết nối lại")
    expect(pushed().body).toBe("Page A")
    expect(pushed().data).toEqual({
      alert: "needsReconnect",
      publishDestinationId: "d1",
      workspaceId: "ws-1",
    })
  })

  test("a missing permission has its own title", async () => {
    getDestination.mockResolvedValue(
      destination({ state: "permissionMissing" }),
    )
    await notifyPublishConnection(job("permissionMissing"))
    expect(pushed().title).toBe("Thiếu quyền đăng bài")
  })

  test("a pause still running is announced, an elapsed one is not", async () => {
    getDestination.mockResolvedValue(
      destination({
        pausedUntil: new Date(Date.now() + 60_000),
        state: "ready",
      }),
    )
    await notifyPublishConnection(job("paused"))
    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(1)

    sendPushNotificationsAsync.mockClear()
    getDestination.mockResolvedValue(
      destination({
        pausedUntil: new Date(Date.now() - 60_000),
        state: "ready",
      }),
    )
    await notifyPublishConnection(job("paused"))
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  test("sends nothing when the connection recovered before the job ran", async () => {
    getDestination.mockResolvedValue(destination({ state: "ready" }))
    await notifyPublishConnection(job("needsReconnect"))
    expect(listByWorkspaceId).not.toHaveBeenCalled()
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  test("a TikTok login needing reauth is announced by its account name", async () => {
    getAccount.mockResolvedValue({
      displayName: "My TikTok",
      status: "needsReauth",
    })
    await notifyPublishConnection(
      job("needsReconnect", { socialAccountId: "a1" }),
    )
    expect(pushed().body).toBe("My TikTok")
    expect(pushed().data).toMatchObject({ socialAccountId: "a1" })
  })

  test("sends nothing for a connection deleted before the push", async () => {
    getDestination.mockRejectedValue(
      new ChatbotXException("Destination not found", "notFound", 404),
    )
    await notifyPublishConnection(job("needsReconnect"))
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })
})

describe("member notification types stored before the setting", () => {
  test("parse with the connection toggle off", () => {
    const parsed = workspaceMemberNotificationTypesSchema.parse({
      notifyAdmin: true,
      newMessageToHuman: true,
      newOrder: false,
    })
    expect(parsed).toMatchObject({ publishConnection: false })
  })
})
