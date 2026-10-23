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

const getDetail = vi.fn()
const listByWorkspaceId = vi.fn()
const findByUserIds = vi.fn()
const deleteByTokens = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  hasWorkspacePermission: (permissions: Record<string, unknown>, key: string) =>
    permissions.superAdmin === true || permissions[key] === true,
  orderService: { getDetail },
  ecommerceSettingsService: {
    get: async () => ({
      payments: {
        currency: "USD",
        currencySymbol: "$",
        currencyPosition: "left",
      },
    }),
  },
  workspaceMemberService: { listByWorkspaceId },
  deviceTokenService: { findByUserIds, deleteByTokens },
  workspaceService: { find: async () => ({ language: "vi" }) },
}))

vi.mock("../../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { notifyNewOrder } = await import(
  "../../src/notification/handlers/notify-new-order"
)

const job = {
  type: "notifyNewOrder",
  data: { workspaceId: "ws-1", orderId: "o1" },
} as const

beforeEach(() => {
  vi.clearAllMocks()
  getDetail.mockResolvedValue({
    id: "o1",
    number: 7,
    currency: "USD",
    total: 30,
    customerName: "An",
  })
  listByWorkspaceId.mockResolvedValue([
    {
      userId: "u-wants",
      notificationTypes: { newOrder: true },
      permissions: { ecommerce: true },
    },
    {
      userId: "u-admin",
      notificationTypes: { newOrder: true },
      permissions: { superAdmin: true },
    },
    {
      userId: "u-no-permission",
      notificationTypes: { newOrder: true },
      permissions: { ecommerce: false },
    },
    {
      userId: "u-muted",
      notificationTypes: { newOrder: false },
      permissions: { ecommerce: true },
    },
    { userId: "u-unset", notificationTypes: null, permissions: {} },
  ])
  findByUserIds.mockResolvedValue([{ token: "Expo[a]" }])
  sendPushNotificationsAsync.mockResolvedValue([{ status: "ok" }])
})

describe("notifyNewOrder", () => {
  test("pushes only to members who turned on new orders and may see orders", async () => {
    await notifyNewOrder(job)
    expect(findByUserIds).toHaveBeenCalledWith({
      userIds: ["u-wants", "u-admin"],
    })
  })

  test("titles the push with the order number in the workspace language", async () => {
    await notifyNewOrder(job)
    const [[message]] = sendPushNotificationsAsync.mock.calls[0] as [
      Array<{ title: string; body: string; data: object }>,
    ]
    expect(message.title).toBe("Đơn hàng mới #7")
    expect(message.body).toContain("An")
    expect(message.body).toContain("30")
    expect(message.data).toEqual({ workspaceId: "ws-1", orderId: "o1" })
  })

  test("does nothing for an order deleted before the push", async () => {
    getDetail.mockRejectedValue(
      new ChatbotXException("Order does not exist.", "notFound", 404),
    )
    await notifyNewOrder(job)
    expect(listByWorkspaceId).not.toHaveBeenCalled()
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })
})
