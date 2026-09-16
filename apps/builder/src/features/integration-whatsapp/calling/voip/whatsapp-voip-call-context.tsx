"use client"

import { createContext, type ReactNode, useContext } from "react"
import type {
  StartOutboundOutcome,
  StartOutboundParams,
} from "./use-whatsapp-voip-call"
import { useWhatsappVoipCall } from "./use-whatsapp-voip-call"

export type WhatsappVoipCallContextValue = {
  /** Accepts the current incoming call. */
  answer: () => Promise<void>
  /** Silences this agent's incoming ring locally (ring-all — does not end the call for others). */
  dismiss: () => void
  /** Ends the current active (already-accepted) call, or cancels an
   * outbound call still preparing/dialing/ringing. */
  hangup: () => Promise<void>
  /** Toggles the local microphone track's `enabled` flag. */
  toggleMute: () => void
  /** Clears a lingering `ended` call immediately instead of waiting out the
   * ~2s auto-dismiss. */
  dismissEnded: () => void
  /** Places a business-initiated (outbound) VoIP call. */
  startOutbound: (params: StartOutboundParams) => Promise<StartOutboundOutcome>
}

const WhatsappVoipCallContext =
  createContext<WhatsappVoipCallContextValue | null>(null)

/**
 * The single owner of `useWhatsappVoipCall` — that hook holds the
 * `RTCPeerConnection` and local mic track in refs, so mounting it more than
 * once would open a second peer connection racing the first. This provider
 * calls it exactly once, renders the single `<audio>` element that plays the
 * remote party's media, and exposes `{ answer, dismiss, hangup, toggleMute }`
 * to every consumer (the incoming-call dialog, the floating dock, and the
 * per-conversation inbox-item buttons) via context. Mount it once, high
 * enough in the tree to wrap every consumer — see `ChatLayout`.
 */
export function WhatsappVoipCallProvider({
  children,
}: {
  children: ReactNode
}) {
  const {
    remoteAudioRef,
    answer,
    dismiss,
    hangup,
    toggleMute,
    dismissEnded,
    startOutbound,
  } = useWhatsappVoipCall()

  return (
    <WhatsappVoipCallContext.Provider
      value={{
        answer,
        dismiss,
        hangup,
        toggleMute,
        dismissEnded,
        startOutbound,
      }}
    >
      {/** biome-ignore lint/a11y/useMediaCaption: remote call audio has no captions to attach */}
      <audio autoPlay ref={remoteAudioRef} />
      {children}
    </WhatsappVoipCallContext.Provider>
  )
}

/** Consumes the single `useWhatsappVoipCall` instance owned by `WhatsappVoipCallProvider`. */
export function useWhatsappVoipCallContext(): WhatsappVoipCallContextValue {
  const context = useContext(WhatsappVoipCallContext)
  if (!context) {
    throw new Error(
      "useWhatsappVoipCallContext must be used within a WhatsappVoipCallProvider",
    )
  }
  return context
}
