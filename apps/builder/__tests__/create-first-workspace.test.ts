import { beforeEach, describe, expect, test, vi } from "vitest"
import enMessages from "../messages/en.json"

const mocks = vi.hoisted(() => ({
  mockWorkspaceCreate: vi.fn(),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { create: mocks.mockWorkspaceCreate },
}))
vi.mock("next/navigation", () => ({ redirect: mocks.mockRedirect }))

const { ChatbotXException, workspaceLimitReachedException } = await import(
  "@chatbotx.io/business/errors"
)
const {
  CREATE_CHANNEL_ERROR_MESSAGE_KEYS,
  createFirstWorkspace,
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
    expect(isCreateChannelErrorCode("toString")).toBe(false)
    expect(isCreateChannelErrorCode(undefined)).toBe(false)
  })

  test("returns the created workspace on success", async () => {
    mocks.mockWorkspaceCreate.mockResolvedValue({ id: "ws-new" })

    await expect(createFirstWorkspace("user-1")).resolves.toEqual({
      id: "ws-new",
    })
    expect(mocks.mockWorkspaceCreate).toHaveBeenCalledWith({
      data: { name: "New Workspace", ownerId: "user-1" },
      createdBy: "user-1",
    })
  })

  test("redirects to /channels/create?error=… on a plan-limit failure", async () => {
    mocks.mockWorkspaceCreate.mockRejectedValue(
      workspaceLimitReachedException(),
    )

    await expect(createFirstWorkspace("user-1")).rejects.toThrow(
      "redirect:/channels/create?error=workspaceLimitReached",
    )
  })

  test("rethrows any other failure untouched, including unlisted ChatbotXException codes", async () => {
    mocks.mockWorkspaceCreate.mockRejectedValueOnce(new Error("db down"))
    await expect(createFirstWorkspace("user-1")).rejects.toThrow("db down")

    mocks.mockWorkspaceCreate.mockRejectedValueOnce(
      new ChatbotXException("boom", "systemError"),
    )
    await expect(createFirstWorkspace("user-1")).rejects.toThrow("boom")

    expect(mocks.mockRedirect).not.toHaveBeenCalled()
  })
})
