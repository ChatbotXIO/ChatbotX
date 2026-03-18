"use client"

import { useAction } from "next-safe-action/hooks"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react"
import { toast } from "sonner"
import { useStore } from "zustand"
import { listSavedRepliesAction } from "../actions/list-saved-replies.action"
import {
  createSavedReplyStore,
  type SavedReplyStore,
} from "./saved-reply-store"

export type SavedReplyStoreApi = ReturnType<typeof createSavedReplyStore>

type SavedReplyStoreContextValue = {
  initializeSavedReplies: () => Promise<void>
  refreshSavedReplies: () => Promise<void>
  store: SavedReplyStoreApi
}

const SavedReplyStoreContext = createContext<
  SavedReplyStoreContextValue | undefined
>(undefined)

export type SavedReplyStoreProviderProps = {
  children: ReactNode
}

export const SavedReplyStoreProvider = ({
  children,
}: SavedReplyStoreProviderProps) => {
  const storeRef = useRef<SavedReplyStoreApi>(null)

  if (!storeRef.current) {
    storeRef.current = createSavedReplyStore()
  }

  const { executeAsync: listSavedReplies } = useAction(listSavedRepliesAction, {
    onSuccess: ({ data }) => {
      storeRef.current?.getState().setSavedReplies(data ?? [])
    },
    onError: ({ error }) => {
      storeRef.current?.getState().setLoadingSavedReplies(false)
      if (error.serverError) {
        toast.error(error.serverError)
      }
    },
  })

  const refreshSavedReplies = useCallback(async () => {
    storeRef.current?.getState().setLoadingSavedReplies(true)

    try {
      await listSavedReplies()
    } finally {
      storeRef.current?.getState().setLoadingSavedReplies(false)
    }
  }, [listSavedReplies])

  const initializeSavedReplies = useCallback(async () => {
    const state = storeRef.current?.getState()

    if (!state || state.initialized || state.isLoadingSavedReplies) {
      return
    }

    await refreshSavedReplies()
  }, [refreshSavedReplies])

  return (
    <SavedReplyStoreContext.Provider
      value={{
        initializeSavedReplies,
        refreshSavedReplies,
        store: storeRef.current,
      }}
    >
      {children}
    </SavedReplyStoreContext.Provider>
  )
}

export const useSavedReplyStore = <T,>(
  selector: (store: SavedReplyStore) => T,
): T => {
  const context = useContext(SavedReplyStoreContext)

  if (!context) {
    throw new Error(
      "useSavedReplyStore must be used within SavedReplyStoreProvider",
    )
  }

  return useStore(context.store, selector)
}

export const useSavedReplyStoreActions = () => {
  const context = useContext(SavedReplyStoreContext)

  if (!context) {
    throw new Error(
      "useSavedReplyStoreActions must be used within SavedReplyStoreProvider",
    )
  }

  return {
    initializeSavedReplies: context.initializeSavedReplies,
    refreshSavedReplies: context.refreshSavedReplies,
  }
}
