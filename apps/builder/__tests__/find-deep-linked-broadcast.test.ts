import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ findByIdOrName: vi.fn() }))

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { findByIdOrName: mocks.findByIdOrName },
}))

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { broadcastDetailHref } from "@/features/broadcasts/lib/broadcast-links"
import { findDeepLinkedBroadcast } from "@/features/broadcasts/queries/find-deep-linked-broadcast"

describe("findDeepLinkedBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the broadcast of this workspace that the id names", async () => {
    mocks.findByIdOrName.mockResolvedValueOnce({ id: "55", name: "Sale" })

    const result = await findDeepLinkedBroadcast({
      workspaceId: "7",
      broadcastId: "55",
    })

    expect(result).toEqual({ id: "55", name: "Sale" })
    expect(mocks.findByIdOrName).toHaveBeenCalledWith({
      workspaceId: "7",
      idOrName: "55",
    })
  })

  test.each([
    ["a name", "Black Friday"],
    ["an empty value", ""],
    ["zero", "0"],
    ["a negative number", "-3"],
    ["a number past the bigint range", "99999999999999999999"],
  ])("never looks up %s: a link carries an id, not a broadcast name", async (_label, broadcastId) => {
    const result = await findDeepLinkedBroadcast({
      workspaceId: "7",
      broadcastId,
    })

    expect(result).toBeNull()
    expect(mocks.findByIdOrName).not.toHaveBeenCalled()
  })

  test("a broadcast that is deleted or from another workspace is null, not an error", async () => {
    mocks.findByIdOrName.mockRejectedValueOnce(
      new ChatbotXException("Broadcast not found", "notFound", 404),
    )

    expect(
      await findDeepLinkedBroadcast({ workspaceId: "7", broadcastId: "55" }),
    ).toBeNull()
  })

  test("any other failure is not hidden as a missing broadcast", async () => {
    mocks.findByIdOrName.mockRejectedValueOnce(new Error("database down"))

    await expect(
      findDeepLinkedBroadcast({ workspaceId: "7", broadcastId: "55" }),
    ).rejects.toThrow("database down")
  })
})

describe("broadcastDetailHref", () => {
  test("points at the workspace's broadcasts list with the detail dialog asked open", () => {
    expect(broadcastDetailHref("7", "55")).toBe(
      "/space/7/broadcasts?broadcastId=55",
    )
  })
})
