// @vitest-environment jsdom

import { QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
import { useContactAssigneeMultiSelectOptions } from "../user-hook"

const { members, teams } = vi.hoisted(() => ({
  members: vi.fn(),
  teams: vi.fn(),
}))

vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    workspaceMembersAPI: { listWorkspaceMembersAuthenticatedAPI: members },
    inboxTeamsAPI: { listInboxTeamsAuthenticatedAPI: teams },
  },
}))

type Groups = ReturnType<typeof useContactAssigneeMultiSelectOptions>

async function render(
  config?: Parameters<typeof useContactAssigneeMultiSelectOptions>[0],
): Promise<Groups> {
  members.mockResolvedValue({
    data: [{ id: "m1", user: { id: "u1", name: "Ann" } }],
    pageCount: 1,
  })
  teams.mockResolvedValue({ data: [{ id: "t1", name: "Sales" }] })
  let latest: Groups = []
  function Probe() {
    latest = useContactAssigneeMultiSelectOptions(config)
    return null
  }
  const root = createRoot(document.createElement("div"))
  const client = makeQueryClient()
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    )
  })
  await vi.waitFor(() => {
    expect(latest[0]?.options).toHaveLength(1)
  })
  act(() => root.unmount())
  return latest
}

describe("useContactAssigneeMultiSelectOptions", () => {
  test("keeps the English headings and user-id values by default", async () => {
    const groups = await render()
    expect(groups.map((group) => group.heading)).toEqual([
      "Agents",
      "Inbox Teams",
    ])
    expect(groups[0]?.options[0]?.value).toBe("u_u1")
    expect(groups[1]?.options[0]?.value).toBe("t_t1")
  })

  test("uses translated group labels and member ids when asked", async () => {
    const groups = await render({
      groupLabels: { agents: "Agentes", teams: "Equipos" },
      agentValue: "memberId",
    })
    expect(groups.map((group) => group.heading)).toEqual(["Agentes", "Equipos"])
    expect(groups[0]?.options[0]?.value).toBe("u_m1")
  })
})
