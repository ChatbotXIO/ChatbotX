import { beforeEach, describe, expect, test, vi } from "vitest"
import enMessages from "../messages/en.json"

const mocks = vi.hoisted(() => ({
  mockEnsureFirstForOwner: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    ensureFirstForOwner: mocks.mockEnsureFirstForOwner,
  },
}))
vi.mock("next/navigation", () => ({ redirect: mocks.mockRedirect }))

const { ChatbotXException, workspaceLimitReachedException } = await import(
  "@chatbotx.io/business/errors"
)
const {
  CREATE_CHANNEL_ERROR_MESSAGE_KEYS,
  createFirstWorkspace,
  ensureFirstWorkspace,
  isCreateChannelErrorCode,
} = await import("../src/lib/workspace/create-first-workspace")

function hasKey(key: string): boolean {
  let node: unknown = enMessages
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return false
    }
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string"
}

describe("create-first-workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("every error code maps to a message key that exists in en.json", () => {
    for (const key of Object.values(CREATE_CHANNEL_ERROR_MESSAGE_KEYS)) {
      expect(hasKey(key), key).toBe(true)
    }
  })

  test("recognises only the listed codes, never prototype members", () => {
    expect(isCreateChannelErrorCode("workspaceLimitReached")).toBe(true)
    expect(isCreateChannelErrorCode("sessionExpired")).toBe(true)
    expect(isCreateChannelErrorCode("toString")).toBe(false)
    expect(isCreateChannelErrorCode(undefined)).toBe(false)
  })

  test("delegates to the owner-locked service and returns its workspace", async () => {
    mocks.mockEnsureFirstForOwner.mockResolvedValue({ id: "ws-new" })

    await expect(createFirstWorkspace("user-1")).resolves.toEqual({
      id: "ws-new",
    })
    expect(mocks.mockEnsureFirstForOwner).toHaveBeenCalledWith({
      ownerId: "user-1",
      name: "New Workspace",
      tx: undefined,
      quotaConsumption: undefined,
    })
  })

  test("ensureFirstWorkspace passes a custom name through", async () => {
    mocks.mockEnsureFirstForOwner.mockResolvedValue({ id: "ws-1" })

    await ensureFirstWorkspace("user-1", { name: "Ann's workspace" })
    expect(mocks.mockEnsureFirstForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ann's workspace" }),
    )
  })

  test("ensureFirstWorkspace returns null on a plan-limit failure instead of redirecting", async () => {
    mocks.mockEnsureFirstForOwner.mockRejectedValue(
      workspaceLimitReachedException(),
    )

    await expect(ensureFirstWorkspace("user-1")).resolves.toBeNull()
    expect(mocks.mockRedirect).not.toHaveBeenCalled()
  })

  test("ensureFirstWorkspace rethrows unknown failures", async () => {
    mocks.mockEnsureFirstForOwner.mockRejectedValue(new Error("db down"))

    await expect(ensureFirstWorkspace("user-1")).rejects.toThrow("db down")
  })

  test("redirects to /channels/create?error=… on a plan-limit failure", async () => {
    mocks.mockEnsureFirstForOwner.mockRejectedValue(
      workspaceLimitReachedException(),
    )

    await expect(createFirstWorkspace("user-1")).rejects.toThrow(
      "redirect:/channels/create?error=workspaceLimitReached",
    )
  })

  test("rethrows any other failure untouched, including unlisted ChatbotXException codes", async () => {
    mocks.mockEnsureFirstForOwner.mockRejectedValueOnce(new Error("db down"))
    await expect(createFirstWorkspace("user-1")).rejects.toThrow("db down")

    mocks.mockEnsureFirstForOwner.mockRejectedValueOnce(
      new ChatbotXException("boom", "systemError"),
    )
    await expect(createFirstWorkspace("user-1")).rejects.toThrow("boom")

    expect(mocks.mockRedirect).not.toHaveBeenCalled()
  })
})
