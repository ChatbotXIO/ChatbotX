"use client"

import { useAction } from "next-safe-action/hooks"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { refreshWebchatAccessTokenAction } from "../../actions/refresh-webchat-access-token.action"
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
  accessTokenExpiresAt?: number | null
  serverGuestConversationId: string
  /** Resolved server-side; see GuestSessionState.workspaceLogoUrl. */
  workspaceLogoUrl?: string
}

export const GuestSessionStoreProvider = ({
  children,
  config,
  accessToken = null,
  accessTokenExpiresAt = null,
  serverGuestConversationId,
  workspaceLogoUrl,
}: GuestSessionStoreProviderProps) => {
  const storeRef = useRef<GuestSessionStoreApi>(null)
  const { executeAsync } = useAction(refreshWebchatAccessTokenAction)
  if (!storeRef.current) {
    storeRef.current = createGuestSessionStore(
      config,
      accessToken,
      accessTokenExpiresAt,
      workspaceLogoUrl,
    )
  }

  useEffect(() => {
    storeRef.current?.getState().initGuestSession(serverGuestConversationId)
  }, [serverGuestConversationId])

  useEffect(() => {
    const refreshMarginMilliseconds = 5 * 60 * 1000
    const retryDelayMilliseconds = 30 * 1000
    let hasRetried = false
    let isRefreshing = false
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer)
      const session = storeRef.current?.getState()
      if (!(session?.accessToken && session.accessTokenExpiresAt)) {
        return
      }

      const delay = Math.max(
        0,
        session.accessTokenExpiresAt * 1000 -
          Date.now() -
          refreshMarginMilliseconds,
      )
      refreshTimer = setTimeout(() => {
        refresh().catch(() => undefined)
      }, delay)
    }

    const scheduleRetry = () => {
      const expiresAt = storeRef.current?.getState().accessTokenExpiresAt
      if (
        hasRetried ||
        !expiresAt ||
        expiresAt * 1000 + refreshMarginMilliseconds <= Date.now()
      ) {
        return
      }

      hasRetried = true
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        refresh().catch(() => undefined)
      }, retryDelayMilliseconds)
    }

    const refresh = async () => {
      if (isRefreshing) {
        return
      }

      const session = storeRef.current?.getState()
      if (!(session?.accessToken && session.accessTokenExpiresAt)) {
        return
      }

      isRefreshing = true
      try {
        const result = await executeAsync({
          token: session.accessToken,
          webchatId: config.id,
          workspaceId: config.workspaceId,
        })
        if (!result?.data) {
          scheduleRetry()
          return
        }

        storeRef.current
          ?.getState()
          .refreshAccessToken(
            result.data.accessToken,
            result.data.accessTokenExpiresAt,
          )
        hasRetried = false
        scheduleRefresh()
      } catch {
        scheduleRetry()
      } finally {
        isRefreshing = false
      }
    }

    const handleVisibilityChange = () => {
      const expiresAt = storeRef.current?.getState().accessTokenExpiresAt
      if (
        expiresAt &&
        Date.now() >= expiresAt * 1000 - refreshMarginMilliseconds
      ) {
        refresh().catch(() => undefined)
      }
    }

    scheduleRefresh()
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      clearTimeout(refreshTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [config.id, config.workspaceId, executeAsync])

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
