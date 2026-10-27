// @vitest-environment node

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listWorkspaceMembers: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  pipelineItemRepository: {},
  pipelineReferenceRepository: {
    listWorkspaceMembers: mocks.listWorkspaceMembers,
    listInboxTeamIds: vi.fn(),
  },
}))

const { primaryFromSets } = await import("../src/pipeline/item-assignees")

const tx = {} as DatabaseClient

describe("primaryFromSets", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("follows the first member that resolves to a user", async () => {
    mocks.listWorkspaceMembers.mockResolvedValue([{ userId: "9" }])

    expect(
      await primaryFromSets(
        "ws-1",
        { workspaceMemberIds: ["m-1"], inboxTeamIds: ["t-1"] },
        tx,
      ),
    ).toBe("u_9")
  })

  test("falls through to the first team when the first member no longer resolves", async () => {
    mocks.listWorkspaceMembers.mockResolvedValue([])

    expect(
      await primaryFromSets(
        "ws-1",
        { workspaceMemberIds: ["m-1"], inboxTeamIds: ["t-1"] },
        tx,
      ),
    ).toBe("t_t-1")
  })

  test("is null when nobody is assigned", async () => {
    expect(
      await primaryFromSets(
        "ws-1",
        { workspaceMemberIds: [], inboxTeamIds: [] },
        tx,
      ),
    ).toBeNull()
    expect(mocks.listWorkspaceMembers).not.toHaveBeenCalled()
  })
})
