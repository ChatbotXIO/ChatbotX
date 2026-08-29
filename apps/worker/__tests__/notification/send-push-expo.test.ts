// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const chunkPushNotifications = vi.fn(
  (messages: { to: string }[]): { to: string }[][] => {
    const chunks: { to: string }[][] = []
    for (let i = 0; i < messages.length; i += 2) {
      chunks.push(messages.slice(i, i + 2))
    }
    return chunks
  },
)
const sendPushNotificationsAsync = vi.fn()
const isExpoPushToken = vi.fn(
  (token: string) => typeof token === "string" && token.startsWith("Expo["),
)

vi.mock("expo-server-sdk", () => ({
  Expo: class {
    static isExpoPushToken = isExpoPushToken
    chunkPushNotifications = chunkPushNotifications
    sendPushNotificationsAsync = sendPushNotificationsAsync
  },
}))

vi.mock("../../src/env", () => ({
  env: { EXPO_PUSH_ENABLED: true, EXPO_ACCESS_TOKEN: undefined },
}))

const findByOrFail = vi.fn().mockResolvedValue({
  id: "conv-1",
  assignedUserId: "user-1",
  contactId: "contact-1",
})
const listUserIdsByWorkspaceId = vi.fn().mockResolvedValue(["user-1"])
const findByUserIds = vi.fn()
const deleteByTokens = vi.fn().mockResolvedValue(undefined)
const contactFindById = vi.fn().mockResolvedValue({ fullName: "Jane Doe" })
const workspaceFind = vi.fn().mockResolvedValue({ language: "en" })

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { findByOrFail },
  workspaceMemberService: { listUserIdsByWorkspaceId },
  deviceTokenService: { findByUserIds, deleteByTokens },
  contactService: { findById: contactFindById },
  workspaceService: { find: workspaceFind },
}))

vi.mock("../../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}))

const { sendPushForNotificationJob } = await import(
  "../../src/notification/handlers/send-push"
)

const baseJob = () =>
  ({
    type: "notifyIncomingMessage",
    data: {
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "msg-1",
      messageText: "Hello",
    },
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  isExpoPushToken.mockImplementation(
    (token: string) => typeof token === "string" && token.startsWith("Expo["),
  )
  chunkPushNotifications.mockImplementation(
    (messages: { to: string }[]): { to: string }[][] => {
      const chunks: { to: string }[][] = []
      for (let i = 0; i < messages.length; i += 2) {
        chunks.push(messages.slice(i, i + 2))
      }
      return chunks
    },
  )
  findByOrFail.mockResolvedValue({
    id: "conv-1",
    assignedUserId: "user-1",
    contactId: "contact-1",
  })
  contactFindById.mockResolvedValue({ fullName: "Jane Doe" })
  workspaceFind.mockResolvedValue({ language: "en" })
  deleteByTokens.mockResolvedValue(undefined)
})

describe("sendPushForNotificationJob", () => {
  test("sends a message with non-empty title and body", async () => {
    findByUserIds.mockResolvedValue([{ token: "Expo[token-1]" }])
    sendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }])

    await sendPushForNotificationJob(baseJob())

    expect(sendPushNotificationsAsync).toHaveBeenCalledOnce()
    const sentMessages = sendPushNotificationsAsync.mock.calls[0][0]
    expect(sentMessages[0].title).toBe("Jane Doe")
    expect(sentMessages[0].body).toBe("Hello")
  })

  test("prunes a token whose ticket reports DeviceNotRegistered", async () => {
    findByUserIds.mockResolvedValue([{ token: "Expo[stale-token]" }])
    sendPushNotificationsAsync.mockResolvedValue([
      {
        status: "error",
        message: "not registered",
        details: { error: "DeviceNotRegistered" },
      },
    ])

    await sendPushForNotificationJob(baseJob())

    expect(deleteByTokens).toHaveBeenCalledWith({
      tokens: ["Expo[stale-token]"],
    })
  })

  test("filters out and prunes an invalid-format token without sending it", async () => {
    findByUserIds.mockResolvedValue([{ token: "placeholder-legacy-token" }])

    await sendPushForNotificationJob(baseJob())

    expect(deleteByTokens).toHaveBeenCalledWith({
      tokens: ["placeholder-legacy-token"],
    })
    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  test("correlates tickets to tokens by index within each chunk", async () => {
    findByUserIds.mockResolvedValue([
      { token: "Expo[token-1]" },
      { token: "Expo[token-2]" },
      { token: "Expo[token-3]" },
    ])
    sendPushNotificationsAsync
      .mockResolvedValueOnce([
        { status: "ok", id: "r1" },
        {
          status: "error",
          message: "not registered",
          details: { error: "DeviceNotRegistered" },
        },
      ])
      .mockResolvedValueOnce([
        {
          status: "error",
          message: "not registered",
          details: { error: "DeviceNotRegistered" },
        },
      ])

    await sendPushForNotificationJob(baseJob())

    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(2)
    expect(deleteByTokens).toHaveBeenCalledWith({
      tokens: ["Expo[token-2]", "Expo[token-3]"],
    })
  })

  test("a throwing chunk does not prevent the other chunk from sending", async () => {
    findByUserIds.mockResolvedValue([
      { token: "Expo[token-1]" },
      { token: "Expo[token-2]" },
      { token: "Expo[token-3]" },
    ])
    sendPushNotificationsAsync
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce([{ status: "ok", id: "r1" }])

    await expect(sendPushForNotificationJob(baseJob())).resolves.toBeUndefined()
    expect(sendPushNotificationsAsync).toHaveBeenCalledTimes(2)
  })

  test("returns early when EXPO_PUSH_ENABLED is false", async () => {
    vi.resetModules()
    vi.doMock("../../src/env", () => ({
      env: { EXPO_PUSH_ENABLED: false, EXPO_ACCESS_TOKEN: undefined },
    }))
    const { sendPushForNotificationJob: sendWithDisabled } = await import(
      "../../src/notification/handlers/send-push"
    )

    await sendWithDisabled(baseJob())

    expect(findByUserIds).not.toHaveBeenCalled()
  })

  test("returns early when there are no device tokens", async () => {
    findByUserIds.mockResolvedValue([])

    await sendPushForNotificationJob(baseJob())

    expect(sendPushNotificationsAsync).not.toHaveBeenCalled()
  })

  test("degrades to default-locale content instead of throwing when the workspace was purged", async () => {
    workspaceFind.mockResolvedValue(undefined)
    findByUserIds.mockResolvedValue([{ token: "Expo[token-1]" }])
    sendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }])

    await expect(sendPushForNotificationJob(baseJob())).resolves.toBeUndefined()

    expect(sendPushNotificationsAsync).toHaveBeenCalledOnce()
    const sentMessages = sendPushNotificationsAsync.mock.calls[0][0]
    expect(sentMessages[0].body).toBe("Hello")
  })

  test("excludes the acting user from notifyIncomingMessage recipients", async () => {
    findByOrFail.mockResolvedValue({
      id: "conv-1",
      assignedUserId: null,
      contactId: "contact-1",
    })
    listUserIdsByWorkspaceId.mockResolvedValue(["user-1", "user-2"])
    findByUserIds.mockResolvedValue([{ token: "Expo[token-2]" }])
    sendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }])

    await sendPushForNotificationJob({
      type: "notifyIncomingMessage",
      data: {
        workspaceId: "ws-1",
        conversationId: "conv-1",
        messageId: "msg-1",
        messageText: "Hello",
        excludeUserId: "user-1",
      },
    } as never)

    expect(findByUserIds).toHaveBeenCalledWith({ userIds: ["user-2"] })
  })
})
