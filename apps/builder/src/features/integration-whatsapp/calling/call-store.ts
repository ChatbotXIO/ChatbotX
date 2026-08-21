"use client"

import { create } from "zustand"

export type IncomingWhatsappCall = {
  wacid: string
  roomName: string
  conversationId: string
  contactInboxId: string
  contactName?: string | null
}

export type ActiveWhatsappCall = {
  wacid?: string
  roomName: string
  contactName?: string | null
  startedAt: number
}

type WhatsappCallState = {
  incomingCall: IncomingWhatsappCall | null
  activeCall: ActiveWhatsappCall | null
  setIncomingCall: (call: IncomingWhatsappCall | null) => void
  setActiveCall: (call: ActiveWhatsappCall | null) => void
  /** Dismisses ringing/active UI when the call's room closes remotely. */
  handleCallEnded: (wacid: string) => void
}

export const useWhatsappCallStore = create<WhatsappCallState>((set) => ({
  incomingCall: null,
  activeCall: null,
  setIncomingCall: (incomingCall) => set({ incomingCall }),
  setActiveCall: (activeCall) => set({ activeCall }),
  handleCallEnded: (wacid) =>
    set((state) => ({
      incomingCall:
        state.incomingCall?.wacid === wacid ? null : state.incomingCall,
      activeCall: state.activeCall?.wacid === wacid ? null : state.activeCall,
    })),
}))
