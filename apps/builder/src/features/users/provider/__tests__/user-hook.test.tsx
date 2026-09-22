// @vitest-environment jsdom

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
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

function UsersProbe({
  workspaceId = "workspace-1",
  enabled = true,
  onData,
  onError,
}: {
  workspaceId?: string
  enabled?: boolean
  onData?: (data: { inboxTeams: unknown; workspaceMembers: unknown }) => void
  onError?: (isError: boolean) => void
}) {
  const workspaceMembers = useWorkspaceMembers(workspaceId, { enabled })
  const inboxTeams = useInboxTeams(workspaceId, { enabled })
  onData?.({
    workspaceMembers: workspaceMembers.data,
    inboxTeams: inboxTeams.data,
  })
  onError?.(workspaceMembers.isError || inboxTeams.isError)
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

  test("requests workspace members and inbox teams with unpaginated inputs", async () => {
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

  test("surfaces a failed workspace member request", async () => {
    let isError = false
    mockListWorkspaceMembers.mockRejectedValue(new Error("members failed"))

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <UsersProbe onError={(nextIsError) => (isError = nextIsError)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(isError).toBe(true)
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
