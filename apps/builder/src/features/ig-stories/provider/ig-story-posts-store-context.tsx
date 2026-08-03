"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import type { IgStoryVariant } from "../schema/action"
import {
  createIgStoryPostsStore,
  type IgStoryPostsStore,
} from "./ig-story-posts-store"

export type IgStoryPostsStoreApi = ReturnType<typeof createIgStoryPostsStore>

export const IgStoryPostsStoreContext = createContext<
  IgStoryPostsStoreApi | undefined
>(undefined)

export type IgStoryPostsStoreProviderProps = {
  workspaceId: string
  variant: IgStoryVariant
  children: ReactNode
  autoInitialize?: boolean
}

export const IgStoryPostsStoreProvider = ({
  workspaceId,
  variant,
  autoInitialize = true,
  children,
}: IgStoryPostsStoreProviderProps) => {
  const storeRef = useRef<IgStoryPostsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createIgStoryPostsStore({ workspaceId, variant })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <IgStoryPostsStoreContext.Provider value={storeRef.current}>
      {children}
    </IgStoryPostsStoreContext.Provider>
  )
}

export const useIgStoryPostsStore = <T,>(
  selector: (store: IgStoryPostsStore) => T,
): T => {
  const context = useContext(IgStoryPostsStoreContext)

  if (!context) {
    throw new Error(
      "useIgStoryPostsStore must be used within IgStoryPostsStoreProvider",
    )
  }

  return useStore(context, selector)
}
