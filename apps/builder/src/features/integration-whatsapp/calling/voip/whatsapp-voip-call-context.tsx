"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { useTranslations } from "next-intl"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { toast } from "sonner"
import { logger } from "@/lib/log"
import type {
  StartOutboundOutcome,
  StartOutboundParams,
} from "./use-whatsapp-voip-call"
import { useWhatsappVoipCall } from "./use-whatsapp-voip-call"
import {
  isCallSlotFree,
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
} from "./voip-call-store"

export type WhatsappVoipCallContextValue = {
  /**
   * Accepts an offer. With no `whatsappCallId`, targets whatever currently
   * occupies the single call slot (today's behavior, unchanged). With an
   * id, targets a specific offer — the slot's own call, or a basket entry
   * (see `ringingCalls` in `voip-call-store.ts`). Answering a basket entry
   * while the slot is genuinely ENGAGED with a DIFFERENT call first shows a
   * confirmation dialog ("End the call with X to answer Y?"); only once the
   * agent confirms does the actual end-then-promote-then-answer flow (owned
   * by `useWhatsappVoipCall`) run.
   */
  answer: (whatsappCallId?: string) => Promise<void>
  /**
   * Silences an incoming ring locally. With no id, the current slot's ring
   * (ring-all — does not end the call for others). With an id, drops just
   * that one basket entry.
   */
  dismiss: (whatsappCallId?: string) => void
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

/** The offer being confirmed for replacement, and the call it would
 * replace — both captured as display snapshots (id + name) at the moment
 * the dialog opens, so the dialog's copy never needs to re-read the store
 * while the agent is deciding. */
type ReplacementTarget = {
  currentCallId: string
  currentContactName: string
  incomingCallId: string
  incomingContactName: string
}

/**
 * The single owner of `useWhatsappVoipCall` — that hook holds the
 * `RTCPeerConnection` and local mic track in refs, so mounting it more than
 * once would open a second peer connection racing the first. This provider
 * calls it exactly once, renders the single `<audio>` element that plays the
 * remote party's media, and exposes `{ answer, dismiss, hangup, toggleMute }`
 * to every consumer (the incoming-call dialog, the floating dock, and the
 * per-conversation inbox-item buttons) via context. Mount it once, high
 * enough in the tree to wrap every consumer — see `ChatLayout`.
 *
 * Also the single owner of the "replace the active call?" confirmation
 * dialog (Workstream 4 of the multi-ring design): every Answer control in
 * the app — the call panel, the ring list, and every inbox row — goes
 * through this context's `answer`, so the confirmation is asked exactly
 * once here rather than duplicated in each caller. The underlying
 * end-then-promote-then-answer flow (including awaiting the server's
 * confirmed hangup before ever promoting the new call) lives in
 * `useWhatsappVoipCall`'s own `answer` — this dialog only gates WHEN that
 * flow is allowed to run.
 */
export function WhatsappVoipCallProvider({
  children,
}: {
  children: ReactNode
}) {
  const t = useTranslations()
  const {
    remoteAudioRef,
    answer: answerCall,
    dismiss,
    hangup,
    toggleMute,
    dismissEnded,
    startOutbound,
  } = useWhatsappVoipCall()
  const [replacementTarget, setReplacementTarget] =
    useState<ReplacementTarget | null>(null)

  const answer = useCallback(
    async (whatsappCallId?: string) => {
      const state = useWhatsappVoipCallStore.getState()
      const targetId = whatsappCallId ?? state.call?.whatsappCallId
      if (!targetId) {
        return
      }
      const current = state.call
      const slotIsEngaged = !isCallSlotFree(current)
      // No replacement to confirm: either the slot is free, or the target
      // already IS the slot's own call (the common path — the panel's
      // Answer button, or a basket entry taking an already-free slot).
      if (!slotIsEngaged || current?.whatsappCallId === targetId) {
        await answerCall(targetId)
        return
      }
      // FIX 10: don't offer the replacement dialog while the slot's own call
      // already has an answer in flight — `useWhatsappVoipCall.answer`'s
      // `answeringIdRef` mutex is held for it the instant `answerIncoming`
      // starts (the store already reflects this: the call moved to
      // `answering`). Confirming the dialog would call `answerCall` again
      // for a DIFFERENT id, which that mutex silently rejects — the dialog
      // would close with no feedback and nothing would happen. Better to
      // never offer a confirmation that can only confirm into a no-op.
      if (current?.phase === WhatsappVoipCallPhase.answering) {
        return
      }
      const incoming = state.ringingCalls.find(
        (entry) => entry.whatsappCallId === targetId,
      )
      if (!(incoming && current)) {
        // Not a real, currently-offered call (already answered elsewhere,
        // expired, or dismissed) — nothing to confirm or answer.
        return
      }
      setReplacementTarget({
        currentCallId: current.whatsappCallId,
        currentContactName:
          current.contactName ?? t("whatsapp.calls.unknownCaller"),
        incomingCallId: incoming.whatsappCallId,
        incomingContactName:
          incoming.contactName ?? t("whatsapp.calls.unknownCaller"),
      })
    },
    [answerCall, t],
  )

  // The offer can lapse on Meta's deadline, or be answered by a colleague,
  // while the agent is still reading this dialog. Closing it the moment that
  // happens is the real fix; this second check covers the last few
  // milliseconds, because without it `answer` returns silently and the agent
  // is left believing they just took the call.
  const confirmReplacement = useCallback(() => {
    const target = replacementTarget
    setReplacementTarget(null)
    if (!target) {
      return
    }
    const stillRinging = useWhatsappVoipCallStore
      .getState()
      .ringingCalls.some(
        (entry) => entry.whatsappCallId === target.incomingCallId,
      )
    if (!stillRinging) {
      toast.error(t("whatsapp.calls.errors.callNoLongerRinging"))
      return
    }
    answerCall(target.incomingCallId).catch((error: unknown) => {
      logger.error(
        { err: error, whatsappCallId: target.incomingCallId },
        "WhatsApp VoIP replacement answer failed",
      )
    })
  }, [answerCall, replacementTarget, t])

  // Auto-close the confirmation when the offer it names stops ringing —
  // expired on its own deadline, dismissed, or won by another agent. A stale
  // confirmation on screen can only ever confirm into a no-op.
  const ringingCalls = useWhatsappVoipCallStore((state) => state.ringingCalls)
  useEffect(() => {
    if (!replacementTarget) {
      return
    }
    const stillRinging = ringingCalls.some(
      (entry) => entry.whatsappCallId === replacementTarget.incomingCallId,
    )
    if (!stillRinging) {
      setReplacementTarget(null)
    }
  }, [ringingCalls, replacementTarget])

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
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setReplacementTarget(null)
          }
        }}
        open={replacementTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {replacementTarget &&
                t("whatsapp.calls.replaceConfirm.title", {
                  current: replacementTarget.currentContactName,
                })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {replacementTarget &&
                t("whatsapp.calls.replaceConfirm.description", {
                  current: replacementTarget.currentContactName,
                  incoming: replacementTarget.incomingContactName,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("whatsapp.calls.replaceConfirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmReplacement}
            >
              {t("whatsapp.calls.replaceConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
