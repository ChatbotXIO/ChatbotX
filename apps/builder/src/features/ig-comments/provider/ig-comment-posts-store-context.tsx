"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import type { IgCommentVariant } from "../schema/action"
import {
  createIgCommentPostsStore,
  type IgCommentPostsStore,
} from "./ig-comment-posts-store"

export type IgCommentPostsStoreApi = ReturnType<
  typeof createIgCommentPostsStore
>

export const IgCommentPostsStoreContext = createContext<
  IgCommentPostsStoreApi | undefined
>(undefined)

export type IgCommentPostsStoreProviderProps = {
  workspaceId: string
  variant: IgCommentVariant
  children: ReactNode
  autoInitialize?: boolean
}

export const IgCommentPostsStoreProvider = ({
  workspaceId,
  variant,
  autoInitialize = true,
  children,
}: IgCommentPostsStoreProviderProps) => {
  const storeRef = useRef<IgCommentPostsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createIgCommentPostsStore({ workspaceId, variant })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <IgCommentPostsStoreContext.Provider value={storeRef.current}>
      {children}
    </IgCommentPostsStoreContext.Provider>
  )
}

export const useIgCommentPostsStore = <T,>(
  selector: (store: IgCommentPostsStore) => T,
): T => {
  const context = useContext(IgCommentPostsStoreContext)

  if (!context) {
    throw new Error(
      "useIgCommentPostsStore must be used within IgCommentPostsStoreProvider",
    )
  }

  return useStore(context, selector)
}
