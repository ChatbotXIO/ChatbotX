"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import type { ListSavedReplyResponse } from "../schema/mutation"
import type { SavedReplyResource } from "../schema/resource"

export type SavedReplyStoreProviderProps = {
  children: ReactNode
  workspaceId: string
}

const SavedReplyWorkspaceContext = createContext<string | null>(null)

export const SavedReplyStoreProvider = ({
  children,
  workspaceId,
}: SavedReplyStoreProviderProps) => (
  <SavedReplyWorkspaceContext.Provider value={workspaceId}>
    {children}
  </SavedReplyWorkspaceContext.Provider>
)

type SavedReplyStoreSnapshot = {
  initialized: boolean
  isLoading: boolean
  workspaceId: string
  savedReplies: SavedReplyResource[]
  error: string | null
  initialize: () => Promise<unknown>
  getAllSavedReplies: () => Promise<unknown>
  deleteSavedReply: (id: string) => void
  upsertSavedReply: (savedReply: SavedReplyResource) => void
}

export const useSavedReplyStore = <T,>(
  selector: (store: SavedReplyStoreSnapshot) => T,
): T => {
  const providedWorkspaceId = useContext(SavedReplyWorkspaceContext)
  const routedWorkspaceId = useWorkspaceId()
  const workspaceId = providedWorkspaceId ?? routedWorkspaceId
  const queryClient = useQueryClient()
  const queryOptions = useMemo(
    () =>
      orpc.savedRepliesAPI.listSavedRepliesAuthorizedAPI.queryOptions({
        input: { workspaceId: workspaceId ?? "" },
        enabled: false,
      }),
    [workspaceId],
  )
  const savedRepliesQuery = useQuery(queryOptions)
  const savedRepliesStateRef = useRef({
    data: savedRepliesQuery.data,
    isFetched: savedRepliesQuery.isFetched,
    isFetching: savedRepliesQuery.isFetching,
  })
  savedRepliesStateRef.current = {
    data: savedRepliesQuery.data,
    isFetched: savedRepliesQuery.isFetched,
    isFetching: savedRepliesQuery.isFetching,
  }

  const getAllSavedReplies = useCallback(() => {
    const { data, isFetched, isFetching } = savedRepliesStateRef.current
    if (isFetched || isFetching) {
      return Promise.resolve(data)
    }

    return savedRepliesQuery.refetch().then((result) => result.data)
  }, [savedRepliesQuery.refetch])

  const deleteSavedReply = useCallback(
    (id: string) => {
      queryClient.setQueryData<ListSavedReplyResponse>(
        queryOptions.queryKey,
        (response) => ({
          data: (response?.data ?? []).filter((item) => item.id !== id),
        }),
      )
    },
    [queryClient, queryOptions.queryKey],
  )

  const upsertSavedReply = useCallback(
    (savedReply: SavedReplyResource) => {
      queryClient.setQueryData<ListSavedReplyResponse>(
        queryOptions.queryKey,
        (response) => {
          const currentItems = response?.data ?? []
          const existingIndex = currentItems.findIndex(
            (item) => item.id === savedReply.id,
          )
          if (existingIndex === -1) {
            return { data: [savedReply, ...currentItems] }
          }
          return {
            data: currentItems.map((item) =>
              item.id === savedReply.id ? savedReply : item,
            ),
          }
        },
      )
    },
    [queryClient, queryOptions.queryKey],
  )

  const snapshot = useMemo<SavedReplyStoreSnapshot>(
    () => ({
      initialized: savedRepliesQuery.isFetched,
      isLoading: savedRepliesQuery.isFetching,
      workspaceId: workspaceId ?? "",
      savedReplies: savedRepliesQuery.data?.data ?? [],
      error: savedRepliesQuery.error?.message ?? null,
      initialize: getAllSavedReplies,
      getAllSavedReplies,
      deleteSavedReply,
      upsertSavedReply,
    }),
    [
      deleteSavedReply,
      getAllSavedReplies,
      savedRepliesQuery.data,
      savedRepliesQuery.error,
      savedRepliesQuery.isFetched,
      savedRepliesQuery.isFetching,
      upsertSavedReply,
      workspaceId,
    ],
  )

  return selector(snapshot)
}
