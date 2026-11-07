// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { get } = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/features/polls/lib/operations", () => ({
  pollOperations: { get, list: vi.fn() },
}))

const { findPoll } = await import("@/features/polls/queries")

describe("findPoll", () => {
  beforeEach(() => {
    get.mockReset()
  })

  test("returns the poll", async () => {
    get.mockResolvedValue({ id: "p1" })
    await expect(findPoll({ workspaceId: "w1", id: "p1" })).resolves.toEqual({
      id: "p1",
    })
  })

  test("returns undefined when the poll does not exist", async () => {
    get.mockRejectedValue(
      new ChatbotXException("Poll not found", "notFound", 404),
    )
    await expect(
      findPoll({ workspaceId: "w1", id: "p1" }),
    ).resolves.toBeUndefined()
  })

  test("rethrows any other failure instead of turning it into a 404", async () => {
    const failure = new Error("connection refused")
    get.mockRejectedValue(failure)
    await expect(findPoll({ workspaceId: "w1", id: "p1" })).rejects.toBe(
      failure,
    )
  })
})
