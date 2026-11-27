import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { put: mocks.put, get: mocks.get },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.warn },
}))

const { MESSAGE_STATUS_BRANCH_TTL_SECONDS, messageStatusBranchService } =
  await import("../src/message-status-branch")

const message = { channel: "whatsapp", providerMessageId: "wamid.1" }
const KEY = "msg-status-branch:whatsapp:wamid.1"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("messageStatusBranchService.mark", () => {
  test("stores the branching statuses under a channel-scoped key for 24 hours", async () => {
    mocks.put.mockResolvedValue(undefined)

    await messageStatusBranchService.mark({
      ...message,
      statuses: ["delivered"],
    })

    expect(mocks.put).toHaveBeenCalledWith(
      KEY,
      ["delivered"],
      MESSAGE_STATUS_BRANCH_TTL_SECONDS,
    )
    expect(MESSAGE_STATUS_BRANCH_TTL_SECONDS).toBe(86_400)
  })

  test("swallows a Redis failure and logs it", async () => {
    const err = new Error("redis down")
    mocks.put.mockRejectedValue(err)

    await expect(
      messageStatusBranchService.mark({ ...message, statuses: ["failed"] }),
    ).resolves.toBeUndefined()
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err, providerMessageId: "wamid.1" }),
      expect.any(String),
    )
  })
})

describe("messageStatusBranchService.continuesFlow", () => {
  test.each([
    ["delivered", ["delivered"], true],
    ["failed", ["delivered"], false],
    ["failed", ["delivered", "failed"], true],
    ["read", ["delivered", "failed"], false],
  ] as const)("a %s status of a message marked %j continues the flow: %s", async (status, statuses, expected) => {
    mocks.get.mockResolvedValue(statuses)

    await expect(
      messageStatusBranchService.continuesFlow({ ...message, status }),
    ).resolves.toBe(expected)
    expect(mocks.get).toHaveBeenCalledWith(KEY)
  })

  test.each([
    null,
    "not-a-list",
  ])("is false when the marker is missing or not a list (%s)", async (stored) => {
    mocks.get.mockResolvedValue(stored)

    await expect(
      messageStatusBranchService.continuesFlow({
        ...message,
        status: "delivered",
      }),
    ).resolves.toBe(false)
  })

  test("fails open to bookkeeping routing on a Redis error", async () => {
    const err = new Error("redis down")
    mocks.get.mockRejectedValue(err)

    await expect(
      messageStatusBranchService.continuesFlow({
        ...message,
        status: "delivered",
      }),
    ).resolves.toBe(false)
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      expect.any(String),
    )
  })
})
