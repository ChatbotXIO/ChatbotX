"use client"

import { create } from "zustand"

/**
 * Which tab the Call Information sheet opens on - set by whichever button on
 * the progressive call card (WhatsappCallCard) opened it (Transcript vs AI
 * Summary). Exists so the card's buttons have somewhere to signal "open" before
 * the sheet itself is built.
 */
export type CallInfoSheetTab = "transcript" | "summary"

export type CallInfoSheetState = {
  isOpen: boolean
  /** The DB `WhatsappCall.id` for the call whose info sheet is open. */
  whatsappCallId: string | null
  tab: CallInfoSheetTab
  /**
   * The call's known talk length (WhatsappCall.durationSeconds), forwarded from
   * the card that opened the sheet so the sheet's player shows the total at
   * rest (0:00 / 0:18) without eagerly loading the audio - Ogg/Opus recordings
   * carry no duration in their header, so the element itself only reports it
   * after playback probes to the end.
   */
  durationSeconds?: number
}

export type CallInfoSheetActions = {
  open: (props: {
    whatsappCallId: string
    tab: CallInfoSheetTab
    durationSeconds?: number
  }) => void
  close: () => void
}

export type CallInfoSheetStore = CallInfoSheetState & CallInfoSheetActions

export const useCallInfoSheetStore = create<CallInfoSheetStore>((set) => ({
  isOpen: false,
  whatsappCallId: null,
  tab: "transcript",
  durationSeconds: undefined,
  open: ({ whatsappCallId, tab, durationSeconds }) =>
    set({ isOpen: true, whatsappCallId, tab, durationSeconds }),
  close: () => set({ isOpen: false }),
}))
