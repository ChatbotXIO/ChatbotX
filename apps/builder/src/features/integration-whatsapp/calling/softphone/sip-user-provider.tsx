"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react"
import { logger } from "@/lib/log"
import { useWhatsappCallStore } from "./call-store"
import { useSipUser } from "./use-sip-user"

export type SipUserContextValue = {
  isRegistered: boolean
  isMuted: boolean
  call: (dialUri: string, attemptId: string) => Promise<void>
  /** Answers the ring keyed by `rootUuid` (real header value or synthetic key). */
  answer: (rootUuid: string) => Promise<void>
  decline: () => Promise<void>
  hangup: () => Promise<void>
  setMuted: (muted: boolean) => void
}

const SipUserContext = createContext<SipUserContextValue | null>(null)

/**
 * Mounts the single `SimpleUser` instance for the open workspace (—
 * exactly one registration per workspace) and wires its delegate callbacks
 * to the `useWhatsappCallStore` zustand store. `WhatsappCallDock` and
 * `StartCallButton` previously each called `useSipUser()` directly, which
 * registered two `SimpleUser`s per workspace; both now consume this context
 * instead, so mount `SipUserProvider` exactly once (in `chat-layout.tsx`),
 * wrapping both the dock and the message thread.
 */
export function SipUserProvider({ children }: { children: ReactNode }) {
  const addIncomingRing = useWhatsappCallStore((state) => state.addIncomingRing)
  const dismissIncoming = useWhatsappCallStore((state) => state.dismissIncoming)
  const setActiveCall = useWhatsappCallStore((state) => state.setActiveCall)
  const setOutgoingCall = useWhatsappCallStore((state) => state.setOutgoingCall)

  /**
   * Tracks the ring currently on the line — the SIP INVITE's `rootUuid`
   * header value, or a synthetic `unknown-<timestamp>` key when the header
   * is missing — so a hangup/cancel that arrives before the agent answers
   * still clears the right entry from the store, synthetic keys included.
   */
  const currentRingKeyRef = useRef<string | null>(null)
  /** Set by `answer()` to the rootUuid the agent is answering. */
  const pendingAnswerRootUuidRef = useRef<string | null>(null)

  const raw = useSipUser({
    onCallReceived: ({ rootUuid }) => {
      const ringKey = rootUuid ?? `unknown-${Date.now()}`
      currentRingKeyRef.current = ringKey
      addIncomingRing(ringKey)
      if (!rootUuid) {
        logger.warn(
          { syntheticKey: ringKey },
          "Incoming WhatsApp call INVITE is missing the X-CBX-Root-UUID header; using a synthetic ring key so the agent can still answer",
        )
      }
    },
    onCallAnswered: () => {
      const rootUuid = pendingAnswerRootUuidRef.current
      if (rootUuid) {
        const ring = useWhatsappCallStore.getState().incoming[rootUuid]
        setActiveCall({
          rootUuid,
          callId: ring?.callId,
          contactName: ring?.contactName,
          startedAt: Date.now(),
        })
        dismissIncoming(rootUuid)
      }
      pendingAnswerRootUuidRef.current = null
      currentRingKeyRef.current = null
    },
    onCallHangup: () => {
      setActiveCall(null)
      setOutgoingCall(null)
      const ringKey = currentRingKeyRef.current
      if (ringKey) {
        dismissIncoming(ringKey)
      }
      pendingAnswerRootUuidRef.current = null
      currentRingKeyRef.current = null
    },
  })

  const answer = useCallback(
    async (rootUuid: string) => {
      pendingAnswerRootUuidRef.current = rootUuid
      await raw.answer()
    },
    [raw.answer],
  )

  const decline = useCallback(async () => {
    currentRingKeyRef.current = null
    await raw.decline()
  }, [raw.decline])

  const value: SipUserContextValue = {
    isRegistered: raw.isRegistered,
    isMuted: raw.isMuted,
    call: raw.call,
    answer,
    decline,
    hangup: raw.hangup,
    setMuted: raw.setMuted,
  }

  return (
    <SipUserContext.Provider value={value}>{children}</SipUserContext.Provider>
  )
}

/** Throws outside `SipUserProvider` — use for consumers that require calling (e.g. `WhatsappCallDock`). */
export function useSipUserContext(): SipUserContextValue {
  const context = useContext(SipUserContext)
  if (!context) {
    throw new Error("useSipUserContext must be used within a SipUserProvider")
  }
  return context
}

/** Returns `null` outside `SipUserProvider` instead of throwing — use where calling is optional (e.g. `StartCallButton`). */
export function useOptionalSipUserContext(): SipUserContextValue | null {
  return useContext(SipUserContext)
}
