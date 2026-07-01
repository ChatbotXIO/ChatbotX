"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import {
  createFbCommentPostsStore,
  type FbCommentPostsStore,
} from "./fb-comment-posts-store"

export type FbCommentPostsStoreApi = ReturnType<
  typeof createFbCommentPostsStore
>

export const FbCommentPostsStoreContext = createContext<
  FbCommentPostsStoreApi | undefined
>(undefined)

export type FbCommentPostsStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const FbCommentPostsStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: FbCommentPostsStoreProviderProps) => {
  const storeRef = useRef<FbCommentPostsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFbCommentPostsStore({ workspaceId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <FbCommentPostsStoreContext.Provider value={storeRef.current}>
      {children}
    </FbCommentPostsStoreContext.Provider>
  )
}

export const useFbCommentPostsStore = <T,>(
  selector: (store: FbCommentPostsStore) => T,
): T => {
  const context = useContext(FbCommentPostsStoreContext)

  if (!context) {
    throw new Error(
      "useFbCommentPostsStore must be used within FbCommentPostsStoreProvider",
    )
  }

  return useStore(context, selector)
}
