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
  createGuestSessionStore,
  type GuestSessionStore,
} from "./guest-sesssion-store"
import type { WebchatClientConfig } from "./lib/webchat-client-config"

export type GuestSessionStoreApi = ReturnType<typeof createGuestSessionStore>

export const GuestSessionStoreContext = createContext<
  GuestSessionStoreApi | undefined
>(undefined)

export type GuestSessionStoreProviderProps = {
  children: ReactNode
  config: WebchatClientConfig
  accessToken?: string | null
  serverGuestConversationId: string
  /** Resolved server-side; see GuestSessionState.workspaceLogoUrl. */
  workspaceLogoUrl?: string
  /**
   * The origin the server minted `accessToken` for. Only the first
   * render's value is used — the store freezes it in the `useRef` below —
   * so later re-renders passing a different value (e.g. an RSC refresh
   * after the guest-init action changes the referer) are intentionally
   * ignored. See GuestSessionState.embeddingOrigin.
   */
  embeddingOrigin?: string | null
}

export const GuestSessionStoreProvider = ({
  children,
  config,
  accessToken = null,
  serverGuestConversationId,
  workspaceLogoUrl,
  embeddingOrigin = null,
}: GuestSessionStoreProviderProps) => {
  const storeRef = useRef<GuestSessionStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createGuestSessionStore(
      config,
      accessToken,
      workspaceLogoUrl,
      embeddingOrigin,
    )
  }

  useEffect(() => {
    storeRef.current?.getState().initGuestSession(serverGuestConversationId)
  }, [serverGuestConversationId])

  return (
    <GuestSessionStoreContext.Provider value={storeRef.current}>
      {children}
    </GuestSessionStoreContext.Provider>
  )
}

export const useGuestSessionStore = <T,>(
  selector: (store: GuestSessionStore) => T,
): T => {
  const guestSessionStoreContext = useContext(GuestSessionStoreContext)

  if (!guestSessionStoreContext) {
    throw new Error(
      "useGuestSessionStore must be used within GuestSessionStoreProvider",
    )
  }

  return useStore(guestSessionStoreContext, selector)
}
