// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const getPushNotificationReceiptsAsync = vi.fn()
vi.mock("expo-server-sdk", () => ({
  Expo: class {
    static isExpoPushToken = () => true
    chunkPushNotificationReceiptIds = (ids: string[]) => [ids]
    getPushNotificationReceiptsAsync = getPushNotificationReceiptsAsync
  },
}))

vi.mock("../../src/env", () => ({
  env: { EXPO_PUSH_ENABLED: true, EXPO_ACCESS_TOKEN: undefined },
}))

const deleteByTokens = vi.fn().mockResolvedValue(undefined)
vi.mock("@chatbotx.io/business", () => ({
  deviceTokenService: { deleteByTokens },
}))

const loggerWarn = vi.fn()
vi.mock("../../src/lib/logger", () => ({
  logger: { warn: loggerWarn, info: vi.fn() },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  NotificationJobAction: {},
  PUSH_RECEIPT_DELAY_MS: 900_000,
  notificationQueue: { add: vi.fn() },
}))

const { checkPushReceipts } = await import(
  "../../src/notification/handlers/check-push-receipts"
)

const job = {
  type: "checkPushReceipts",
  data: {
    tickets: [
      { id: "t1", token: "Expo[aaaaaaaa]" },
      { id: "t2", token: "Expo[bbbbbbbb]" },
    ],
  },
} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe("checkPushReceipts", () => {
  test("logs error receipts and prunes only DeviceNotRegistered tokens", async () => {
    getPushNotificationReceiptsAsync.mockResolvedValue({
      t1: {
        status: "error",
        message: "bad creds",
        details: { error: "InvalidCredentials" },
      },
      t2: {
        status: "error",
        message: "gone",
        details: { error: "DeviceNotRegistered" },
      },
    })

    await checkPushReceipts(job)

    expect(loggerWarn).toHaveBeenCalledTimes(2)
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ expoError: "InvalidCredentials" }),
      "Expo push receipt error",
    )
    expect(deleteByTokens).toHaveBeenCalledWith({ tokens: ["Expo[bbbbbbbb]"] })
  })

  test("does nothing for ok receipts", async () => {
    getPushNotificationReceiptsAsync.mockResolvedValue({
      t1: { status: "ok" },
      t2: { status: "ok" },
    })

    await checkPushReceipts(job)

    expect(loggerWarn).not.toHaveBeenCalled()
    expect(deleteByTokens).not.toHaveBeenCalled()
  })

  test("a failing receipt fetch is logged, not thrown", async () => {
    getPushNotificationReceiptsAsync.mockRejectedValue(new Error("boom"))

    await expect(checkPushReceipts(job)).resolves.toBeUndefined()
    expect(loggerWarn).toHaveBeenCalled()
  })
})
