"use client"

import { create } from "zustand"

/**
 * A ringing call, keyed by `rootUuid`: the browser's SIP.js
 * `Invitation` carries the `X-CBX-Root-UUID` header BEFORE the realtime
 * `whatsappCallRinging` event necessarily arrives, so the SIP layer stores
 * the raw ring first and the realtime enrichment (contact/conversation)
 * merges onto the same key once it lands — whichever arrives first.
 */
type IncomingWhatsappCall = {
  rootUuid: string
  callId?: string
  correlationId?: string
  direction?: "userInitiated" | "businessInitiated"
  conversationId?: string
  contactInboxId?: string
  contactName?: string | null
}

type ActiveWhatsappCall = {
  rootUuid: string
  callId?: string
  contactName?: string | null
  startedAt: number
}

type OutgoingWhatsappCall = {
  attemptId: string
  callId: string
  contactName?: string | null
}

type WhatsappCallState = {
  incoming: Record<string, IncomingWhatsappCall>
  active: ActiveWhatsappCall | null
  outgoing: OutgoingWhatsappCall | null
  /** Raw ring from the SIP layer — created before any enrichment exists. */
  addIncomingRing: (rootUuid: string) => void
  /** Merges the realtime `whatsappCallRinging` enrichment onto the ring. */
  enrichIncoming: (
    data: Omit<IncomingWhatsappCall, "contactName"> & {
      contactName?: string | null
    },
  ) => void
  dismissIncoming: (rootUuid: string) => void
  setActiveCall: (call: ActiveWhatsappCall | null) => void
  setOutgoingCall: (call: OutgoingWhatsappCall | null) => void
  /** Dismisses ringing/active/outgoing UI when a call ends, by either id. */
  handleCallEnded: (id: { callId?: string; rootUuid?: string }) => void
}

const matchesEndedId = (
  candidateCallId: string | undefined,
  candidateRootUuid: string | undefined,
  ended: { callId?: string; rootUuid?: string },
): boolean =>
  (ended.callId !== undefined && candidateCallId === ended.callId) ||
  (ended.rootUuid !== undefined && candidateRootUuid === ended.rootUuid)

export const useWhatsappCallStore = create<WhatsappCallState>((set) => ({
  incoming: {},
  active: null,
  outgoing: null,

  addIncomingRing: (rootUuid) =>
    set((state) => ({
      incoming: {
        ...state.incoming,
        [rootUuid]: state.incoming[rootUuid] ?? { rootUuid },
      },
    })),

  enrichIncoming: (data) =>
    set((state) => ({
      incoming: {
        ...state.incoming,
        [data.rootUuid]: { ...state.incoming[data.rootUuid], ...data },
      },
    })),

  dismissIncoming: (rootUuid) =>
    set((state) => {
      const { [rootUuid]: _removed, ...rest } = state.incoming
      return { incoming: rest }
    }),

  setActiveCall: (active) => set({ active }),
  setOutgoingCall: (outgoing) => set({ outgoing }),

  handleCallEnded: (ended) =>
    set((state) => {
      const incoming = Object.fromEntries(
        Object.entries(state.incoming).filter(
          ([rootUuid, call]) => !matchesEndedId(call.callId, rootUuid, ended),
        ),
      )
      const active = matchesEndedId(
        state.active?.callId,
        state.active?.rootUuid,
        ended,
      )
        ? null
        : state.active
      const outgoing = matchesEndedId(state.outgoing?.callId, undefined, ended)
        ? null
        : state.outgoing
      return { incoming, active, outgoing }
    }),
}))
