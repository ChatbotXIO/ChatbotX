// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  useInboxTeams,
  useInvalidateUsers,
  useWorkspaceMembers,
} from "../user-hook"

const { mockListWorkspaceMembers, mockListInboxTeams } = vi.hoisted(() => ({
  mockListWorkspaceMembers: vi.fn(),
  mockListInboxTeams: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    workspaceMembersAPI: {
      listWorkspaceMembersAuthenticatedAPI: mockListWorkspaceMembers,
    },
    inboxTeamsAPI: {
      listInboxTeamsAuthenticatedAPI: mockListInboxTeams,
    },
  },
}))

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

function UsersProbe({
  workspaceId = "workspace-1",
  enabled = true,
}: {
  workspaceId?: string
  enabled?: boolean
}) {
  useWorkspaceMembers(workspaceId, { enabled })
  useInboxTeams(workspaceId, { enabled })
  return null
}

function InvalidateProbe({
  onReady,
}: {
  onReady: (fn: () => unknown) => void
}) {
  onReady(useInvalidateUsers())
  return null
}

describe("user query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockListWorkspaceMembers.mockResolvedValue({ data: [], pageCount: 1 })
    mockListInboxTeams.mockResolvedValue({ data: [] })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  test("requests workspace members and inbox teams with store-compatible inputs", async () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsersProbe />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListWorkspaceMembers).toHaveBeenCalledTimes(1)
      expect(mockListInboxTeams).toHaveBeenCalledTimes(1)
    })
    expect(mockListWorkspaceMembers).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        perPage: 999_999_999,
      },
      expect.anything(),
    )
    expect(mockListInboxTeams).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
      },
      expect.anything(),
    )
  })

  test("does not request either list when disabled", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsersProbe enabled={false} />
        </QueryClientProvider>,
      )
    })

    expect(mockListWorkspaceMembers).not.toHaveBeenCalled()
    expect(mockListInboxTeams).not.toHaveBeenCalled()
  })

  test("invalidates both user-backed lists", async () => {
    let invalidate: (() => unknown) | null = null
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsersProbe />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListWorkspaceMembers).toHaveBeenCalledTimes(1)
      expect(mockListInboxTeams).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await invalidate?.()
    })

    expect(invalidateQueries).toHaveBeenCalledTimes(2)
  })
})
