// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listChannelOptionsByWorkspace: vi.fn(),
  listByWorkspaceId: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    listChannelOptionsByWorkspace: mocks.listChannelOptionsByWorkspace,
  },
  workspaceMemberService: { listByWorkspaceId: mocks.listByWorkspaceId },
}))

const { listCallFilterOptions } = await import(
  "../src/features/whatsapp-calls/queries/list-call-filter-options.query"
)

const WORKSPACE_ID = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  // The repository/service layer now filters by channel at the query
  // level (never returns a non-whatsapp inbox in the first place).
  mocks.listChannelOptionsByWorkspace.mockResolvedValue([
    { id: "inbox-1", name: "Support" },
    { id: "inbox-2", name: "Sales calls" },
  ])
  mocks.listByWorkspaceId.mockResolvedValue([
    { user: { id: "user-1", name: "Alice", email: "alice@example.com" } },
    { user: { id: "user-2", name: null, email: "bob@example.com" } },
  ])
})

describe("listCallFilterOptions", () => {
  test("requests only whatsapp-channel inbox options from the service", async () => {
    const result = await listCallFilterOptions({
      workspaceId: WORKSPACE_ID,
      includeAgents: false,
    })

    expect(mocks.listChannelOptionsByWorkspace).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      channel: "whatsapp",
    })
    expect(result.inboxOptions).toEqual([
      { id: "inbox-1", name: "Support" },
      { id: "inbox-2", name: "Sales calls" },
    ])
  })

  test("skips the workspace member read entirely when includeAgents is false", async () => {
    const result = await listCallFilterOptions({
      workspaceId: WORKSPACE_ID,
      includeAgents: false,
    })

    expect(mocks.listByWorkspaceId).not.toHaveBeenCalled()
    expect(result.agentOptions).toEqual([])
  })

  test("returns agent options (name falling back to email) when includeAgents is true", async () => {
    const result = await listCallFilterOptions({
      workspaceId: WORKSPACE_ID,
      includeAgents: true,
    })

    expect(mocks.listByWorkspaceId).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
    })
    expect(result.agentOptions).toEqual([
      { id: "user-1", name: "Alice" },
      { id: "user-2", name: "bob@example.com" },
    ])
  })
})
