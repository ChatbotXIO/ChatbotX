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
  onData,
}: {
  workspaceId?: string
  enabled?: boolean
  onData?: (data: { inboxTeams: unknown; workspaceMembers: unknown }) => void
}) {
  const workspaceMembers = useWorkspaceMembers(workspaceId, { enabled })
  const inboxTeams = useInboxTeams(workspaceId, { enabled })
  onData?.({
    workspaceMembers: workspaceMembers.data,
    inboxTeams: inboxTeams.data,
  })
  return null
}

function InvalidateProbe({
  onReady,
  version: _version = 0,
}: {
  onReady: (fn: () => unknown) => void
  version?: number
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

  test("unwraps workspace member and inbox team response data", async () => {
    const workspaceMembers = [{ id: "member-1" }]
    const inboxTeams = [{ id: "team-1" }]
    let data: { inboxTeams: unknown; workspaceMembers: unknown } | undefined
    mockListWorkspaceMembers.mockResolvedValue({
      data: workspaceMembers,
      pageCount: 1,
    })
    mockListInboxTeams.mockResolvedValue({ data: inboxTeams })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsersProbe onData={(nextData) => (data = nextData)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual({ workspaceMembers, inboxTeams })
    })
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

  test("invalidates both user-backed lists, and a refetch returns fresh data", async () => {
    let invalidate: (() => unknown) | null = null
    let data: { inboxTeams: unknown; workspaceMembers: unknown } | undefined
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsersProbe onData={(nextData) => (data = nextData)} />
          <InvalidateProbe onReady={(fn) => (invalidate = fn)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(data).toEqual({ workspaceMembers: [], inboxTeams: [] })
    })

    // A wrong query key on either invalidated entry would leave that half of
    // `data` stuck on stale values forever, timing the final `waitFor` out.
    const refreshedMembers = [{ id: "member-2" }]
    const refreshedTeams = [{ id: "team-2" }]
    mockListWorkspaceMembers.mockResolvedValue({
      data: refreshedMembers,
      pageCount: 1,
    })
    mockListInboxTeams.mockResolvedValue({ data: refreshedTeams })

    await act(async () => {
      await invalidate?.()
    })

    expect(invalidateQueries).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => {
      expect(data).toEqual({
        workspaceMembers: refreshedMembers,
        inboxTeams: refreshedTeams,
      })
    })
  })

  test("keeps the invalidator stable across renders", () => {
    const invalidators: (() => unknown)[] = []

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(fn) => invalidators.push(fn)}
            version={1}
          />
        </QueryClientProvider>,
      )
    })
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <InvalidateProbe
            onReady={(fn) => invalidators.push(fn)}
            version={2}
          />
        </QueryClientProvider>,
      )
    })

    expect(invalidators).toHaveLength(2)
    expect(invalidators[1]).toBe(invalidators[0])
  })
})
