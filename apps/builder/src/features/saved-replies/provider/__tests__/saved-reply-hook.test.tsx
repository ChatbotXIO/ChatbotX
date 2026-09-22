// @vitest-environment jsdom

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { orpc } from "@/lib/orpc/query"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
import type { ListSavedReplyResponse } from "../../schema/mutation"
import type { SavedReplyResource } from "../../schema/resource"
import {
  type SavedReplyCache,
  useSavedReplies,
  useSavedReplyCache,
} from "../saved-reply-hook"

const { mockListSavedReplies } = vi.hoisted(() => ({
  mockListSavedReplies: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    savedRepliesAPI: {
      listSavedRepliesAuthorizedAPI: mockListSavedReplies,
    },
  },
}))

const createSavedReply = (id: string, text: string): SavedReplyResource => ({
  id,
  workspaceId: "workspace-1",
  shortcut: `/${id}`,
  text,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
})

function SavedRepliesProbe({
  workspaceId = "workspace-1",
  enabled = true,
  onData,
  onError,
}: {
  workspaceId?: string
  enabled?: boolean
  onData: (data: SavedReplyResource[] | undefined) => void
  onError?: (isError: boolean) => void
}) {
  const { data, isError } = useSavedReplies(workspaceId, { enabled })
  onData(data)
  onError?.(isError)
  return null
}
function SavedReplyCacheProbe({
  onReady,
}: {
  onReady: (cache: SavedReplyCache) => void
}) {
  onReady(useSavedReplyCache("workspace-1"))
  return null
}

describe("saved reply query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
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

  test("requests and unwraps saved replies", async () => {
    const savedReply = createSavedReply("saved-reply-1", "Hello")
    let receivedData: SavedReplyResource[] | undefined
    mockListSavedReplies.mockResolvedValue({ data: [savedReply] })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SavedRepliesProbe onData={(data) => (receivedData = data)} />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(mockListSavedReplies).toHaveBeenCalledTimes(1)
      expect(receivedData).toEqual([savedReply])
    })
    expect(mockListSavedReplies).toHaveBeenCalledWith(
      { workspaceId: "workspace-1" },
      expect.anything(),
    )
  })

  test("does not request saved replies when disabled", () => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SavedRepliesProbe enabled={false} onData={() => undefined} />
        </QueryClientProvider>,
      )
    })

    expect(mockListSavedReplies).not.toHaveBeenCalled()
  })

  test("surfaces a failed saved reply request", async () => {
    let isError = false
    mockListSavedReplies.mockRejectedValue(new Error("saved replies failed"))

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SavedRepliesProbe
            onData={() => undefined}
            onError={(nextIsError) => (isError = nextIsError)}
          />
        </QueryClientProvider>,
      )
    })

    await vi.waitFor(() => {
      expect(isError).toBe(true)
    })
  })

  test("updates the saved reply cache", () => {
    const existingSavedReply = createSavedReply("saved-reply-1", "Original")
    const newSavedReply = createSavedReply("saved-reply-2", "New")
    const replacementSavedReply = createSavedReply("saved-reply-1", "Updated")
    const queryKey =
      orpc.savedRepliesAPI.listSavedRepliesAuthorizedAPI.queryKey({
        input: { workspaceId: "workspace-1" },
      })
    let cache: SavedReplyCache | undefined

    queryClient.setQueryData<ListSavedReplyResponse>(queryKey, {
      data: [existingSavedReply],
    })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SavedReplyCacheProbe onReady={(value) => (cache = value)} />
        </QueryClientProvider>,
      )
    })

    act(() => {
      cache?.upsert(newSavedReply)
    })
    expect(queryClient.getQueryData<ListSavedReplyResponse>(queryKey)).toEqual({
      data: [newSavedReply, existingSavedReply],
    })

    act(() => {
      cache?.upsert(replacementSavedReply)
    })
    expect(queryClient.getQueryData<ListSavedReplyResponse>(queryKey)).toEqual({
      data: [newSavedReply, replacementSavedReply],
    })

    act(() => {
      cache?.remove(newSavedReply.id)
    })
    expect(queryClient.getQueryData<ListSavedReplyResponse>(queryKey)).toEqual({
      data: [replacementSavedReply],
    })
  })
})
